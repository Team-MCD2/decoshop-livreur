import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorFallback } from '@/components/ErrorFallback';

interface Props {
  children: ReactNode;
  /** Surface optionnelle (e.g. "BLDetail", "Signature") — pour les logs externes. */
  scope?: string;
}

interface State {
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Root error boundary — catches uncaught render exceptions and renders a
 * friendly fallback (instead of a blank white screen mid-livraison).
 *
 * Why a class component : React error boundaries cannot be hooks in any
 * stable API as of React 19. The fallback UI lives in `ErrorFallback.tsx`
 * (function component) so this file stays pure-class and the
 * `react-refresh/only-export-components` lint rule stays happy.
 *
 * Future hook : once a Sentry / Logtail DSN is wired (see W04.12 SECURITY),
 * call `captureException(error, { contexts: { react: errorInfo } })` here.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // For now: console.error. When Sentry is wired, swap this for a
    // captureException call. The verbose format follows db.md M06.
    console.error('[ErrorBoundary]', {
      WHAT:  error.name + ': ' + error.message,
      WHERE: this.props.scope ?? 'root',
      WHEN:  new Date().toISOString(),
      CAUSE: error.cause ?? null,
      STACK: errorInfo.componentStack,
    });
    this.setState({ errorInfo });
  }

  reset = (): void => {
    this.setState({ error: null, errorInfo: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      return <ErrorFallback error={this.state.error} onReset={this.reset} />;
    }
    return this.props.children;
  }
}

