import { z } from 'zod';

/** Traitements d'un signalement : supprimer le contenu signalé, ou classer le signalement. */
export const RESOLUTION_ACTIONS = ['remove_content', 'dismiss'] as const;
export type ResolutionAction = (typeof RESOLUTION_ACTIONS)[number];

/** Note facultative de l'admin, gardée avec le signalement et dans le journal d'audit. */
export const resolutionSchema = z.object({
  note: z.string().trim().max(500, 'La note ne doit pas dépasser 500 caractères.'),
});

export type ResolutionInput = z.infer<typeof resolutionSchema>;

/** Entrée d'une Server Action, revalidée côté serveur : appelable par n'importe quel client. */
export const resolutionRequestSchema = resolutionSchema.extend({
  reportId: z.uuid(),
  action: z.enum(RESOLUTION_ACTIONS),
});
