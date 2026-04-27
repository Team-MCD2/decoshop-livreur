import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  variant?: 'default' | 'navy' | 'cream' | 'ghost';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export function Card({
  children,
  className,
  variant = 'default',
  padding = 'md',
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-[14px] transition-shadow duration-200',
        variant === 'default' && 'bg-white border border-line shadow-sm',
        variant === 'navy' && 'bg-navy text-white',
        variant === 'cream' && 'bg-cream-100 border border-line',
        variant === 'ghost' && 'bg-transparent',
        padding === 'none' && 'p-0',
        padding === 'sm' && 'p-3',
        padding === 'md' && 'p-4',
        padding === 'lg' && 'p-6',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mb-3', className)}>{children}</div>;
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={cn('text-lg font-display font-bold text-ink', className)}>{children}</h3>
  );
}

export function CardSubtitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <p className={cn('text-sm text-muted', className)}>{children}</p>;
}
