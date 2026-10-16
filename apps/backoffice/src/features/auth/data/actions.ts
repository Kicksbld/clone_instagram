'use server';

import { redirect } from 'next/navigation';

import { createApiClient } from '@/lib/api/client';
import { createSupabaseServerClient } from '@/lib/auth/session';

import { loginSchema } from '../schemas/login';
import { checkAdmin } from './admin-session';

export interface SignInState {
  error: string;
  email: string;
}

/**
 * Connexion email + mot de passe par Supabase Auth, côté serveur (cookies httpOnly), puis refus d'un
 * compte sans rôle admin (ADR-011) : sa session est aussitôt fermée.
 */
export async function signIn(
  _previous: SignInState | undefined,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get('email') ?? '');
  const parsed = loginSchema.safeParse({ email, password: formData.get('password') ?? '' });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide.', email };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.session) return { error: 'Email ou mot de passe incorrect.', email };

  let check;
  try {
    check = await checkAdmin(createApiClient(data.session.access_token));
  } catch {
    await supabase.auth.signOut();
    return { error: 'L’API ne répond pas. Réessayez dans un instant.', email };
  }
  if (check !== 'admin') {
    await supabase.auth.signOut();
    return { error: 'Ce compte n’a pas accès au backoffice.', email };
  }
  redirect('/users');
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}
