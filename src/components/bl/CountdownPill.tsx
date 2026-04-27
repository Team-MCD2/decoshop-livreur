import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Timer } from 'lucide-react';
import { cn } from '@/utils/cn';

interface CountdownPillProps {
  expiresAt: string;
  /** Callback déclenché à expiration (passe en mode 0:00). */
  onExpire?: () => void;
  className?: string;
}

/**
 * Pill animée affichant le compte-à-rebours jusqu'à `expiresAt`.
 * - Vert > 5 min, jaune 2-5 min, rouge < 2 min, gris si expiré
 * - Refresh chaque seconde
 */
export function CountdownPill({ expiresAt, onExpire, className }: CountdownPillProps) {
  const { t } = useTranslation();
  const [secondsLeft, setSecondsLeft] = useState(() => computeSecondsLeft(expiresAt));

  useEffect(() => {
    const tick = () => {
      const s = computeSecondsLeft(expiresAt);
      setSecondsLeft(s);
      if (s <= 0) onExpire?.();
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt]);

  const isExpired = secondsLeft <= 0;
  const isCritical = secondsLeft > 0 && secondsLeft < 120;
  const isWarning = secondsLeft >= 120 && secondsLeft < 300;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold tabular-nums',
        isExpired && 'bg-cream-100 text-muted',
        isCritical && 'bg-red-100 text-red-700 animate-pulse',
        isWarning && 'bg-yellow-200 text-ink',
        !isExpired && !isCritical && !isWarning && 'bg-green-100 text-green-700',
        className,
      )}
      aria-live="polite"
    >
      <Timer className="w-3 h-3" aria-hidden />
      {isExpired ? t('signature.expired') : t('signature.expires_in', { time: formatTime(secondsLeft) })}
    </span>
  );
}

function computeSecondsLeft(expiresAt: string): number {
  const expMs = new Date(expiresAt).getTime();
  return Math.max(0, Math.floor((expMs - Date.now()) / 1000));
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
