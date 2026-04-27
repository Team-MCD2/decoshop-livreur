import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '@/components/ui/Button';

describe('Button', () => {
  it('rend le label fourni', () => {
    render(<Button>Cliquer</Button>);
    expect(screen.getByRole('button', { name: 'Cliquer' })).toBeInTheDocument();
  });

  it('appelle onClick quand on clique', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Action</Button>);
    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('est désactivé quand loading=true', () => {
    render(<Button loading>Loading</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('applique la variante intent="yellow"', () => {
    const { container } = render(<Button intent="yellow">Y</Button>);
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('bg-yellow');
  });

  it('applique fullWidth', () => {
    const { container } = render(<Button fullWidth>FW</Button>);
    expect(container.querySelector('button')?.className).toContain('w-full');
  });
});
