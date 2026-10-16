import { z } from 'zod';

/** Formulaire de connexion admin (email + mot de passe, ADR-011). */
export const loginSchema = z.object({
  email: z.email('Adresse email invalide.').trim().toLowerCase(),
  password: z.string().min(1, 'Mot de passe obligatoire.'),
});

export type LoginInput = z.infer<typeof loginSchema>;
