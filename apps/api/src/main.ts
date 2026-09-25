// Composition root (ADR-005) : configuration, puis assemblage manuel des dépendances.
import { createDatabase } from '@clone/db';

import { buildApp } from './app.ts';
import { CheckUsernameAvailability } from './modules/identity/application/use-cases/check-username-availability.ts';
import { CompleteOnboarding } from './modules/identity/application/use-cases/complete-onboarding.ts';
import { GetMe } from './modules/identity/application/use-cases/get-me.ts';
import { UpdateMe } from './modules/identity/application/use-cases/update-me.ts';
import { DrizzleProfileRepository } from './modules/identity/infrastructure/persistence/drizzle-profile-repository.ts';
import { createJwtVerifier, supabaseJwks } from './shared/infrastructure/auth/token-verifier.ts';
import { loadConfig } from './shared/infrastructure/config.ts';
import { systemClock } from './shared/infrastructure/system-clock.ts';

const config = loadConfig(process.env);
const database = createDatabase(config.DATABASE_URL);

const profiles = new DrizzleProfileRepository(database.db);

const app = buildApp({
  logLevel: config.LOG_LEVEL,
  dependencies: {
    tokenVerifier: createJwtVerifier({
      issuer: config.SUPABASE_JWT_ISSUER,
      keys: supabaseJwks(config.SUPABASE_URL),
    }),
    identity: {
      getMe: new GetMe(profiles),
      updateMe: new UpdateMe(profiles),
      completeOnboarding: new CompleteOnboarding(profiles, systemClock),
      checkUsernameAvailability: new CheckUsernameAvailability(profiles),
    },
  },
});

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  app.log.info({ signal }, 'Arrêt de l’API');
  await app.close();
  await database.close();
  process.exit(0);
}

process.once('SIGTERM', (signal) => void shutdown(signal));
process.once('SIGINT', (signal) => void shutdown(signal));

await app.listen({ port: config.API_PORT, host: '0.0.0.0' });
