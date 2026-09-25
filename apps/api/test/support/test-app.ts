import { buildApp } from '../../src/app.ts';
import { CheckUsernameAvailability } from '../../src/modules/identity/application/use-cases/check-username-availability.ts';
import { CompleteOnboarding } from '../../src/modules/identity/application/use-cases/complete-onboarding.ts';
import { GetMe } from '../../src/modules/identity/application/use-cases/get-me.ts';
import { UpdateMe } from '../../src/modules/identity/application/use-cases/update-me.ts';
import { InMemoryProfileRepository } from './in-memory-profile-repository.ts';
import { testTokenVerifier } from './tokens.ts';

export const TEST_NOW = new Date('2026-09-25T12:00:00.000Z');

/** App HTTP complète avec des adapters en mémoire et une horloge fixe. */
export function buildTestApp() {
  const profiles = new InMemoryProfileRepository(() => TEST_NOW);
  const clock = { now: () => TEST_NOW };
  const app = buildApp({
    logLevel: 'silent',
    dependencies: {
      tokenVerifier: testTokenVerifier,
      identity: {
        getMe: new GetMe(profiles),
        updateMe: new UpdateMe(profiles),
        completeOnboarding: new CompleteOnboarding(profiles, clock),
        checkUsernameAvailability: new CheckUsernameAvailability(profiles),
      },
    },
  });
  return { app, profiles };
}
