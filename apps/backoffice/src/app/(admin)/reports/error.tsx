'use client';

import { Button } from '@/components/ui/button';

export default function ReportsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3">
      <p>Impossible de charger les signalements : l’API ne répond pas.</p>
      <Button variant="outline" onClick={reset}>
        Réessayer
      </Button>
    </div>
  );
}
