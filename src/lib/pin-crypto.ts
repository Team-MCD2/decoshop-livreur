/**
 * Système de PIN local pour le livreur
 * (RG-271 plan_v3_livreur.md)
 *
 * Sécurité :
 * - PIN 4 à 6 chiffres
 * - Hash via PBKDF2-HMAC-SHA-256, 100 000 itérations + salt unique par device
 * - Stockage local (localStorage) — JAMAIS en clair
 * - Hash mirror côté Supabase (`profiles.pin_hash`) pour cross-device sync futur
 *
 * Note : ce n'est PAS un remplacement pour le password Supabase.
 * Le PIN est une commodité pour ré-déverrouiller rapidement l'app.
 * Le refresh token Supabase est stocké en parallèle et utilisé après vérification PIN.
 *
 * Pourquoi PBKDF2 au lieu d'une boucle SHA-256 ?
 * - Algorithme standard pour password-based key derivation (RFC 2898)
 * - 1 appel natif — pas 10 000 Promises microtask overhead
 * - Implémentation Web Crypto API native dans tous les navigateurs modernes
 */

const STORAGE_KEY_HASH = 'decoshop-livreur-pin-hash';
const STORAGE_KEY_SALT = 'decoshop-livreur-pin-salt';
const STORAGE_KEY_USER = 'decoshop-livreur-pin-user-id';

const SALT_BYTES = 16;
const PBKDF2_ITERATIONS = 100_000;
const HASH_BITS = 256;

function bytesToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Hash un PIN avec PBKDF2-HMAC-SHA-256 (RFC 2898).
 * Tout le coût computationnel est dans 1 appel natif (pas de boucle JS).
 */
async function hashPinWithSalt(
  pin: string,
  salt: Uint8Array,
  iterations = PBKDF2_ITERATIONS,
): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    HASH_BITS,
  );
  return bytesToHex(bits);
}

/**
 * Vérifie qu'un PIN est valide (4-6 chiffres uniquement).
 */
export function isValidPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

/**
 * Crée un PIN pour le livreur. Génère un salt unique, hash, puis stocke localement.
 * @returns { hash, salt } — pour synchronisation Supabase si besoin (champ profiles.pin_hash).
 */
export async function setupPin(
  pin: string,
  userId: string,
): Promise<{ hash: string; salt: string }> {
  if (!isValidPin(pin)) {
    throw new Error('PIN invalide : doit contenir 4 à 6 chiffres');
  }

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await hashPinWithSalt(pin, salt);
  const saltHex = bytesToHex(salt.buffer);

  localStorage.setItem(STORAGE_KEY_HASH, hash);
  localStorage.setItem(STORAGE_KEY_SALT, saltHex);
  localStorage.setItem(STORAGE_KEY_USER, userId);

  return { hash, salt: saltHex };
}

/**
 * Vérifie un PIN saisi contre le hash stocké localement.
 */
export async function verifyPin(pin: string): Promise<boolean> {
  if (!isValidPin(pin)) return false;

  const storedHash = localStorage.getItem(STORAGE_KEY_HASH);
  const storedSalt = localStorage.getItem(STORAGE_KEY_SALT);

  if (!storedHash || !storedSalt) return false;

  const salt = hexToBytes(storedSalt);
  const computedHash = await hashPinWithSalt(pin, salt);

  // Comparison constant-time pour éviter timing attacks
  return constantTimeEqual(computedHash, storedHash);
}

/**
 * Comparaison constant-time de deux strings hex.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Indique si un PIN a déjà été configuré sur ce device.
 */
export function hasPinSetup(): boolean {
  return !!(localStorage.getItem(STORAGE_KEY_HASH) && localStorage.getItem(STORAGE_KEY_SALT));
}

/**
 * Récupère l'ID utilisateur associé au PIN local (pour vérifier la cohérence).
 */
export function getPinUserId(): string | null {
  return localStorage.getItem(STORAGE_KEY_USER);
}

/**
 * Supprime le PIN local (après logout).
 */
export function clearPin(): void {
  localStorage.removeItem(STORAGE_KEY_HASH);
  localStorage.removeItem(STORAGE_KEY_SALT);
  localStorage.removeItem(STORAGE_KEY_USER);
}
