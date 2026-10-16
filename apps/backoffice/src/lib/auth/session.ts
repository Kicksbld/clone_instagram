import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { sessionCookieOptions, supabaseEnvironment } from './supabase';

/** Client Supabase Auth lié aux cookies de la requête (Server Component, Server Action, route). */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = supabaseEnvironment();
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, sessionCookieOptions(options));
          }
        } catch {
          // Server Component : cookies en lecture seule. Le proxy rafraîchit déjà la session.
        }
      },
    },
  });
}

/**
 * Jeton d'accès de la session, transmis à l'API côté serveur. Lu dans le cookie sans le vérifier :
 * l'API vérifie elle-même sa signature et le rôle admin (ADR-011).
 */
export async function getAccessToken(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
