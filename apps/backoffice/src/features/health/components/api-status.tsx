import type { ApiHealth } from '../data/queries';

const LABELS: Record<ApiHealth, string> = {
  ok: 'API : ok',
  unreachable: 'API : injoignable',
};

export function ApiStatus({ health }: { health: ApiHealth }) {
  return (
    <p role="status" className={health === 'ok' ? 'text-foreground' : 'text-destructive'}>
      {LABELS[health]}
    </p>
  );
}
