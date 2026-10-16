import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';

import { type UserSearch, usersHref } from '../schemas/search';

/** Pagination par curseur (ADR-007) : page suivante, ou retour à la première page. */
export function UsersPagination({
  search,
  nextCursor,
}: {
  search: UserSearch;
  nextCursor?: string;
}) {
  const { cursor, ...criteria } = search;
  return (
    <nav aria-label="Pagination" className="flex justify-end gap-2">
      {cursor && (
        <Link href={usersHref(criteria)} className={buttonVariants({ variant: 'outline' })}>
          Première page
        </Link>
      )}
      {nextCursor && (
        <Link
          href={usersHref({ ...criteria, cursor: nextCursor })}
          className={buttonVariants({ variant: 'outline' })}
        >
          Suivant
        </Link>
      )}
    </nav>
  );
}
