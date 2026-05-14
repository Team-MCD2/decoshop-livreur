import { useTranslation } from 'react-i18next';
import { AlertOctagon, RefreshCw, Home } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card, CardTitle } from '@/components/ui/Card';

export interface ErrorFallbackProps {
  error: Error;
  onReset: () => void;
}

/**
 * Fallback UI rendered by `<ErrorBoundary>` when a child throws.
 *
 * Standalone function component so the boundary class file stays
 * react-refresh-friendly (one exported component per module).
 *
 * In dev mode (`import.meta.env.DEV`), expands a `<details>` with the
 * raw error name + message + stack — useful for hot-reload debugging.
 * In prod the panel is hidden.
 */
export function ErrorFallback({ error, onReset }: ErrorFallbackProps) {
  const { t } = useTranslation();
  const isDev = import.meta.env.DEV;

  return (
    <div className="min-h-dvh flex items-center justify-center bg-cream px-4 py-10">
      <div className="w-full max-w-md">
        <Card padding="lg" className="shadow-md">
          <div className="text-center mb-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-50 mb-3">
              <AlertOctagon className="w-9 h-9 text-red-700" />
            </div>
            <CardTitle className="text-center">
              {t('errors.boundary.title')}
            </CardTitle>
            <p className="mt-2 text-sm text-muted">
              {t('errors.boundary.body')}
            </p>
          </div>

          {isDev && (
            <details className="mt-4 rounded-xl bg-cream-100 border border-line p-3 text-xs">
              <summary className="cursor-pointer font-bold text-ink">
                {t('errors.boundary.dev_details')}
              </summary>
              <pre className="mt-2 whitespace-pre-wrap break-words text-muted">
                {error.name}: {error.message}
                {error.stack ? '\n\n' + error.stack : ''}
              </pre>
            </details>
          )}

          <div className="grid grid-cols-2 gap-2 mt-6">
            <ButtonLink
              intent="ghost"
              size="md"
              href="/"
              leftIcon={<Home className="w-4 h-4 rtl-flip" />}
              onClick={onReset}
            >
              {t('errors.boundary.home')}
            </ButtonLink>
            <Button
              intent="primary"
              size="md"
              leftIcon={<RefreshCw className="w-4 h-4" />}
              onClick={() => {
                onReset();
                window.location.reload();
              }}
            >
              {t('errors.boundary.reload')}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
