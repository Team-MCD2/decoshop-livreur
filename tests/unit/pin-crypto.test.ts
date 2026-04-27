import { describe, it, expect, beforeEach } from 'vitest';
import {
  isValidPin,
  setupPin,
  verifyPin,
  hasPinSetup,
  clearPin,
  getPinUserId,
} from '@/lib/pin-crypto';

const TEST_USER_ID = 'test-user-uuid-123';

describe('pin-crypto', () => {
  beforeEach(() => {
    clearPin();
  });

  describe('isValidPin', () => {
    it('valide un PIN à 4 chiffres', () => {
      expect(isValidPin('1234')).toBe(true);
    });

    it('valide un PIN à 6 chiffres', () => {
      expect(isValidPin('123456')).toBe(true);
    });

    it('rejette un PIN < 4 chiffres', () => {
      expect(isValidPin('123')).toBe(false);
    });

    it('rejette un PIN > 6 chiffres', () => {
      expect(isValidPin('1234567')).toBe(false);
    });

    it('rejette un PIN avec des lettres', () => {
      expect(isValidPin('12ab')).toBe(false);
    });

    it('rejette un PIN vide', () => {
      expect(isValidPin('')).toBe(false);
    });
  });

  describe('setupPin & verifyPin', () => {
    it('configure un PIN puis le vérifie correctement', async () => {
      await setupPin('1234', TEST_USER_ID);
      expect(hasPinSetup()).toBe(true);
      expect(getPinUserId()).toBe(TEST_USER_ID);

      const ok = await verifyPin('1234');
      expect(ok).toBe(true);
    });

    it('rejette un PIN incorrect', async () => {
      await setupPin('1234', TEST_USER_ID);
      const ok = await verifyPin('5678');
      expect(ok).toBe(false);
    });

    it("rejette un PIN invalide même s'il matche le hash (defense in depth)", async () => {
      await setupPin('1234', TEST_USER_ID);
      const ok = await verifyPin('abc');
      expect(ok).toBe(false);
    });

    it('utilise un salt différent à chaque setup (hash différent)', async () => {
      const r1 = await setupPin('1234', TEST_USER_ID);
      const r2 = await setupPin('1234', TEST_USER_ID);
      expect(r1.salt).not.toBe(r2.salt);
      expect(r1.hash).not.toBe(r2.hash);
    });

    it('clearPin supprime tout', async () => {
      await setupPin('1234', TEST_USER_ID);
      expect(hasPinSetup()).toBe(true);
      clearPin();
      expect(hasPinSetup()).toBe(false);
      expect(getPinUserId()).toBeNull();

      const ok = await verifyPin('1234');
      expect(ok).toBe(false);
    });

    it('throw si on essaie de setup avec un PIN invalide', async () => {
      await expect(setupPin('abc', TEST_USER_ID)).rejects.toThrow();
    });
  });
});
