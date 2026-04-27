import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useGeolocation, type GeoPosition } from '@/hooks/useGeolocation';

interface UseGPSTrackingOptions {
  /** ID livreur (le tracking est lié au profil). */
  driverId: string | undefined;
  /** ID BL en cours (optionnel — permet de relier la position à une livraison). */
  blId?: string | null;
  /** Active réellement le tracking — RGPD : doit être true uniquement quand la livraison est en route. */
  enabled: boolean;
  /** Intervalle minimum entre 2 enregistrements en base (ms, default 30s). */
  minIntervalMs?: number;
  /** Distance minimale (mètres) pour déclencher un nouvel enregistrement. */
  minDistanceM?: number;
}

/**
 * Calcule la distance haversine entre 2 points (mètres).
 */
function haversineMeters(a: GeoPosition, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Active le watchPosition + insère périodiquement la position en base
 * (table `driver_locations`). RGPD : seulement si `enabled=true`
 * (typiquement uniquement quand le BL est `en_route`).
 *
 * Throttling : ne pousse en base que tous les `minIntervalMs` OU
 * si déplacement > `minDistanceM`. Réduit la pression DB et la batterie.
 */
export function useGPSTracking({
  driverId,
  blId,
  enabled,
  minIntervalMs = 30_000,
  minDistanceM = 25,
}: UseGPSTrackingOptions) {
  const { status, position, error } = useGeolocation({ watch: enabled });
  const lastPushedRef = useRef<{ pos: GeoPosition; at: number } | null>(null);

  useEffect(() => {
    if (!enabled || !driverId || !position) return;

    const now = Date.now();
    const last = lastPushedRef.current;
    const elapsedMs = last ? now - last.at : Infinity;
    const movedM = last ? haversineMeters(position, last.pos) : Infinity;

    // Throttle : on ne pousse que si on a bougé OU si le timer est écoulé
    if (elapsedMs < minIntervalMs && movedM < minDistanceM) return;

    lastPushedRef.current = { pos: position, at: now };

    // Insert async, sans await (best-effort, pas critique en cas d'échec réseau)
    void (async () => {
      try {
        const payload = {
          driver_id: driverId,
          bl_id: blId ?? null,
          lat: position.lat,
          lng: position.lng,
          accuracy_m: position.accuracy_m,
          heading_deg: position.heading_deg,
          speed_kmh: position.speed_kmh,
          recorded_at: new Date(position.timestamp).toISOString(),
        };
        const { error: dbErr } = await supabase.from('driver_locations').insert(payload);
        if (dbErr) {
          // eslint-disable-next-line no-console
          console.warn('[gps] insert failed', dbErr.message);
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[gps] insert exception', e);
      }
    })();
  }, [enabled, driverId, blId, position, minIntervalMs, minDistanceM]);

  return { status, position, error } as const;
}
