import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export default function BLDetail() {
  const { id } = useParams();
  return (
    <div className="px-4 py-6 lg:px-8 lg:py-10 max-w-3xl mx-auto w-full">
      <Link to="/" className="inline-flex items-center gap-2 text-muted hover:text-navy mb-4 text-sm">
        <ArrowLeft className="w-4 h-4 rtl-flip" />
        Retour
      </Link>
      <Card padding="lg">
        <h1 className="text-xl font-display font-bold text-ink mb-2">BL #{id}</h1>
        <p className="text-muted text-sm">Détail du BL — implémenté en Phase 3.</p>
        <Link to="/" className="block mt-4">
          <Button intent="ghost" size="sm">
            Retour à l'accueil
          </Button>
        </Link>
      </Card>
    </div>
  );
}
