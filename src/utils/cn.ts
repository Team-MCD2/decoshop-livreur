import { clsx, type ClassValue } from 'clsx';

/**
 * Helper pour merger des classes Tailwind sans conflits.
 * Wrapper autour de clsx pour cohérence d'API.
 */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
