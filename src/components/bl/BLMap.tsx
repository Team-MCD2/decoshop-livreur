import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, AlertTriangle, Crosshair, ExternalLink } from 'lucide-react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Card } from '@/components/ui/Card';
import type { GeoPosition } from '@/hooks/useGeolocation';

interface BLMapProps {
  /** Coordonnées de destination (client). */
  destLat: number | null;
  destLng: number | null;
  /** Position actuelle du livreur (optionnelle, pour afficher 2nd marker). */
  driver?: GeoPosition | null;
  /** Hauteur CSS de la carte (default 280px). */
  heightClass?: string;
}

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
const DEFAULT_STYLE = 'mapbox://styles/mapbox/streets-v12';

export function BLMap({ destLat, destLng, driver, heightClass = 'h-72' }: BLMapProps) {
  const { t, i18n } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const destMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const driverMarkerRef = useRef<mapboxgl.Marker | null>(null);

  const hasToken = !!MAPBOX_TOKEN;
  const hasDestCoords = destLat != null && destLng != null;

  // Init de la map (une seule fois si token + coords disponibles)
  useEffect(() => {
    if (!hasToken || !hasDestCoords || !containerRef.current) return;
    if (mapRef.current) return; // déjà init

    mapboxgl.accessToken = MAPBOX_TOKEN!;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: DEFAULT_STYLE,
      center: [destLng!, destLat!],
      zoom: 14,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left');
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    // Marker destination (yellow + pin)
    const destEl = document.createElement('div');
    destEl.className =
      'flex items-center justify-center w-9 h-9 rounded-full bg-yellow-300 ring-4 ring-yellow-100 shadow-md';
    destEl.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-ink"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>';

    destMarkerRef.current = new mapboxgl.Marker({ element: destEl, anchor: 'bottom' })
      .setLngLat([destLng!, destLat!])
      .addTo(map);

    mapRef.current = map;

    return () => {
      destMarkerRef.current?.remove();
      driverMarkerRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [hasToken, hasDestCoords, destLat, destLng]);

  // Update direction RTL/LTR si la langue change (Mapbox supporte le RTL via plugin)
  useEffect(() => {
    if (!mapRef.current) return;
    // Reflow pour ajuster aux changements de layout (RTL switch)
    const t = window.setTimeout(() => mapRef.current?.resize(), 200);
    return () => window.clearTimeout(t);
  }, [i18n.language]);

  // Marker livreur — créé/déplacé à chaque update de position.
  // Fit-bounds uniquement à la PREMIÈRE apparition du driver pour ne pas
  // saccader la caméra à chaque ping GPS (toutes les 8s).
  useEffect(() => {
    if (!mapRef.current) return;

    // Driver tracking arrêté (ex: BL n'est plus en_route) → retirer le marker
    if (!driver) {
      if (driverMarkerRef.current) {
        driverMarkerRef.current.remove();
        driverMarkerRef.current = null;
      }
      return;
    }

    const isFirstAppearance = !driverMarkerRef.current;

    if (isFirstAppearance) {
      const driverEl = document.createElement('div');
      driverEl.className =
        'flex items-center justify-center w-7 h-7 rounded-full bg-navy ring-4 ring-navy/20 shadow-md';
      driverEl.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="text-yellow"><circle cx="12" cy="12" r="10"/></svg>';
      driverMarkerRef.current = new mapboxgl.Marker({ element: driverEl, anchor: 'center' })
        .setLngLat([driver.lng, driver.lat])
        .addTo(mapRef.current);
    } else {
      driverMarkerRef.current!.setLngLat([driver.lng, driver.lat]);
    }

    // Fit destination + driver dans la viewport — SEULEMENT à la 1ère apparition.
    // Ensuite l'utilisateur garde le contrôle du zoom/pan ; les pings GPS bougent
    // simplement le marker sans recadrer.
    if (isFirstAppearance && hasDestCoords) {
      const bounds = new mapboxgl.LngLatBounds()
        .extend([destLng!, destLat!])
        .extend([driver.lng, driver.lat]);
      mapRef.current.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 600 });
    }
  }, [driver, destLat, destLng, hasDestCoords]);

  // Fallback : pas de token Mapbox — dégradation gracieuse vers Google Maps si
  // les coordonnées du client sont disponibles.
  if (!hasToken) {
    const gmapsHref = hasDestCoords
      ? `https://www.google.com/maps/search/?api=1&query=${destLat},${destLng}`
      : null;
    return (
      <Card variant="cream" padding="lg" className={`${heightClass} flex flex-col items-center justify-center text-center gap-2`}>
        <AlertTriangle className="w-8 h-8 text-yellow-700" />
        <p className="text-sm font-bold text-ink">{t('map.missing_token')}</p>
        <p className="text-xs text-muted max-w-sm">{t('map.missing_token_hint')}</p>
        {gmapsHref && (
          <a
            href={gmapsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-navy text-cream text-xs font-bold hover:bg-navy/90 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            {t('map.open_in_google_maps', 'Ouvrir dans Google Maps')}
          </a>
        )}
      </Card>
    );
  }

  // Fallback : pas de coordonnées GPS pour ce client
  if (!hasDestCoords) {
    return (
      <Card variant="cream" padding="lg" className={`${heightClass} flex flex-col items-center justify-center text-center`}>
        <MapPin className="w-8 h-8 text-muted opacity-50 mb-2" />
        <p className="text-sm text-muted">{t('map.no_coords')}</p>
      </Card>
    );
  }

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className={`${heightClass} w-full rounded-2xl overflow-hidden border border-line`}
        role="region"
        aria-label="Carte"
      />
      {driver && (
        <div className="absolute top-2 left-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/90 backdrop-blur shadow-sm border border-line text-[11px] font-bold text-navy">
          <Crosshair className="w-3 h-3" />
          {t('bl.gps.accuracy', { m: driver.accuracy_m })}
        </div>
      )}
    </div>
  );
}
