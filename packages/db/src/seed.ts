// Seed de démo (ADR-007), minimal en T4 : profils et relations pour la politique de visibilité.
// T7 l'étend (une centaine d'utilisateurs, abonnements, posts avec images).
// Idempotent : relançable sans doublon. Profils sans compte Supabase Auth (aucune FK vers `auth`) :
// ils ne se connectent pas, ils servent à être consultés.
// `SEED_VIEWER_USERNAME` (facultatif) : username d'un compte existant, relié aux profils du seed
// (abonnements dans les deux sens, blocage dans les deux sens).
import { eq, inArray, sql } from 'drizzle-orm';

import { createDatabase, type Executor } from './client.ts';
import { blocks, follows, profiles, type NewProfileRow } from './schema/index.ts';

type SeedProfile = Pick<NewProfileRow, 'id' | 'username' | 'fullName' | 'bio'> &
  Partial<Pick<NewProfileRow, 'isPrivate' | 'status'>>;

// Identifiants UUID v7 fixes : le seed retrouve ses lignes d'une exécution à l'autre.
const SEED_PROFILES = {
  lea: {
    id: '0199a1b2-5eed-7000-8000-000000000001',
    username: 'lea.martin',
    fullName: 'Léa Martin',
    bio: 'Photographe à Lyon 📷',
  },
  hugo: {
    id: '0199a1b2-5eed-7000-8000-000000000002',
    username: 'hugo.bernard',
    fullName: 'Hugo Bernard',
    bio: 'Vélo, montagne et café.',
  },
  chloe: {
    id: '0199a1b2-5eed-7000-8000-000000000003',
    username: 'chloe.petit',
    fullName: 'Chloé Petit',
    bio: 'Carnets de voyage ✈️',
    isPrivate: true,
  },
  jade: {
    id: '0199a1b2-5eed-7000-8000-000000000004',
    username: 'jade.lambert',
    fullName: 'Jade Lambert',
    bio: 'Céramique et plantes.',
    isPrivate: true,
  },
  nathan: {
    id: '0199a1b2-5eed-7000-8000-000000000005',
    username: 'nathan.durand',
    fullName: 'Nathan Durand',
    bio: 'Développeur iOS.',
  },
  lucas: {
    id: '0199a1b2-5eed-7000-8000-000000000006',
    username: 'lucas.roux',
    fullName: 'Lucas Roux',
    bio: '',
  },
  ines: {
    id: '0199a1b2-5eed-7000-8000-000000000007',
    username: 'ines.moreau',
    fullName: 'Inès Moreau',
    bio: 'Danse contemporaine.',
    status: 'suspended',
  },
  emma: {
    id: '0199a1b2-5eed-7000-8000-000000000008',
    username: 'emma.leroy',
    fullName: 'Emma Leroy',
    bio: 'Architecte.',
  },
  tom: {
    id: '0199a1b2-5eed-7000-8000-000000000009',
    username: 'tom.fournier',
    fullName: 'Tom Fournier',
    bio: 'Musique électronique.',
  },
} satisfies Record<string, SeedProfile>;

type SeedKey = keyof typeof SEED_PROFILES;
const id = (key: SeedKey): string => SEED_PROFILES[key].id;

/** Abonnements entre profils du seed : `[abonné, suivi]`. */
const SEED_FOLLOWS: [SeedKey, SeedKey][] = [
  ['lea', 'hugo'],
  ['hugo', 'lea'],
  ['nathan', 'lea'],
  ['chloe', 'lea'],
  ['lea', 'chloe'],
  ['lucas', 'hugo'],
  ['jade', 'nathan'],
];

/** Blocage entre profils du seed : `[bloqueur, bloqué]`. */
const SEED_BLOCKS: [SeedKey, SeedKey][] = [['nathan', 'lucas']];

async function findViewerId(db: Executor, username: string): Promise<string> {
  const [viewer] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.username, username.trim().toLowerCase()))
    .limit(1);
  if (!viewer) {
    throw new Error(
      `SEED_VIEWER_USERNAME : aucun profil « ${username} » (terminer l'onboarding avant le seed)`,
    );
  }
  return viewer.id;
}

async function seed(db: Executor, viewerUsername: string | undefined): Promise<void> {
  // Même id déjà présent : ignoré ; username pris par un autre compte : erreur explicite de la base.
  await db
    .insert(profiles)
    .values(Object.values(SEED_PROFILES).map((p) => ({ ...p, birthDate: '2000-01-31' })))
    .onConflictDoNothing({ target: profiles.id });

  const followRows = SEED_FOLLOWS.map(([follower, followee]) => ({
    followerId: id(follower),
    followeeId: id(followee),
  }));
  const blockRows = SEED_BLOCKS.map(([blocker, blocked]) => ({
    blockerId: id(blocker),
    blockedId: id(blocked),
  }));

  const touched = Object.values(SEED_PROFILES).map((p) => p.id);
  if (viewerUsername) {
    const viewer = await findViewerId(db, viewerUsername);
    touched.push(viewer);
    // Le compte de démo suit Léa (publique) et Chloé (privée) ; Hugo et Nathan le suivent.
    followRows.push(
      { followerId: viewer, followeeId: id('lea') },
      { followerId: viewer, followeeId: id('chloe') },
      { followerId: id('hugo'), followeeId: viewer },
      { followerId: id('nathan'), followeeId: viewer },
    );
    // Emma bloque le compte de démo, qui bloque Tom : les deux profils renvoient 404.
    blockRows.push(
      { blockerId: id('emma'), blockedId: viewer },
      { blockerId: viewer, blockedId: id('tom') },
    );
  }

  await db.insert(follows).values(followRows).onConflictDoNothing();
  await db.insert(blocks).values(blockRows).onConflictDoNothing();

  // Compteurs dénormalisés (ADR-007) recalculés à partir de `follows`.
  await db
    .update(profiles)
    .set({
      followerCount: sql`(SELECT count(*) FROM ${follows} WHERE ${follows.followeeId} = ${profiles.id})::int`,
      followingCount: sql`(SELECT count(*) FROM ${follows} WHERE ${follows.followerId} = ${profiles.id})::int`,
      updatedAt: sql`now()`,
    })
    .where(inArray(profiles.id, touched));
}

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) throw new Error('DATABASE_URL manquante (voir .env.example)');
const viewerUsername = process.env['SEED_VIEWER_USERNAME']?.trim() || undefined;

const database = createDatabase(databaseUrl);
try {
  await database.db.transaction((tx) => seed(tx, viewerUsername));
  const count = Object.keys(SEED_PROFILES).length;
  console.info(
    `db:seed — ${count} profils de démo${viewerUsername ? `, reliés à « ${viewerUsername} »` : ''}.`,
  );
} finally {
  await database.close();
}
