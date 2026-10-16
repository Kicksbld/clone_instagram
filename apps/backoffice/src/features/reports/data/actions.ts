'use server';

import { revalidatePath } from 'next/cache';

import { requireAdmin } from '@/features/auth/data/session';

import { type ResolutionAction, resolutionRequestSchema } from '../schemas/resolution';
import { resolutionErrorMessage } from './messages';

export interface ResolutionResult {
  ok: boolean;
  message: string;
}

const SUCCESS: Record<ResolutionAction, string> = {
  remove_content: 'Contenu supprimé. Les signalements de ce contenu sont traités.',
  dismiss: 'Signalement classé, avec les autres signalements de ce contenu.',
};

/**
 * Traiter un signalement (ADR-011). Session revérifiée, entrée revalidée (une Server Action est un
 * endpoint POST public), puis l'API autorise, supprime ou classe et écrit le journal d'audit.
 */
export async function resolveReport(input: {
  reportId: string;
  action: ResolutionAction;
  note: string;
}): Promise<ResolutionResult> {
  const client = await requireAdmin();
  const parsed = resolutionRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Entrée invalide.' };
  }
  const { reportId, action, note } = parsed.data;

  const { error, response } = await client.POST('/v1/admin/reports/{id}/resolve', {
    params: { path: { id: reportId } },
    body: { action, ...(note !== '' && { note }) },
  });
  if (!response.ok) {
    return { ok: false, message: resolutionErrorMessage(response.status, error?.code) };
  }
  revalidatePath('/reports');
  revalidatePath(`/reports/${reportId}`);
  return { ok: true, message: SUCCESS[action] };
}
