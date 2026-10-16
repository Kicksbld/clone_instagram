import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { requireAdmin } from '@/features/auth/data/session';
import { ReportsFilters } from '@/features/reports/components/reports-filters';
import { ReportsPagination } from '@/features/reports/components/reports-pagination';
import { ReportsQueueTable } from '@/features/reports/components/reports-queue-table';
import { listReports } from '@/features/reports/data/queries';
import { parseReportSearch, reportsHref } from '@/features/reports/schemas/search';

export const metadata = { title: 'Signalements — Backoffice' };

export default async function ReportsPage({ searchParams }: PageProps<'/reports'>) {
  const client = await requireAdmin();
  const search = parseReportSearch(await searchParams);
  const result = await listReports(client, search);

  return (
    <>
      <h1 className="text-2xl font-semibold">Signalements</h1>
      <ReportsFilters search={search} />
      {result.kind === 'invalid_cursor' ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p>Cette page n’est plus valide.</p>
          <Link
            href={reportsHref({ ...search, cursor: undefined })}
            className={buttonVariants({ variant: 'outline' })}
          >
            Revenir à la première page
          </Link>
        </div>
      ) : result.page.items.length === 0 ? (
        <p className="text-muted-foreground">Aucun signalement ne correspond à ces filtres.</p>
      ) : (
        <>
          <ReportsQueueTable reports={result.page.items} />
          <ReportsPagination
            search={search}
            {...(result.page.nextCursor && { nextCursor: result.page.nextCursor })}
          />
        </>
      )}
    </>
  );
}
