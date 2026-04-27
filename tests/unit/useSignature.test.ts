import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createElement } from 'react';

// =====================================================================
// Mock du client Supabase (rpc + functions.invoke)
// =====================================================================
const mockRpc = vi.fn();
const mockInvoke = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
  },
}));

// Imports sous test (après le mock)
import {
  useExpirationCountdown,
  useRequestSignature,
  useInvalidateSignature,
} from '@/hooks/useSignature';

// =====================================================================
// useExpirationCountdown — helper pur
// =====================================================================
describe('useExpirationCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-04-27T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renvoie null si expiresAt est falsy', () => {
    expect(useExpirationCountdown(null)).toBeNull();
    expect(useExpirationCountdown(undefined)).toBeNull();
    expect(useExpirationCountdown('')).toBeNull();
  });

  it('renvoie le nombre de secondes restantes', () => {
    const future = new Date('2025-04-27T10:05:00Z').toISOString();
    expect(useExpirationCountdown(future)).toBe(300);
  });

  it('renvoie 0 si déjà expiré', () => {
    const past = new Date('2025-04-27T09:00:00Z').toISOString();
    expect(useExpirationCountdown(past)).toBe(0);
  });

  it('arrondit vers le bas (floor)', () => {
    // 1500 ms dans le futur → 1 seconde
    const exp = new Date('2025-04-27T10:00:01.500Z').toISOString();
    expect(useExpirationCountdown(exp)).toBe(1);
  });
});

// =====================================================================
// Wrapper React Query partagé
// =====================================================================
function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

const FAKE_TOKEN = 'a'.repeat(64);

const RPC_OK_RESPONSE = {
  token: FAKE_TOKEN,
  bl_id: 'bl-1',
  url_path: `/sign/${FAKE_TOKEN}`,
  date_emission: '2025-04-27T10:00:00Z',
  date_expiration: '2025-04-27T10:10:00Z',
  ttl_minutes: 10,
  email_client: 'client@example.com',
};

// =====================================================================
// useRequestSignature — chaining RPC → Edge Function
// =====================================================================
describe('useRequestSignature', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockInvoke.mockReset();
  });

  it('email_status="sent" quand RPC + Edge Function réussissent', async () => {
    mockRpc.mockResolvedValueOnce({ data: RPC_OK_RESPONSE, error: null });
    mockInvoke.mockResolvedValueOnce({
      data: { success: true, recipient: 'client@example.com', message_id: 'msg_123' },
      error: null,
    });

    const { result } = renderHook(() => useRequestSignature(), { wrapper: makeWrapper() });

    const r = await result.current.mutateAsync({ blId: 'bl-1' });

    expect(mockRpc).toHaveBeenCalledWith('request_signature', {
      p_bl_id: 'bl-1',
      p_ttl_minutes: 10,
    });
    expect(mockInvoke).toHaveBeenCalledWith('send-signature-email', {
      body: { token: FAKE_TOKEN, language: 'fr' },
    });
    expect(r.email_status).toBe('sent');
    expect(r.email_message_id).toBe('msg_123');
    expect(r.email_error).toBeNull();
    expect(r.token).toBe(FAKE_TOKEN);
  });

  it('email_status="failed" quand l\'Edge Function renvoie une erreur', async () => {
    mockRpc.mockResolvedValueOnce({ data: RPC_OK_RESPONSE, error: null });
    mockInvoke.mockResolvedValueOnce({
      data: { success: false, error: 'EMAIL_SEND_FAILED' },
      error: null,
    });

    const { result } = renderHook(() => useRequestSignature(), { wrapper: makeWrapper() });

    const r = await result.current.mutateAsync({ blId: 'bl-1' });

    expect(r.email_status).toBe('failed');
    expect(r.email_error).toBe('EMAIL_SEND_FAILED');
    expect(r.token).toBe(FAKE_TOKEN); // token toujours valide même si email KO
  });

  it('email_status="not_configured" si Resend pas configuré', async () => {
    mockRpc.mockResolvedValueOnce({ data: RPC_OK_RESPONSE, error: null });
    mockInvoke.mockResolvedValueOnce({
      data: { success: false, error: 'RESEND_NOT_CONFIGURED' },
      error: null,
    });

    const { result } = renderHook(() => useRequestSignature(), { wrapper: makeWrapper() });

    const r = await result.current.mutateAsync({ blId: 'bl-1' });

    expect(r.email_status).toBe('not_configured');
    expect(r.email_error).toBe('RESEND_NOT_CONFIGURED');
  });

  it('email_status="skipped" quand sendEmail=false (mode canvas direct)', async () => {
    mockRpc.mockResolvedValueOnce({ data: RPC_OK_RESPONSE, error: null });

    const { result } = renderHook(() => useRequestSignature(), { wrapper: makeWrapper() });

    const r = await result.current.mutateAsync({ blId: 'bl-1', sendEmail: false });

    expect(r.email_status).toBe('skipped');
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('passe la langue à la fois au RPC et à la Edge Function', async () => {
    mockRpc.mockResolvedValueOnce({ data: RPC_OK_RESPONSE, error: null });
    mockInvoke.mockResolvedValueOnce({
      data: { success: true, message_id: null },
      error: null,
    });

    const { result } = renderHook(() => useRequestSignature(), { wrapper: makeWrapper() });

    await result.current.mutateAsync({ blId: 'bl-1', language: 'ar' });

    expect(mockInvoke).toHaveBeenCalledWith('send-signature-email', {
      body: { token: FAKE_TOKEN, language: 'ar' },
    });
  });

  it('throw si le RPC échoue (le token n\'est jamais retourné)', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'CLIENT_HAS_NO_EMAIL' },
    });

    const { result } = renderHook(() => useRequestSignature(), { wrapper: makeWrapper() });

    await expect(result.current.mutateAsync({ blId: 'bl-1' })).rejects.toMatchObject({
      message: 'CLIENT_HAS_NO_EMAIL',
    });
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

