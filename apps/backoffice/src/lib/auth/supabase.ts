import 'server-only';

import type { CookieOptions } from '@supabase/ssr';

/**
 * Connexion Supabase Auth du backoffice (ADR-004, ADR-011), côté serveur uniquement : URL et clé
 * publique lues dans l'environnement du serveur Next.js, jamais exposées au navigateur.
 */
export function supabaseEnvironment(): { url: string; publishableKey: string } {
  const url = process.env['SUPABASE_URL'];
  const publishableKey = process.env['SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !publishableKey) {
    throw new Error('SUPABASE_URL ou SUPABASE_PUBLISHABLE_KEY manquante (voir .env.example)');
  }
  return { url, publishableKey };
}

/**
 * Cookies de session en httpOnly (ADR-004) : aucun client Supabase ne tourne dans le navigateur, le
 * jeton n'a jamais à être lu par du JavaScript.
 */
export function sessionCookieOptions(options: CookieOptions): CookieOptions {
  return { ...options, httpOnly: true, sameSite: 'lax' };
}
