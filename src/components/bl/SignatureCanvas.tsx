import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Eraser } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export interface SignatureCanvasHandle {
  /** Renvoie un dataURL PNG (base64) ou null si vide. */
  toDataURL: () => string | null;
  /** Vide le canvas. */
  clear: () => void;
  /** True si l'utilisateur a tracé au moins un trait. */
  isEmpty: () => boolean;
}

interface SignatureCanvasProps {
  /** Hauteur du canvas en pixels (default 200). */
  height?: number;
  /** Couleur du trait. */
  strokeColor?: string;
  /** Épaisseur du trait. */
  strokeWidth?: number;
  /** Callback à chaque modification (pour activer/désactiver le bouton submit). */
  onChange?: (isEmpty: boolean) => void;
}

/**
 * Canvas de signature tactile + souris.
 *
 * Implémentation low-level (pointer events) sans librairie externe.
 * - Gère touch + stylus + mouse via PointerEvent
 * - HiDPI : multiplie par devicePixelRatio pour un rendu net
 * - Resize-aware : recalcule les dimensions au resize
 * - Lissage Bézier quadratique pour un trait propre
 */
export const SignatureCanvas = forwardRef<SignatureCanvasHandle, SignatureCanvasProps>(
  function SignatureCanvas(
    { height = 200, strokeColor = '#0E1116', strokeWidth = 2.5, onChange },
    ref,
  ) {
    const { t } = useTranslation();
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
    const isDrawingRef = useRef(false);
    const lastPointRef = useRef<{ x: number; y: number } | null>(null);
    const hasDrawnRef = useRef(false);
    const [hasInk, setHasInk] = useState(false);

    // Met à l'échelle du canvas selon DPR (HiDPI)
    const setupCanvas = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
      ctxRef.current = ctx;
    }, [strokeColor, strokeWidth]);

    useEffect(() => {
      setupCanvas();
      const onResize = () => setupCanvas();
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    }, [setupCanvas]);

    const getPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const ctx = ctxRef.current;
      if (!ctx) return;
      const p = getPoint(e);
      isDrawingRef.current = true;
      lastPointRef.current = p;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      // Capture pour suivre le pointer même hors canvas
      e.currentTarget.setPointerCapture(e.pointerId);
    };

    const moveDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current) return;
      const ctx = ctxRef.current;
      const last = lastPointRef.current;
      if (!ctx || !last) return;
      const p = getPoint(e);

      // Bézier quadratique : point de contrôle = last, point fin = midpoint
      const midX = (last.x + p.x) / 2;
      const midY = (last.y + p.y) / 2;
      ctx.quadraticCurveTo(last.x, last.y, midX, midY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(midX, midY);

      lastPointRef.current = p;
      if (!hasDrawnRef.current) {
        hasDrawnRef.current = true;
        setHasInk(true);
        onChange?.(false);
      }
    };

    const endDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;
      lastPointRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore : releasePointerCapture peut throw si déjà relâché
      }
    };

    const clear = useCallback(() => {
      const canvas = canvasRef.current;
      const ctx = ctxRef.current;
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      hasDrawnRef.current = false;
      setHasInk(false);
      onChange?.(true);
    }, [onChange]);

    useImperativeHandle(
      ref,
      () => ({
        toDataURL: () => {
          if (!hasDrawnRef.current) return null;
          return canvasRef.current?.toDataURL('image/png') ?? null;
        },
        clear,
        isEmpty: () => !hasDrawnRef.current,
      }),
      [clear],
    );

    return (
      <div className="space-y-2">
        <div className="relative">
          <canvas
            ref={canvasRef}
            style={{ height: `${height}px`, touchAction: 'none' }}
            className="w-full bg-white rounded-2xl border-2 border-line cursor-crosshair"
            onPointerDown={startDraw}
            onPointerMove={moveDraw}
            onPointerUp={endDraw}
            onPointerCancel={endDraw}
            aria-label="Zone de signature"
          />
          {!hasInk && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-muted text-sm font-medium">
              {t('signature.draw_here')}
            </div>
          )}
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            intent="ghost"
            size="sm"
            leftIcon={<Eraser className="w-4 h-4" />}
            onClick={clear}
            disabled={!hasInk}
          >
            {t('signature.clear')}
          </Button>
        </div>
      </div>
    );
  },
);
