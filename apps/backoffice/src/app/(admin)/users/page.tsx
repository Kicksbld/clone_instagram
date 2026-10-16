import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { requireAdmin } from '@/features/auth/data/session';
import { UsersPagination } from '@/features/users/components/users-pagination';
import { UsersSearchForm } from '@/features/users/components/users-search-form';
import { UsersTable } from '@/features/users/components/users-table';
import { listUsers } from '@/features/users/data/queries';
import { parseUserSearch, usersHref } from '@/features/users/schemas/search';

export const metadata = { title: 'Utilisateurs — Backoffice' };

export default async function UsersPage({ searchParams }: PageProps<'/users'>) {
  const client = await requireAdmin();
  const search = parseUserSearch(await searchParams);
  const result = await listUsers(client, search);

  return (
    <>
      <h1 className="text-2xl font-semibold">Utilisateurs</h1>
      <UsersSearchForm search={search} />
      {result.kind === 'invalid_cursor' ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p>Cette page n’est plus valide.</p>
          <Link
            href={usersHref({ q: search.q, status: search.status })}
            className={buttonVariants({ variant: 'outline' })}
          >
            Revenir à la première page
          </Link>
        </div>
      ) : result.page.items.length === 0 ? (
        <p className="text-muted-foreground">Aucun utilisateur ne correspond à cette recherche.</p>
      ) : (
        <>
          <UsersTable users={result.page.items} />
          <UsersPagination
            search={search}
            {...(result.page.nextCursor && { nextCursor: result.page.nextCursor })}
          />
        </>
      )}
    </>
  );
}
