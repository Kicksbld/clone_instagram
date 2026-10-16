import Link from 'next/link';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import type { AdminReportDetail } from '../data/queries';
import { dateFormat, REASON_LABELS, TARGET_LABELS } from './labels';
import { ReportStatusBadge } from './report-status-badge';

/** Signalement : motif, précisions, signalant, traitement. */
export function ReportDetailsCard({ report }: { report: AdminReportDetail }) {
  const facts: [string, React.ReactNode][] = [
    ['Contenu', TARGET_LABELS[report.targetType]],
    ['Motif', REASON_LABELS[report.reason]],
    [
      'Signalé par',
      <Link
        key="reporter"
        href={`/users/${report.reporter.id}`}
        className="underline-offset-4 hover:underline"
      >
        @{report.reporter.username}
      </Link>,
    ],
    ['Date', dateFormat.format(new Date(report.createdAt))],
    ['Autres signalements ouverts', String(report.otherOpenCount)],
  ];
  if (report.resolvedAt) facts.push(['Traité le', dateFormat.format(new Date(report.resolvedAt))]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          Signalement
          <ReportStatusBadge status={report.status} />
        </CardTitle>
        {report.details && <p className="whitespace-pre-line">« {report.details} »</p>}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        {report.resolutionNote && (
          <p className="text-sm">
            <span className="text-muted-foreground">Note : </span>
            {report.resolutionNote}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
