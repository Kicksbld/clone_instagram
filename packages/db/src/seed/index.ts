// Seed de démo (ADR-007) : une centaine de profils, des abonnements et des posts avec images, en
// local comme sur la démo. Idempotent : relançable sans doublon ni nouvel envoi d'image.
// Profils sans compte Supabase Auth (aucune FK vers `auth`) : ils ne se connectent pas, ils servent
// à être consultés et à remplir le feed.
// `SEED_VIEWER_USERNAME` (facultatif) : username d'un compte existant, relié aux profils du seed
// (abonnements dans les deux sens, blocages dans les deux sens).
import { createDatabase } from '../client.ts';
import { uploadSeedImages } from './images.ts';
import { planSeed, planViewerRelations } from './plan.ts';
import { existingMediaIds, findViewerId, writeSeed } from './write.ts';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} manquante (voir .env.example)`);
  return value;
}

const databaseUrl = required('DATABASE_URL');
const storage = {
  supabaseUrl: required('SUPABASE_URL'),
  serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
};
const viewerUsername = process.env['SEED_VIEWER_USERNAME']?.trim() || undefined;

const database = createDatabase(databaseUrl);
try {
  const plan = planSeed(new Date());
  const viewerId = viewerUsername ? await findViewerId(database.db, viewerUsername) : null;
  if (viewerId) {
    const relations = planViewerRelations(viewerId);
    plan.follows.push(...relations.follows);
    plan.blocks.push(...relations.blocks);
  }

  // 1. Images (hors transaction) : seulement celles des médias pas encore en base.
  const existing = await existingMediaIds(
    database.db,
    plan.media.map((item) => item.id),
  );
  const missing = plan.media.filter((item) => !existing.has(item.id));
  if (missing.length > 0) {
    console.info(`db:seed — envoi de ${missing.length} images d'exemple (picsum.photos)…`);
  }
  const sizes = await uploadSeedImages(missing, storage, (done) => {
    if (done % 50 === 0 || done === missing.length) {
      console.info(`db:seed — images : ${done}/${missing.length}`);
    }
  });

  // 2. Base : tout ou rien.
  await database.db.transaction((tx) => writeSeed(tx, plan, sizes, viewerId));
  console.info(
    `db:seed — ${plan.profiles.length} profils, ${plan.posts.length} posts, ` +
      `${plan.follows.length} abonnements${viewerUsername ? `, reliés à « ${viewerUsername} »` : ''}.`,
  );
} finally {
  await database.close();
}
