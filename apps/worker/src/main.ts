// Worker BullMQ (ADR-008) : consomme les files de packages/jobs, sans logique métier.
import { createDatabase } from '@clone/db';
import { DEFAULT_JOB_OPTIONS, PROCESS_IMAGE, PURGE_ORPHAN_MEDIA, QUEUE_NAMES } from '@clone/jobs';
import { StorageClient } from '@supabase/storage-js';
import { Queue, Worker } from 'bullmq';
import { pino } from 'pino';

import { loadConfig } from './config.ts';
import { processImage } from './jobs/process-image.ts';
import { purgeOrphanMedia } from './jobs/purge-orphan-media.ts';
import { createProcessor } from './processor.ts';
import { SupabaseWorkerStorage } from './storage.ts';

const config = loadConfig(process.env);
const logger = pino({ level: config.LOG_LEVEL });
const database = createDatabase(config.DATABASE_URL);
const storage = new SupabaseWorkerStorage(
  new StorageClient(new URL('/storage/v1', config.SUPABASE_URL).toString(), {
    apikey: config.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
  }),
);

// `maxRetriesPerRequest: null` est exigé par BullMQ pour les connexions bloquantes des workers.
// `family: 0` : résolution IPv4 et IPv6 (le réseau privé Railway est en IPv6).
const connection = { url: config.REDIS_URL, maxRetriesPerRequest: null, family: 0 };
const dependencies = { db: database.db, storage, logger };
const processor = createProcessor(
  new Map([
    [PROCESS_IMAGE.name, processImage(dependencies)],
    [PURGE_ORPHAN_MEDIA.name, purgeOrphanMedia(dependencies)],
  ]),
);
const queueNames = Object.values(QUEUE_NAMES);

const workers = queueNames.map((queueName) => {
  const worker = new Worker(queueName, processor, { connection });
  worker.on('failed', (job, error) => {
    logger.error(
      { queue: queueName, jobId: job?.id, jobName: job?.name, err: error },
      'Job en échec',
    );
  });
  worker.on('error', (error) => {
    logger.error({ queue: queueName, err: error }, 'Erreur du worker');
  });
  return worker;
});

// Jobs répétés : planification idempotente, un seul planificateur quel que soit le nombre de démarrages.
const maintenance = new Queue(QUEUE_NAMES.maintenance, { connection });
await maintenance.upsertJobScheduler(
  PURGE_ORPHAN_MEDIA.name,
  { every: PURGE_ORPHAN_MEDIA.everyMs },
  { name: PURGE_ORPHAN_MEDIA.name, opts: DEFAULT_JOB_OPTIONS },
);

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  logger.info({ signal }, 'Arrêt du worker');
  await Promise.all(workers.map((worker) => worker.close()));
  await maintenance.close();
  await database.close();
  process.exit(0);
}

process.once('SIGTERM', (signal) => void shutdown(signal));
process.once('SIGINT', (signal) => void shutdown(signal));

await Promise.all(workers.map((worker) => worker.waitUntilReady()));
logger.info({ queues: queueNames }, 'Worker démarré');
