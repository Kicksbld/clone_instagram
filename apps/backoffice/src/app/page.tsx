import { ApiStatus } from '@/features/health/components/api-status';
import { getApiHealth } from '@/features/health/data/queries';

// Lu à chaque requête : l'état de l'API ne doit pas être figé au build.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const health = await getApiHealth();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-6 py-16">
      <h1 className="text-2xl font-semibold">Backoffice Clone Instagram</h1>
      <ApiStatus health={health} />
    </main>
  );
}
