import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

import { sessionCookieOptions, supabaseEnvironment } from '@/lib/auth/supabase';

const PUBLIC_PATHS = ['/login', '/logout'];

/**
 * Confort uniquement (ADR-011) : rafraîchit la session Supabase et renvoie vers `/login` un visiteur
 * sans session. L'autorisation reste vérifiée par chaque page, chaque Server Action et l'API.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, publishableKey } = supabaseEnvironment();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, sessionCookieOptions(options));
        }
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  // Rafraîchit le jeton s'il a expiré (cookies réécrits par `setAll`).
  const { data } = await supabase.auth.getClaims();
  const isPublic = PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));
  if (!data?.claims && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
