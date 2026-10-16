import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { signOut } from '@/features/auth/data/actions';
import { ApiStatus } from '@/features/health/components/api-status';
import { getApiHealth } from '@/features/health/data/queries';

// Pages d'administration rendues à chaque requête (session, état de l'API) : jamais prérendues au build.
export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: LayoutProps<'/'>) {
  const health = await getApiHealth();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-3">
          <nav className="flex items-center gap-6">
            <span className="font-semibold">Backoffice</span>
            <Link href="/users" className="text-sm underline-offset-4 hover:underline">
              Utilisateurs
            </Link>
            <Link href="/reports" className="text-sm underline-offset-4 hover:underline">
              Signalements
            </Link>
          </nav>
          <div className="flex items-center gap-4 text-sm">
            <ApiStatus health={health} />
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm">
                Se déconnecter
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-8">
        {children}
      </main>
    </div>
  );
}
