import 'server-only';

import { redirect } from 'next/navigation';

import { createApiClient, type ApiClient } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/session';

import { checkAdmin } from './admin-session';

/**
 * Revérifie la session admin (ADR-011) : appelée par chaque page et **chaque Server Action** avant
 * tout appel à l'API (une Server Action est un endpoint POST public). Sans session ou jeton refusé →
 * `/login` ; compte sans rôle admin → déconnexion puis `/login`.
 */
export async function requireAdmin(): Promise<ApiClient> {
  const token = await getAccessToken();
  if (!token) redirect('/login');
  const client = createApiClient(token);
  const check = await checkAdmin(client);
  if (check === 'unauthenticated') redirect('/logout?error=session_expired');
  if (check === 'not_admin') redirect('/logout?error=not_admin');
  return client;
}
