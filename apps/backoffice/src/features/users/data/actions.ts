'use server';

import { revalidatePath } from 'next/cache';

import { requireAdmin } from '@/features/auth/data/session';

import { moderationRequestSchema, type ModerationAction } from '../schemas/moderation';
import { moderationErrorMessage } from './messages';

export interface ModerationResult {
  ok: boolean;
  message: string;
}

const SUCCESS: Record<ModerationAction, string> = {
  suspend: 'Compte suspendu.',
  ban: 'Compte banni.',
  reactivate: 'Compte réactivé.',
  delete: 'Compte supprimé. Ses données seront purgées.',
};

/**
 * Suspendre, bannir, réactiver ou supprimer un compte (ADR-011). Session revérifiée, entrée revalidée
 * (une Server Action est un endpoint POST public), puis l'API autorise et écrit le journal d'audit.
 */
export async function moderateUser(input: {
  userId: string;
  action: ModerationAction;
  reason: string;
}): Promise<ModerationResult> {
  const client = await requireAdmin();
  const parsed = moderationRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Entrée invalide.' };
  }
  const { userId, action, reason } = parsed.data;
  const options = { params: { path: { id: userId } }, body: { reason } };

  const { error, response } =
    action === 'delete'
      ? await client.DELETE('/v1/admin/users/{id}', options)
      : action === 'suspend'
        ? await client.POST('/v1/admin/users/{id}/suspend', options)
        : action === 'ban'
          ? await client.POST('/v1/admin/users/{id}/ban', options)
          : await client.POST('/v1/admin/users/{id}/reactivate', options);

  if (!response.ok) {
    return { ok: false, message: moderationErrorMessage(response.status, error?.code) };
  }
  revalidatePath('/users');
  revalidatePath(`/users/${userId}`);
  return { ok: true, message: SUCCESS[action] };
}
