import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

import {
  REPORT_REASONS,
  REPORT_STATUSES,
  REPORT_TARGET_TYPES,
  type ReportSearch,
} from '../schemas/search';
import { REASON_LABELS, STATUS_LABELS, TARGET_LABELS } from './labels';

/** Filtres dans l'URL (formulaire GET, sans JavaScript) ; repart de la première page. */
export function ReportsFilters({ search }: { search: ReportSearch }) {
  return (
    <form action="/reports" method="get" role="search" className="flex flex-wrap items-end gap-2">
      <NativeSelect name="status" aria-label="Statut" defaultValue={search.status ?? 'open'}>
        {REPORT_STATUSES.map((status) => (
          <NativeSelectOption key={status} value={status}>
            {STATUS_LABELS[status]}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <NativeSelect name="reason" aria-label="Motif" defaultValue={search.reason ?? ''}>
        <NativeSelectOption value="">Tous les motifs</NativeSelectOption>
        {REPORT_REASONS.map((reason) => (
          <NativeSelectOption key={reason} value={reason}>
            {REASON_LABELS[reason]}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <NativeSelect
        name="targetType"
        aria-label="Type de contenu"
        defaultValue={search.targetType ?? ''}
      >
        <NativeSelectOption value="">Tous les contenus</NativeSelectOption>
        {REPORT_TARGET_TYPES.map((type) => (
          <NativeSelectOption key={type} value={type}>
            {TARGET_LABELS[type]}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <Button type="submit">Filtrer</Button>
    </form>
  );
}
