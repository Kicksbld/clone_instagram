import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import type { AdminReport } from '../data/queries';

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

const TARGETS: Record<AdminReport['targetType'], string> = {
  post: 'Publication',
  comment: 'Commentaire',
  user: 'Compte',
};

const REASONS: Record<AdminReport['reason'], string> = {
  spam: 'Spam',
  nudity: 'Nudité',
  harassment: 'Harcèlement',
  violence: 'Violence',
  hate: 'Haine',
  other: 'Autre',
};

const STATUSES: Record<AdminReport['status'], string> = {
  open: 'Ouvert',
  resolved_removed: 'Contenu supprimé',
  resolved_dismissed: 'Classé',
};

/** Signalements reçus ou émis par un compte (les 20 plus récents) ; traitement en T15. */
export function ReportsTable({
  title,
  total,
  reports,
  showReporter,
}: {
  title: string;
  total: number;
  reports: AdminReport[];
  showReporter: boolean;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">
        {title} ({total})
      </h2>
      {reports.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun signalement.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Cible</TableHead>
              <TableHead>Motif</TableHead>
              {showReporter && <TableHead>Signalé par</TableHead>}
              <TableHead>Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports.map((report) => (
              <TableRow key={report.id}>
                <TableCell>{dateFormat.format(new Date(report.createdAt))}</TableCell>
                <TableCell>{TARGETS[report.targetType]}</TableCell>
                <TableCell>
                  {REASONS[report.reason]}
                  {report.details && (
                    <span className="block max-w-sm truncate text-muted-foreground">
                      {report.details}
                    </span>
                  )}
                </TableCell>
                {showReporter && <TableCell>@{report.reporter.username}</TableCell>}
                <TableCell>
                  <Badge variant={report.status === 'open' ? 'outline' : 'secondary'}>
                    {STATUSES[report.status]}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {total > reports.length && (
        <p className="text-sm text-muted-foreground">
          {reports.length} plus récents affichés sur {total}.
        </p>
      )}
    </section>
  );
}
