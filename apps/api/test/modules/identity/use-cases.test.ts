import { beforeEach, describe, expect, it } from 'vitest';

import { CheckUsernameAvailability } from '../../../src/modules/identity/application/use-cases/check-username-availability.ts';
import { CompleteOnboarding } from '../../../src/modules/identity/application/use-cases/complete-onboarding.ts';
import { GetMe } from '../../../src/modules/identity/application/use-cases/get-me.ts';
import { UpdateMe } from '../../../src/modules/identity/application/use-cases/update-me.ts';
import {
  AgeRequirementNotMetError,
  ProfileAlreadyExistsError,
  ProfileNotFoundError,
  UsernameTakenError,
} from '../../../src/modules/identity/domain/errors.ts';
import { InMemoryUnitOfWork } from '../../support/fakes.ts';
import { InMemoryMediaRepository } from '../../support/in-memory-media-repository.ts';
import { InMemoryProfileRepository } from '../../support/in-memory-profile-repository.ts';

const NOW = new Date('2026-09-25T12:00:00.000Z');
const clock = { now: () => NOW };
const ME = '0199a1b2-0000-7000-8000-000000000001';
const OTHER = '0199a1b2-0000-7000-8000-000000000002';

let profiles: InMemoryProfileRepository;

beforeEach(() => {
  profiles = new InMemoryProfileRepository(() => NOW);
});

describe('GetMe', () => {
  it('renvoie mon profil', async () => {
    profiles.add({ id: ME, username: 'killian' });
    await expect(new GetMe(profiles).execute({ userId: ME })).resolves.toMatchObject({
      id: ME,
      username: 'killian',
    });
  });

  it('profil absent → profile_not_found', async () => {
    await expect(new GetMe(profiles).execute({ userId: ME })).rejects.toBeInstanceOf(
      ProfileNotFoundError,
    );
  });
});

describe('CompleteOnboarding', () => {
  const input = {
    userId: ME,
    username: 'killian',
    fullName: '  Killian  ',
    birthDate: '2000-01-31',
  };

  it('crée le profil avec le nom nettoyé et les valeurs par défaut', async () => {
    const profile = await new CompleteOnboarding(profiles, clock).execute(input);

    expect(profile).toMatchObject({
      id: ME,
      username: 'killian',
      fullName: 'Killian',
      birthDate: '2000-01-31',
      bio: '',
      isPrivate: false,
      status: 'active',
      followerCount: 0,
    });
    expect(profiles.rows.has(ME)).toBe(true);
  });

  it('username pris → username_taken', async () => {
    profiles.add({ id: OTHER, username: 'killian' });
    await expect(new CompleteOnboarding(profiles, clock).execute(input)).rejects.toBeInstanceOf(
      UsernameTakenError,
    );
  });

  it('profil déjà créé → profile_already_exists, même si le username est celui d’un autre', async () => {
    profiles.add({ id: ME, username: 'moi' });
    profiles.add({ id: OTHER, username: 'killian' });
    await expect(new CompleteOnboarding(profiles, clock).execute(input)).rejects.toBeInstanceOf(
      ProfileAlreadyExistsError,
    );
  });

  it('moins de 13 ans → age_requirement_not_met, sans créer de profil', async () => {
    await expect(
      new CompleteOnboarding(profiles, clock).execute({ ...input, birthDate: '2013-09-26' }),
    ).rejects.toBeInstanceOf(AgeRequirementNotMetError);
    expect(profiles.rows.size).toBe(0);
  });

  it('13 ans le jour même → accepté', async () => {
    await expect(
      new CompleteOnboarding(profiles, clock).execute({ ...input, birthDate: '2013-09-25' }),
    ).resolves.toMatchObject({ id: ME });
  });
});

describe('UpdateMe', () => {
  const updateMe = () =>
    new UpdateMe(
      profiles,
      new InMemoryUnitOfWork({ profiles, media: new InMemoryMediaRepository() }),
    );

  it('ne modifie que les champs fournis, nettoyés', async () => {
    profiles.add({ id: ME, username: 'killian', fullName: 'Killian', bio: 'avant' });

    const profile = await updateMe().execute({
      userId: ME,
      changes: { bio: '  Dev iOS  ' },
    });

    expect(profile).toMatchObject({ username: 'killian', fullName: 'Killian', bio: 'Dev iOS' });
  });

  it('bio vide → bio effacée', async () => {
    profiles.add({ id: ME, username: 'killian', bio: 'avant' });
    const profile = await updateMe().execute({ userId: ME, changes: { bio: '' } });
    expect(profile.bio).toBe('');
  });

  it('garder son propre username n’est pas un conflit', async () => {
    profiles.add({ id: ME, username: 'killian' });
    await expect(
      updateMe().execute({ userId: ME, changes: { username: 'killian' } }),
    ).resolves.toMatchObject({ username: 'killian' });
  });

  it('username d’un autre → username_taken', async () => {
    profiles.add({ id: ME, username: 'killian' });
    profiles.add({ id: OTHER, username: 'autre' });
    await expect(
      updateMe().execute({ userId: ME, changes: { username: 'autre' } }),
    ).rejects.toBeInstanceOf(UsernameTakenError);
  });

  it('profil absent → profile_not_found', async () => {
    await expect(updateMe().execute({ userId: ME, changes: { bio: 'x' } })).rejects.toBeInstanceOf(
      ProfileNotFoundError,
    );
  });
});

describe('CheckUsernameAvailability', () => {
  it('username libre → disponible, sans suggestion', async () => {
    await expect(
      new CheckUsernameAvailability(profiles).execute({ userId: ME, username: 'killian' }),
    ).resolves.toEqual({ username: 'killian', available: true, suggestions: [] });
  });

  it('mon propre username est disponible pour moi', async () => {
    profiles.add({ id: ME, username: 'killian' });
    await expect(
      new CheckUsernameAvailability(profiles).execute({ userId: ME, username: 'killian' }),
    ).resolves.toMatchObject({ available: true });
  });

  it('username pris → 3 suggestions libres, les candidats pris sont sautés', async () => {
    profiles.add({ id: OTHER, username: 'killian' });
    profiles.add({ id: '0199a1b2-0000-7000-8000-000000000003', username: 'killian_' });

    await expect(
      new CheckUsernameAvailability(profiles).execute({ userId: ME, username: 'killian' }),
    ).resolves.toEqual({
      username: 'killian',
      available: false,
      suggestions: ['killian.', 'killian1', 'killian2'],
    });
  });
});
