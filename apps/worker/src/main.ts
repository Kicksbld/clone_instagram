// Worker BullMQ (ADR-008) : consomme les files de packages/jobs, sans logique métier.
import { QUEUE_NAMES } from '@clone/jobs';
import { Worker } from 'bullmq';
import { pino } from 'pino';

import { loadConfig } from './config.ts';
import { createProcessor } from './processor.ts';

const config = loadConfig(process.env);
const logger = pino({ level: config.LOG_LEVEL });

// `maxRetriesPerRequest: null` est exigé par BullMQ pour les connexions bloquantes des workers.
// `family: 0` : résolution IPv4 et IPv6 (le réseau privé Railway est en IPv6).
const connection = { url: config.REDIS_URL, maxRetriesPerRequest: null, family: 0 };
const processor = createProcessor(new Map());
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

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  logger.info({ signal }, 'Arrêt du worker');
  await Promise.all(workers.map((worker) => worker.close()));
  process.exit(0);
}

process.once('SIGTERM', (signal) => void shutdown(signal));
process.once('SIGINT', (signal) => void shutdown(signal));

await Promise.all(workers.map((worker) => worker.waitUntilReady()));
logger.info({ queues: queueNames }, 'Worker démarré');
