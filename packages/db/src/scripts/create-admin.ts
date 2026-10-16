// Création d'un admin du backoffice (T14, ADR-011) : pas d'écran d'inscription. Crée l'utilisateur
// Supabase Auth (email confirmé) ou retrouve l'existant, puis lui donne le rôle `admin`. Idempotent :
// relancé, il ne change ni le mot de passe d'un compte existant ni ses rôles.
// Un admin n'a pas besoin de profil : il ne passe pas par l'onboarding de l'app.
import { createDatabase } from '../client.ts';
import { adminRoles } from '../schema/admin.ts';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} manquante (voir .env.example)`);
  return value;
}

const supabaseUrl = required('SUPABASE_URL');
const serviceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY');
const email = required('ADMIN_EMAIL').toLowerCase();
const password = required('ADMIN_PASSWORD');
const headers = {
  apikey: serviceRoleKey,
  authorization: `Bearer ${serviceRoleKey}`,
  'content-type': 'application/json',
};

interface AuthUser {
  id: string;
  email?: string;
}

async function createUser(): Promise<AuthUser | null> {
  const response = await fetch(new URL('/auth/v1/admin/users', supabaseUrl), {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (response.ok) return (await response.json()) as AuthUser;
  const body = (await response.json().catch(() => ({}))) as { error_code?: string; msg?: string };
  if (response.status === 422 && body.error_code === 'email_exists') return null;
  throw new Error(`Supabase Auth : HTTP ${response.status} ${body.msg ?? ''}`.trim());
}

async function findUserByEmail(): Promise<AuthUser> {
  const perPage = 200;
  for (let page = 1; ; page += 1) {
    const url = new URL('/auth/v1/admin/users', supabaseUrl);
    url.searchParams.set('page', String(page));
    url.searchParams.set('per_page', String(perPage));
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`Supabase Auth : HTTP ${response.status}`);
    const { users } = (await response.json()) as { users: AuthUser[] };
    const user = users.find((candidate) => candidate.email?.toLowerCase() === email);
    if (user) return user;
    if (users.length < perPage) throw new Error(`Aucun utilisateur Supabase Auth pour ${email}`);
  }
}

const created = await createUser();
const user = created ?? (await findUserByEmail());

const database = createDatabase(required('DATABASE_URL'));
try {
  await database.db
    .insert(adminRoles)
    .values({ userId: user.id, role: 'admin' })
    .onConflictDoNothing();
  console.info(
    `admin:create — ${email} : ${created ? 'compte créé' : 'compte existant (mot de passe inchangé)'}, rôle admin.`,
  );
} finally {
  await database.close();
}
