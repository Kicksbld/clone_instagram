import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

import { ACCOUNT_STATUSES, type UserSearch } from '../schemas/search';
import { STATUS_LABELS } from './status-badge';

/** Recherche et filtre dans l'URL (formulaire GET, sans JavaScript) ; repart de la première page. */
export function UsersSearchForm({ search }: { search: UserSearch }) {
  return (
    <form action="/users" method="get" role="search" className="flex flex-wrap items-end gap-2">
      <Input
        name="q"
        type="search"
        placeholder="Username ou nom"
        aria-label="Rechercher un utilisateur"
        defaultValue={search.q}
        maxLength={64}
        className="w-64"
      />
      <NativeSelect name="status" aria-label="Statut" defaultValue={search.status ?? ''}>
        <NativeSelectOption value="">Tous les statuts</NativeSelectOption>
        {ACCOUNT_STATUSES.map((status) => (
          <NativeSelectOption key={status} value={status}>
            {STATUS_LABELS[status]}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <Button type="submit">Rechercher</Button>
    </form>
  );
}
