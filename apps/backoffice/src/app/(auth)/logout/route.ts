import { type NextRequest, NextResponse } from 'next/server';

import { createSupabaseServerClient } from '@/lib/auth/session';

const REASONS = new Set(['not_admin', 'session_expired']);

/**
 * Ferme la session quand l'API la refuse (jeton expiré, compte sans rôle admin), puis renvoie vers
 * `/login` avec le motif : une page ne peut pas écrire de cookie, une route si.
 */
export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  const reason = request.nextUrl.searchParams.get('error');
  const target = new URL('/login', request.url);
  if (reason && REASONS.has(reason)) target.searchParams.set('error', reason);
  return NextResponse.redirect(target);
}
