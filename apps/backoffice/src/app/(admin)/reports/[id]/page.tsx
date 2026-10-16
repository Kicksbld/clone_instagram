import Link from 'next/link';
import { notFound } from 'next/navigation';

import { requireAdmin } from '@/features/auth/data/session';
import { ReportDetailsCard } from '@/features/reports/components/report-details-card';
import { ReportedContent } from '@/features/reports/components/reported-content';
import { ResolutionActions } from '@/features/reports/components/resolution-actions';
import { resolveReport } from '@/features/reports/data/actions';
import { getReport } from '@/features/reports/data/queries';

export default async function ReportPage({ params }: PageProps<'/reports/[id]'>) {
  const client = await requireAdmin();
  const { id } = await params;
  const report = await getReport(client, id);
  if (!report) notFound();

  return (
    <>
      <Link
        href="/reports"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Signalements
      </Link>
      <ReportDetailsCard report={report} />
      <ReportedContent report={report} />
      {report.status === 'open' && (
        <ResolutionActions
          reportId={report.id}
          targetType={report.targetType}
          onResolve={resolveReport}
        />
      )}
    </>
  );
}
