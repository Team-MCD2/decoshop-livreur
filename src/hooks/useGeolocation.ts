import { useEffect, useRef, useState } from 'react';

export interface GeoPosition {
  lat: number;
  lng: number;
  accuracy_m: number;
  heading_deg: number | null;
  speed_kmh: number | null;
  timestamp: number;
}

export type GeoStatus = 'idle' | 'requesting' | 'active' | 'denied' | 'unavailable' | 'error';

interface UseGeolocationOptions {
  /** Active automatiquement le tracking (watchPosition) au mount. */
  watch?: boolean;
  /** Délai max pour l'obtention de la position (ms). */
  timeout?: number;
  /** Précision élevée (consomme plus de batterie). */
  enableHighAccuracy?: boolean;
  /** Cache de position côté navigateur (ms). */
  maximumAge?: number;
}

/**
 * Wrapper React autour de navigator.geolocation.
 *
 * - Si `watch: true` → utilise `watchPosition` (live updates)
 * - Sinon → expose `request()` pour un single fix
 *
 * Gère gracieusement le refus utilisateur, l'absence d'API, et les erreurs.
 */
export function useGeolocation(options: UseGeolocationOptions = {}) {
  const { watch = false, timeout = 15_000, enableHighAccuracy = true, maximumAge = 5_000 } = options;
  const [status, setStatus] = useState<GeoStatus>('idle');
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const handleSuccess = (pos: GeolocationPosition) => {
    setPosition({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy_m: Math.round(pos.coords.accuracy),
      heading_deg: pos.coords.heading,
      speed_kmh: pos.coords.speed != null ? Math.round(pos.coords.speed * 3.6) : null,
      timestamp: pos.timestamp,
    });
    setStatus('active');
    setError(null);
  };

  const handleError = (err: GeolocationPositionError) => {
    if (err.code === err.PERMISSION_DENIED) {
      setStatus('denied');
      setError('PERMISSION_DENIED');
    } else if (err.code === err.POSITION_UNAVAILABLE) {
      setStatus('unavailable');
      setError('POSITION_UNAVAILABLE');
    } else {
      setStatus('error');
      setError(err.message || 'TIMEOUT');
    }
  };

  const request = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable');
      return;
    }
    setStatus('requesting');
    navigator.geolocation.getCurrentPosition(handleSuccess, handleError, {
      timeout,
      enableHighAccuracy,
      maximumAge,
    });
  };

  useEffect(() => {
    if (!watch) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable');
      return;
    }
    setStatus('requesting');
    const id = navigator.geolocation.watchPosition(handleSuccess, handleError, {
      timeout,
      enableHighAccuracy,
      maximumAge,
    });
    watchIdRef.current = id;
    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch, timeout, enableHighAccuracy, maximumAge]);

  return { status, position, error, request } as const;
}
