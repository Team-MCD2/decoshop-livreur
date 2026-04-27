import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { tv, type VariantProps } from 'tailwind-variants';
import { cn } from '@/utils/cn';

export const buttonStyles = tv({
  base: [
    'inline-flex items-center justify-center gap-2',
    'font-semibold tracking-wide',
    'rounded-full transition-all duration-200',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    'active:scale-[0.98]',
  ],
  variants: {
    intent: {
      primary: 'bg-navy text-white hover:bg-navy-700 hover:-translate-y-px hover:shadow-md',
      yellow: 'bg-yellow text-ink hover:bg-yellow-600 hover:-translate-y-px',
      ghost: 'bg-transparent text-ink border-1.5 border-ink hover:bg-ink hover:text-white',
      ink: 'bg-ink text-white hover:bg-navy',
      outline:
        'bg-white text-ink border border-line hover:border-navy hover:text-navy',
      danger: 'bg-danger text-white hover:bg-red-700',
      subtle: 'bg-navy-50 text-navy hover:bg-navy-100',
    },
    size: {
      sm: 'px-4 py-2 text-sm',
      md: 'px-5 py-3 text-[15px]',
      lg: 'px-6 py-3.5 text-base',
      xl: 'px-8 py-4 text-lg',
      icon: 'w-10 h-10 p-0',
    },
    fullWidth: {
      true: 'w-full',
    },
  },
  defaultVariants: {
    intent: 'primary',
    size: 'md',
  },
});

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonStyles> {
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export function Button({
  className,
  intent,
  size,
  fullWidth,
  loading,
  leftIcon,
  rightIcon,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(buttonStyles({ intent, size, fullWidth }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        leftIcon
      )}
      {children}
      {!loading && rightIcon}
    </button>
  );
}

export interface ButtonLinkProps
  extends AnchorHTMLAttributes<HTMLAnchorElement>,
    VariantProps<typeof buttonStyles> {
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  /** Si true, applique le style disabled (opacity + curseur) sans empêcher le focus. */
  disabled?: boolean;
}

/**
 * Anchor (<a>) stylé comme un Button — pour `tel:`, `sms:`, `mailto:`,
 * liens externes (`target="_blank"`), ou liens internes via `react-router`.
 */
export function ButtonLink({
  className,
  intent,
  size,
  fullWidth,
  leftIcon,
  rightIcon,
  disabled,
  children,
  href,
  ...props
}: ButtonLinkProps) {
  return (
    <a
      className={cn(
        buttonStyles({ intent, size, fullWidth }),
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
      href={disabled ? undefined : href}
      aria-disabled={disabled || undefined}
      {...props}
    >
      {leftIcon}
      {children}
      {rightIcon}
    </a>
  );
}
