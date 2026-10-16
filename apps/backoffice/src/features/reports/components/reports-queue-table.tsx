import Link from 'next/link';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import type { AdminReportSummary } from '../data/queries';
import { dateFormat, REASON_LABELS, TARGET_LABELS } from './labels';
import { ReportStatusBadge } from './report-status-badge';

/** File des signalements ; chaque ligne ouvre le détail. */
export function ReportsQueueTable({ reports }: { reports: AdminReportSummary[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Contenu</TableHead>
          <TableHead>Motif</TableHead>
          <TableHead>Signalé par</TableHead>
          <TableHead>Statut</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {reports.map((report) => (
          <TableRow key={report.id}>
            <TableCell>
              <Link href={`/reports/${report.id}`} className="underline-offset-4 hover:underline">
                {dateFormat.format(new Date(report.createdAt))}
              </Link>
            </TableCell>
            <TableCell>
              {TARGET_LABELS[report.targetType]}
              {report.excerpt && (
                <span className="block max-w-sm truncate text-muted-foreground">
                  {report.excerpt}
                </span>
              )}
            </TableCell>
            <TableCell>
              {REASON_LABELS[report.reason]}
              {report.details && (
                <span className="block max-w-xs truncate text-muted-foreground">
                  {report.details}
                </span>
              )}
            </TableCell>
            <TableCell>@{report.reporter.username}</TableCell>
            <TableCell>
              <ReportStatusBadge status={report.status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
