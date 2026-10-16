import { z } from 'zod';

/** Actions d'administration sur un compte (ADR-011) ; `delete` est destructive et définitive. */
export const MODERATION_ACTIONS = ['suspend', 'ban', 'reactivate', 'delete'] as const;
export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

/** Motif obligatoire de chaque action, écrit dans le journal d'audit par l'API. */
export const moderationSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, 'Le motif est obligatoire.')
    .max(500, 'Le motif ne doit pas dépasser 500 caractères.'),
});

export type ModerationInput = z.infer<typeof moderationSchema>;

/** Entrée d'une Server Action, revalidée côté serveur : appelable par n'importe quel client. */
export const moderationRequestSchema = moderationSchema.extend({
  userId: z.uuid(),
  action: z.enum(MODERATION_ACTIONS),
});
