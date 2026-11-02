// Trois mires animées originales (CC0), produites localement : aucun téléchargement ni droit tiers.
// Passe par le vrai job BullMQ ; relançable, mêmes identifiants et chemins.
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { createDatabase, media, posts, postMedia, profiles, STORAGE_BUCKETS } from '@clone/db';
import { DEFAULT_JOB_OPTIONS, PROCESS_VIDEO, processVideoJobId } from '@clone/jobs';
import { Queue, QueueEvents } from 'bullmq';
import { eq, sql } from 'drizzle-orm';
import { loadConfig } from './config.ts';
import { SupabaseWorkerStorage } from './storage.ts';

const config = loadConfig(process.env);
const database = createDatabase(config.DATABASE_URL);
const connection = { url: config.REDIS_URL, family: 0 };
const queue = new Queue(PROCESS_VIDEO.queue, { connection });
const events = new QueueEvents(PROCESS_VIDEO.queue, { connection });
const storage = new SupabaseWorkerStorage(new URL('/storage/v1', config.SUPABASE_URL).toString(), {
  apikey: config.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
});
const directory = await mkdtemp(join(tmpdir(), 'seed-reels-'));
try {
  await events.waitUntilReady();
  if (!(await queue.getWorkers()).length)
    throw new Error('Démarrer le worker avant le seed des reels : pnpm --filter @clone/worker dev');
  for (let index = 1; index <= 3; index++) {
    const suffix = String(index).padStart(12, '0');
    const ownerId = `0199a1b2-5eed-7000-8000-${suffix}`;
    const mediaId = `0199a1b2-5eed-7000-b000-${suffix}`;
    const postId = `0199a1b2-5eed-7000-c000-${suffix}`;
    const [existing] = await database.db.select().from(media).where(eq(media.id, mediaId));
    if (!existing) {
      const file = join(directory, `${index}.mp4`);
      await promisify(execFile)('ffmpeg', [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc2=size=720x1280:rate=24',
        '-t',
        '5',
        '-vf',
        `hue=h=${index * 60}`,
        '-c:v',
        'libx264',
        '-threads',
        '2',
        '-b:v',
        '4M',
        '-pix_fmt',
        'yuv420p',
        file,
      ]);
      const bytes = await readFile(file);
      const originalPath = `${ownerId}/${mediaId}`;
      await storage.upload(STORAGE_BUCKETS.uploads, originalPath, bytes, 'video/mp4');
      await database.db.insert(media).values({
        id: mediaId,
        ownerId,
        kind: 'video',
        purpose: 'post',
        status: 'uploaded',
        originalPath,
        mimeType: 'video/mp4',
        sizeBytes: bytes.length,
      });
    }
    if (existing?.status !== 'ready') {
      let old = await queue.getJob(processVideoJobId(mediaId));
      if (old && (await old.isCompleted())) {
        await old.remove();
        old = undefined;
      }
      if (old && (await old.isFailed())) await old.retry();
      const job =
        old ??
        (await queue.add(PROCESS_VIDEO.name, PROCESS_VIDEO.payload.parse({ mediaId }), {
          ...DEFAULT_JOB_OPTIONS,
          jobId: processVideoJobId(mediaId),
        }));
      await job.waitUntilFinished(events, 11 * 60 * 1000);
    }
    await database.db.transaction(async (tx) => {
      const [ready] = await tx.select().from(media).where(eq(media.id, mediaId));
      if (ready?.status !== 'ready') throw new Error(`Média de seed ${mediaId} non prêt`);
      const created = await tx
        .insert(posts)
        .values({
          id: postId,
          authorId: ownerId,
          kind: 'reel',
          caption: `Mire animée ${index} · CC0`,
          createdAt: new Date(),
        })
        .onConflictDoNothing()
        .returning();
      if (!created.length) return;
      await tx.insert(postMedia).values({ postId, mediaId, position: 0 });
      await tx.update(media).set({ attachedAt: new Date() }).where(eq(media.id, mediaId));
      await tx
        .update(profiles)
        .set({ postCount: sql`${profiles.postCount} + 1` })
        .where(eq(profiles.id, ownerId));
    });
    console.info(`db:seed — reel ${index}/3 prêt`);
  }
} finally {
  await rm(directory, { recursive: true, force: true });
  await events.close();
  await queue.close();
  await database.close();
}
