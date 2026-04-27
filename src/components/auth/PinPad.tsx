import { useEffect, useState } from 'react';
import { Delete } from 'lucide-react';
import { cn } from '@/utils/cn';

interface PinPadProps {
  /** Longueur cible (4 ou 6) */
  length?: 4 | 6;
  /** Appelé automatiquement quand la longueur cible est atteinte */
  onComplete?: (pin: string) => void;
  /** Erreur à afficher (déclenche shake animation) */
  error?: string;
  /** Désactive le pad pendant validation */
  disabled?: boolean;
  className?: string;
}

/**
 * Composant PIN pad numérique mobile-friendly.
 * Tap targets ≥ 60px, vibration haptique, accessibilité clavier.
 */
export function PinPad({
  length = 4,
  onComplete,
  error,
  disabled = false,
  className,
}: PinPadProps) {
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (error) {
      setShake(true);
      setPin('');
      try {
        navigator.vibrate?.([60, 30, 60]);
      } catch {
        // Vibration not supported
      }
      const t = setTimeout(() => setShake(false), 400);
      return () => clearTimeout(t);
    }
  }, [error]);

  useEffect(() => {
    if (pin.length === length) {
      onComplete?.(pin);
    }
  }, [pin, length, onComplete]);

  const handleDigit = (d: string) => {
    if (disabled) return;
    if (pin.length >= length) return;
    setPin((p) => p + d);
    try {
      navigator.vibrate?.(10);
    } catch {
      // Vibration not supported
    }
  };

  const handleDelete = () => {
    if (disabled) return;
    setPin((p) => p.slice(0, -1));
  };

  // Support clavier (numéros + Backspace)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (disabled) return;
      if (/^[0-9]$/.test(e.key)) handleDigit(e.key);
      else if (e.key === 'Backspace') handleDelete();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, pin]);

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <div className={cn('flex flex-col items-center gap-6', className)}>
      {/* Dots */}
      <div className={cn('flex gap-3', shake && 'animate-shake')}>
        {Array.from({ length }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'w-4 h-4 rounded-full border-2 transition-colors',
              i < pin.length ? 'bg-navy border-navy' : 'bg-transparent border-line',
              error && 'border-danger',
            )}
            aria-label={i < pin.length ? 'rempli' : 'vide'}
          />
        ))}
      </div>

      {error && (
        <p className="text-sm text-danger font-medium" role="alert">
          {error}
        </p>
      )}

      {/* Pad numérique */}
      <div className="grid grid-cols-3 gap-3" aria-label="Clavier PIN">
        {digits.map((d) => (
          <PinKey key={d} digit={d} onPress={handleDigit} disabled={disabled} />
        ))}
        <div /> {/* Spacer */}
        <PinKey digit="0" onPress={handleDigit} disabled={disabled} />
        <button
          type="button"
          onClick={handleDelete}
          disabled={disabled || pin.length === 0}
          aria-label="Effacer le dernier chiffre"
          className={cn(
            'w-16 h-16 rounded-full',
            'flex items-center justify-center',
            'text-ink bg-transparent',
            'hover:bg-cream-100 active:bg-line',
            'transition-colors duration-150',
            'disabled:opacity-30',
          )}
        >
          <Delete className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}

function PinKey({
  digit,
  onPress,
  disabled,
}: {
  digit: string;
  onPress: (d: string) => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onPress(digit)}
      disabled={disabled}
      aria-label={`Chiffre ${digit}`}
      className={cn(
        'w-16 h-16 rounded-full',
        'flex items-center justify-center',
        'text-2xl font-display font-bold text-ink',
        'bg-white border border-line',
        'hover:bg-cream-100 hover:border-navy active:scale-95',
        'transition-all duration-150',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'shadow-sm',
      )}
    >
      {digit}
    </button>
  );
}
