import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/utils/cn';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const inputId = id ?? `input-${Math.random().toString(36).slice(2, 9)}`;
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-ink">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'block w-full px-4 py-3 rounded-xl',
            'bg-white border border-line',
            'text-ink placeholder:text-muted',
            'transition-colors duration-200',
            'focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/20',
            'disabled:opacity-50 disabled:bg-cream',
            error && 'border-danger focus:border-danger focus:ring-danger/20',
            className,
          )}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          {...props}
        />
        {error && (
          <p id={`${inputId}-error`} className="text-sm text-danger">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={`${inputId}-hint`} className="text-sm text-muted">
            {hint}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';
