import { cn } from '@/utils/cn';

interface LogoProps {
  size?: number;
  variant?: 'full' | 'mark';
  className?: string;
}

/**
 * Logo DecoShop — décliné en 2 versions :
 * - 'full'  : cercle navy + texte DECO/SHOP en jaune (Playfair 900)
 * - 'mark'  : variante carrée avec "DS" pour favicon/app icon
 *
 * Source visuelle : decoshop-v3/assets/img/logo.svg + logo-mark.svg
 */
export function Logo({ size = 48, variant = 'full', className }: LogoProps) {
  if (variant === 'mark') {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 200 200"
        width={size}
        height={size}
        aria-hidden="true"
        className={cn('inline-block', className)}
      >
        <circle cx="100" cy="100" r="95" fill="#1E3A8A" />
        <g
          fontFamily="'Playfair Display', Arial, sans-serif"
          fontWeight="900"
          fill="#FACC15"
          textAnchor="middle"
        >
          <text x="100" y="115" fontSize="60" letterSpacing="2">
            DS
          </text>
        </g>
      </svg>
    );
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 200"
      width={size}
      height={size}
      role="img"
      aria-label="DecoShop Toulouse"
      className={cn('inline-block', className)}
    >
      <defs>
        <clipPath id="decoshop-logo-clip">
          <circle cx="100" cy="100" r="95" />
        </clipPath>
      </defs>
      <circle cx="100" cy="100" r="95" fill="#1E3A8A" />
      <g
        clipPath="url(#decoshop-logo-clip)"
        fontFamily="'Playfair Display', 'DM Sans', Arial, sans-serif"
        fontWeight="900"
        fill="#FACC15"
        textAnchor="middle"
      >
        <text x="100" y="92" fontSize="44" letterSpacing="1">
          DECO
        </text>
        <text x="100" y="138" fontSize="44" letterSpacing="1">
          SHOP
        </text>
      </g>
      <circle cx="100" cy="100" r="93" fill="none" stroke="#FACC15" strokeWidth="1.5" opacity="0.25" />
    </svg>
  );
}

/**
 * Brand block : logo + nom + tagline (utilisé dans header, login, etc.)
 */
export function BrandBlock({ logoSize = 56, className }: { logoSize?: number; className?: string }) {
  return (
    <div className={cn('inline-flex items-center gap-3', className)}>
      <Logo size={logoSize} variant="full" />
      <div className="flex flex-col leading-tight">
        <span className="font-display font-black text-2xl text-navy tracking-wide">
          DECOSHOP
        </span>
        <span className="font-body text-[10px] uppercase tracking-[0.28em] text-yellow-700 font-bold">
          Livreur · Toulouse
        </span>
      </div>
    </div>
  );
}
