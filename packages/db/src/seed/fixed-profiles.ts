// Profils fixes posés en T4 pour la politique de visibilité (ADR-006) : identifiants, usernames et
// relations inchangés, pour que les comptes de démo existants restent cohérents.
import type { NewProfileRow } from '../schema/index.ts';

export type SeedProfile = Pick<NewProfileRow, 'id' | 'username' | 'fullName' | 'bio'> &
  Partial<Pick<NewProfileRow, 'isPrivate' | 'status'>>;

// Identifiants UUID v7 fixes : le seed retrouve ses lignes d'une exécution à l'autre.
export const SEED_PROFILES = {
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

export type SeedKey = keyof typeof SEED_PROFILES;
export const fixedId = (key: SeedKey): string => SEED_PROFILES[key].id;

/** Abonnements entre profils du seed : `[abonné, suivi]`. */
export const SEED_FOLLOWS: [SeedKey, SeedKey][] = [
  ['lea', 'hugo'],
  ['hugo', 'lea'],
  ['nathan', 'lea'],
  ['chloe', 'lea'],
  ['lea', 'chloe'],
  ['lucas', 'hugo'],
  ['jade', 'nathan'],
];

/** Blocage entre profils du seed : `[bloqueur, bloqué]`. */
export const SEED_BLOCKS: [SeedKey, SeedKey][] = [['nathan', 'lucas']];
