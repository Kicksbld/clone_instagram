// Composition root (ADR-005) : configuration, puis assemblage manuel des dépendances.
import { buildApp } from './app.ts';
import { loadConfig } from './shared/infrastructure/config.ts';

const config = loadConfig(process.env);
const app = buildApp({ logLevel: config.LOG_LEVEL });

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  app.log.info({ signal }, 'Arrêt de l’API');
  await app.close();
  process.exit(0);
}

process.once('SIGTERM', (signal) => void shutdown(signal));
process.once('SIGINT', (signal) => void shutdown(signal));

await app.listen({ port: config.API_PORT, host: '0.0.0.0' });
