import { describe, it, expect, beforeAll, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/lib/i18n';
import {
  SignatureCanvas,
  type SignatureCanvasHandle,
} from '@/components/bl/SignatureCanvas';

beforeAll(async () => {
  await i18n.changeLanguage('fr');

  // jsdom n'implémente pas getContext('2d') ; on stubbe le minimum requis
  // pour que setupCanvas() ne crash pas et que toDataURL fonctionne.
  if (!HTMLCanvasElement.prototype.getContext) {
    // déjà absent : ajouté ci-dessous
  }
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    scale: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    stroke: vi.fn(),
    clearRect: vi.fn(),
    lineCap: '',
    lineJoin: '',
    strokeStyle: '',
    lineWidth: 0,
  })) as unknown as HTMLCanvasElement['getContext'];

  HTMLCanvasElement.prototype.toDataURL = vi.fn(
    () => 'data:image/png;base64,FAKEPNGDATA',
  );
});

function renderWith(ui: React.ReactElement) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

describe('SignatureCanvas', () => {
  it('rend un canvas avec un placeholder « Signez ici »', () => {
    renderWith(<SignatureCanvas />);
    expect(screen.getByText('Signez ici')).toBeInTheDocument();
    // Le canvas a un aria-label
    expect(screen.getByLabelText('Zone de signature')).toBeInTheDocument();
  });

  it('expose isEmpty()=true initialement via le ref', () => {
    const ref = createRef<SignatureCanvasHandle>();
    renderWith(<SignatureCanvas ref={ref} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.isEmpty()).toBe(true);
  });

  it('expose toDataURL()=null tant que vide', () => {
    const ref = createRef<SignatureCanvasHandle>();
    renderWith(<SignatureCanvas ref={ref} />);
    expect(ref.current!.toDataURL()).toBeNull();
  });

  it("le bouton « Effacer » est désactivé quand le canvas est vide", () => {
    renderWith(<SignatureCanvas />);
    const clearBtn = screen.getByRole('button', { name: /Effacer/i });
    expect(clearBtn).toBeDisabled();
  });
});
