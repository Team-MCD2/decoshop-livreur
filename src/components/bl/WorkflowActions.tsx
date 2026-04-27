import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Truck,
  CheckCircle2,
  PenLine,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle } from '@/components/ui/Card';
import { useUpdateBLStatus, nextWorkflowStatus } from '@/hooks/useBLDetail';
import type { BLStatus } from '@/types/domain';

interface WorkflowActionsProps {
  blId: string;
  status: BLStatus;
}

/**
 * Actions de workflow livreur pour un BL.
 * - Bouton principal : prochaine action automatique (start / arrived / mark delivered…)
 * - Bouton secondaire : signaler échec
 *
 * Confirmation requise pour les actions irréversibles (livré).
 */
export function WorkflowActions({ blId, status }: WorkflowActionsProps) {
  const { t } = useTranslation();
  const update = useUpdateBLStatus();
  const [confirming, setConfirming] = useState<BLStatus | null>(null);

  const next = nextWorkflowStatus(status);

  // Pas d'action workflow disponible (statut final ou bloquant)
  if (!next) {
    return (
      <Card padding="md">
        <CardTitle>{t('bl.workflow.title')}</CardTitle>
        <p className="text-sm text-muted mt-2">{t('bl.workflow.blocked')}</p>
      </Card>
    );
  }

  const meta = ACTION_META[next] ?? {
    label: 'bl.workflow.start_delivery',
    icon: ArrowRight,
    intent: 'primary' as const,
    requiresConfirm: false,
  };
  const Icon = meta.icon;

  const handleClick = () => {
    if (meta.requiresConfirm && confirming !== next) {
      setConfirming(next);
      window.setTimeout(() => setConfirming(null), 5000);
      return;
    }
    update.mutate(
      { blId, statut: next },
      { onSettled: () => setConfirming(null) },
    );
  };

  const isPendingConfirm = meta.requiresConfirm && confirming === next;

  return (
    <Card padding="md">
      <CardTitle>{t('bl.workflow.title')}</CardTitle>
      <div className="space-y-3 mt-3">
        <Button
          intent={isPendingConfirm ? 'danger' : meta.intent}
          size="lg"
          fullWidth
          leftIcon={<Icon className="w-5 h-5 rtl-flip" />}
          loading={update.isPending}
          onClick={handleClick}
        >
          {update.isPending
            ? t('bl.workflow.delivering')
            : isPendingConfirm
              ? t('bl.workflow.confirm')
              : t(meta.label)}
        </Button>

        {isPendingConfirm && (
          <p className="text-xs text-muted text-center">
            {t('bl.workflow.confirmation_required')}
          </p>
        )}

        {/* Bouton signaler un échec — visible uniquement quand on est en train de livrer */}
        {(status === 'en_route' || status === 'en_livraison') && (
          <Button
            intent="ghost"
            size="md"
            fullWidth
            leftIcon={<AlertTriangle className="w-4 h-4" />}
            disabled
            title="Phase 5 — gestion d'échec"
          >
            {t('bl.workflow.report_failure')}
          </Button>
        )}
      </div>
    </Card>
  );
}

interface ActionMeta {
  label: string;
  icon: typeof Truck;
  intent: 'primary' | 'yellow' | 'ink';
  requiresConfirm: boolean;
}

const ACTION_META: Partial<Record<BLStatus, ActionMeta>> = {
  en_livraison: {
    label: 'bl.workflow.start_delivery',
    icon: Truck,
    intent: 'primary',
    requiresConfirm: false,
  },
  en_route: {
    label: 'bl.workflow.arrived',
    icon: ArrowRight,
    intent: 'yellow',
    requiresConfirm: false,
  },
  livre: {
    label: 'bl.workflow.mark_delivered',
    icon: CheckCircle2,
    intent: 'ink',
    requiresConfirm: true,
  },
  signature_attendue: {
    label: 'bl.workflow.request_signature',
    icon: PenLine,
    intent: 'primary',
    requiresConfirm: false,
  },
};
