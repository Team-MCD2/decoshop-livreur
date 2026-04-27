import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useGeolocation } from '@/hooks/useGeolocation';

interface MockGeolocation {
  getCurrentPosition: ReturnType<typeof vi.fn>;
  watchPosition: ReturnType<typeof vi.fn>;
  clearWatch: ReturnType<typeof vi.fn>;
}

describe('useGeolocation', () => {
  let mockGeo: MockGeolocation;

  beforeEach(() => {
    mockGeo = {
      getCurrentPosition: vi.fn(),
      watchPosition: vi.fn(),
      clearWatch: vi.fn(),
    };
    Object.defineProperty(global.navigator, 'geolocation', {
      value: mockGeo,
      configurable: true,
    });
  });

  it('démarre en idle', () => {
    const { result } = renderHook(() => useGeolocation());
    expect(result.current.status).toBe('idle');
    expect(result.current.position).toBeNull();
  });

  it('request() → success → status=active + position', async () => {
    mockGeo.getCurrentPosition.mockImplementation((onSuccess) =>
      onSuccess({
        coords: {
          latitude: 43.6047,
          longitude: 1.4442,
          accuracy: 12.5,
          heading: 90,
          speed: 5.5,
          altitude: null,
          altitudeAccuracy: null,
        },
        timestamp: 1_700_000_000_000,
      } as GeolocationPosition),
    );

    const { result } = renderHook(() => useGeolocation());
    act(() => {
      result.current.request();
    });

    await waitFor(() => expect(result.current.status).toBe('active'));
    expect(result.current.position).toEqual({
      lat: 43.6047,
      lng: 1.4442,
      accuracy_m: 13,
      heading_deg: 90,
      speed_kmh: 20, // 5.5 m/s × 3.6 = 19.8 → arrondi 20
      timestamp: 1_700_000_000_000,
    });
  });

  it('request() → permission denied → status=denied', async () => {
    mockGeo.getCurrentPosition.mockImplementation((_onSuccess, onError) =>
      onError({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }),
    );

    const { result } = renderHook(() => useGeolocation());
    act(() => {
      result.current.request();
    });

    await waitFor(() => expect(result.current.status).toBe('denied'));
    expect(result.current.error).toBe('PERMISSION_DENIED');
  });

  it('watch=true → appelle watchPosition au mount + clearWatch au unmount', () => {
    mockGeo.watchPosition.mockReturnValue(42);

    const { unmount } = renderHook(() => useGeolocation({ watch: true }));
    expect(mockGeo.watchPosition).toHaveBeenCalledTimes(1);

    unmount();
    expect(mockGeo.clearWatch).toHaveBeenCalledWith(42);
  });

  it('navigateur sans geolocation → status=unavailable', () => {
    Object.defineProperty(global.navigator, 'geolocation', {
      value: undefined,
      configurable: true,
    });

    const { result } = renderHook(() => useGeolocation({ watch: true }));
    expect(result.current.status).toBe('unavailable');
  });
});
