import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';

import { type ReportSearch, reportsHref } from '../schemas/search';

/** Pagination par curseur (ADR-007) : page suivante, ou retour à la première page. */
export function ReportsPagination({
  search,
  nextCursor,
}: {
  search: ReportSearch;
  nextCursor?: string;
}) {
  const { cursor, ...criteria } = search;
  return (
    <nav aria-label="Pagination" className="flex justify-end gap-2">
      {cursor && (
        <Link href={reportsHref(criteria)} className={buttonVariants({ variant: 'outline' })}>
          Première page
        </Link>
      )}
      {nextCursor && (
        <Link
          href={reportsHref({ ...criteria, cursor: nextCursor })}
          className={buttonVariants({ variant: 'outline' })}
        >
          Suivant
        </Link>
      )}
    </nav>
  );
}
