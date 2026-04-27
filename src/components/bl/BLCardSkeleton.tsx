import { Card } from '@/components/ui/Card';

export function BLCardSkeleton() {
  return (
    <Card padding="md" className="animate-pulse">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 space-y-2">
          <div className="h-3 w-24 bg-cream-200 rounded" />
          <div className="h-5 w-40 bg-cream-200 rounded" />
        </div>
        <div className="h-5 w-16 bg-cream-200 rounded-full" />
      </div>
      <div className="space-y-2">
        <div className="h-3 w-full bg-cream-200 rounded" />
        <div className="h-3 w-2/3 bg-cream-200 rounded" />
      </div>
    </Card>
  );
}

export function BLCardSkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <BLCardSkeleton key={i} />
      ))}
    </div>
  );
}