// =====================================================================
// useInvalidateSignature — admin/vendeur cancellation
// =====================================================================
describe('useInvalidateSignature', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockInvoke.mockReset();
  });

  it('appelle invalidate_signature avec p_bl_id et p_motif', async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        success: true,
        bl_id: 'bl-1',
        motif: 'Erreur saisie',
        invalidated_at: '2025-04-27T10:00:00Z',
        invalidated_by: 'user-admin',
      },
      error: null,
    });

    const { result } = renderHook(() => useInvalidateSignature(), {
      wrapper: makeWrapper(),
    });

    const r = await result.current.mutateAsync({ blId: 'bl-1', motif: 'Erreur saisie' });

    expect(mockRpc).toHaveBeenCalledWith('invalidate_signature', {
      p_bl_id: 'bl-1',
      p_motif: 'Erreur saisie',
    });
    expect(r.success).toBe(true);
    expect(r.motif).toBe('Erreur saisie');
  });

  it('motif=null par défaut', async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        success: true,
        bl_id: 'bl-1',
        motif: null,
        invalidated_at: '2025-04-27T10:00:00Z',
        invalidated_by: 'user-admin',
      },
      error: null,
    });

    const { result } = renderHook(() => useInvalidateSignature(), {
      wrapper: makeWrapper(),
    });

    await result.current.mutateAsync({ blId: 'bl-1' });

    expect(mockRpc).toHaveBeenCalledWith('invalidate_signature', {
      p_bl_id: 'bl-1',
      p_motif: null,
    });
  });

  it('throw FORBIDDEN si l\'utilisateur n\'a pas le bon rôle', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'FORBIDDEN' },
    });

    const { result } = renderHook(() => useInvalidateSignature(), {
      wrapper: makeWrapper(),
    });

    await expect(result.current.mutateAsync({ blId: 'bl-1' })).rejects.toMatchObject({
      message: 'FORBIDDEN',
    });
  });

  it('isPending passe à true pendant l\'appel', async () => {
    let resolve!: (v: unknown) => void;
    mockRpc.mockReturnValueOnce(
      new Promise((res) => {
        resolve = res;
      }),
    );

    const { result } = renderHook(() => useInvalidateSignature(), {
      wrapper: makeWrapper(),
    });

    const promise = result.current.mutateAsync({ blId: 'bl-1' });
    await waitFor(() => expect(result.current.isPending).toBe(true));

    resolve({
      data: {
        success: true,
        bl_id: 'bl-1',
        motif: null,
        invalidated_at: '2025-04-27T10:00:00Z',
        invalidated_by: 'user-admin',
      },
      error: null,
    });
    await promise;
    await waitFor(() => expect(result.current.isPending).toBe(false));
  });
});
