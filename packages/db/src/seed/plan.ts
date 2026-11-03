// Plan déterministe du seed (ADR-007) : une centaine de profils, des abonnements et des posts avec
// images. Fonction pure de la date d'exécution : mêmes identifiants, usernames, relations et images
// d'une exécution à l'autre (seules les dates dépendent de `now`, et ne sont écrites qu'une fois).
import {
  fixedId,
  SEED_BLOCKS,
  SEED_FOLLOWS,
  SEED_PROFILES,
  type SeedKey,
  type SeedProfile,
} from './fixed-profiles.ts';
import { Random } from './random.ts';

/** 9 profils fixes de T4 + 91 générés. */
export const SEED_PROFILE_COUNT = 100;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Fenêtre des posts récents (repère « Vous êtes à jour » de l'app). */
const RECENT_DAYS = 3;
const HISTORY_DAYS = 30;

/** Cadres d'Instagram : portrait 4:5, carré, paysage 1.91:1 ; dimensions de la variante `large`. */
export const RATIOS = {
  portrait: { width: 1080, height: 1350 },
  square: { width: 1080, height: 1080 },
  landscape: { width: 1080, height: 566 },
  /** Story plein écran 9:16 (T24). */
  story: { width: 1080, height: 1920 },
} as const;
export type Ratio = keyof typeof RATIOS;

export interface PlannedProfile extends SeedProfile {
  avatarMediaId: string | null;
}

export interface PlannedMedia {
  id: string;
  ownerId: string;
  purpose: 'post' | 'avatar' | 'story';
  /** Graine de l'image d'exemple (picsum.photos) : même graine, même photo. */
  source: string;
  ratio: Ratio;
  attachedAt: Date;
}

export interface PlannedPost {
  id: string;
  authorId: string;
  caption: string;
  createdAt: Date;
  mediaIds: string[];
}

/** Story photo (T24) : dates relatives à l'exécution, réécrites à chaque seed pour rester active. */
export interface PlannedStory {
  id: string;
  authorId: string;
  mediaId: string;
  audience: 'everyone' | 'close_friends';
  createdAt: Date;
  expiresAt: Date;
}

export interface SeedPlan {
  profiles: PlannedProfile[];
  /** `[abonné, suivi]` */
  follows: [string, string][];
  /** `[bloqueur, bloqué]` */
  blocks: [string, string][];
  media: PlannedMedia[];
  posts: PlannedPost[];
  stories: PlannedStory[];
  /** `[propriétaire, ami proche]` */
  closeFriends: [string, string][];
}

// UUID v7 fixes (préfixe des profils de T4) : le quatrième groupe distingue profils, posts et médias.
const seedUuid = (group: string, n: number) =>
  `0199a1b2-5eed-7000-${group}-${String(n).padStart(12, '0')}`;
export const seedProfileId = (n: number) => seedUuid('8000', n);
const seedPostId = (n: number) => seedUuid('9000', n);
const seedMediaId = (n: number) => seedUuid('a000', n);
const seedStoryId = (n: number) => seedUuid('b000', n);
const HOUR_MS = 60 * 60 * 1000;

const FIRST_NAMES = [
  'Adam',
  'Alice',
  'Anaïs',
  'Arthur',
  'Baptiste',
  'Camille',
  'Céline',
  'Clara',
  'Clément',
  'Élise',
  'Enzo',
  'Éva',
  'Gabriel',
  'Hélène',
  'Jules',
  'Julie',
  'Laura',
  'Léo',
  'Louis',
  'Louise',
  'Lina',
  'Manon',
  'Margaux',
  'Mathis',
  'Maxime',
  'Mila',
  'Noah',
  'Noémie',
  'Paul',
  'Pauline',
  'Raphaël',
  'Rose',
  'Sacha',
  'Sarah',
  'Théo',
  'Victor',
  'Yasmine',
  'Zoé',
] as const;
const LAST_NAMES = [
  'André',
  'Bertrand',
  'Blanc',
  'Bonnet',
  'Chevalier',
  'Clément',
  'David',
  'Dubois',
  'Dupont',
  'Faure',
  'Fontaine',
  'François',
  'Garcia',
  'Gauthier',
  'Girard',
  'Guerin',
  'Henry',
  'Lefebvre',
  'Legrand',
  'Lemoine',
  'Marchand',
  'Mercier',
  'Morel',
  'Muller',
  'Nicolas',
  'Perrin',
  'Robin',
  'Rousseau',
  'Simon',
  'Vincent',
] as const;
const BIOS = [
  '',
  '',
  '',
  'Lyon ☀️',
  'Café, livres et randonnées.',
  'Photographie argentique 🎞️',
  'Paris · Marseille',
  'Cuisine maison 🍝',
  'Voyages et carnets de route.',
  'Étudiante en design.',
  'Course à pied 🏃',
  'Musique et vinyles.',
  'Jardinage urbain 🌱',
  'Surf et océan 🌊',
  'Architecture et lignes droites.',
  'Chat lover 🐈',
] as const;
const CAPTIONS = [
  '',
  '',
  'Bonne journée !',
  'Golden hour ✨',
  'Week-end au vert 🌿',
  'Petit déjeuner du dimanche ☕',
  'Vue imprenable depuis là-haut.',
  'Souvenirs de vacances',
  'La mer, toujours 🌊',
  'Balade en ville',
  'Nouveau projet en cours…',
  'Couleurs d’automne 🍂',
  'Retour aux sources',
  'Un peu de calme',
  'Ciel du soir',
  'Le meilleur moment de la semaine',
  'Road trip 🚐',
  'Lumière parfaite ce matin',
  'Encore un café ?',
  'Détails',
  'Escapade improvisée',
  'Dimanche tranquille',
  'On y retourne quand ?',
  'Instant suspendu',
];

/** Lettres minuscules sans accents, pour composer un username valide (`[a-z0-9._]`). */
const slug = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

function generateProfiles(random: Random): SeedProfile[] {
  const taken = new Set(Object.values(SEED_PROFILES).map((p) => p.username));
  const generated: SeedProfile[] = [];
  const fixedCount = Object.keys(SEED_PROFILES).length;
  for (let n = fixedCount + 1; n <= SEED_PROFILE_COUNT; n++) {
    const [first, last] = [random.pick(FIRST_NAMES), random.pick(LAST_NAMES)];
    const [f, l] = [slug(first), slug(last)];
    let username = random.pick([
      `${f}.${l}`,
      `${f}_${l}`,
      `${f}${l}`,
      `${f}.${l}${random.int(1, 99)}`,
    ]);
    while (taken.has(username)) username = `${f}.${l}${random.int(1, 999)}`;
    taken.add(username);
    generated.push({
      id: seedProfileId(n),
      username,
      fullName: `${first} ${last}`,
      bio: random.pick(BIOS),
      isPrivate: random.chance(0.15),
    });
  }
  return generated;
}

function pickRatio(random: Random): Ratio {
  const roll = random.next();
  if (roll < 0.55) return 'portrait';
  return roll < 0.88 ? 'square' : 'landscape';
}

export function planSeed(now: Date): SeedPlan {
  const random = new Random(20261001);
  const fixed = Object.values(SEED_PROFILES) as SeedProfile[];
  const generated = generateProfiles(random);
  const media: PlannedMedia[] = [];
  const nextMediaId = () => seedMediaId(media.length + 1);

  // Photo de profil pour la plupart des comptes.
  const profiles: PlannedProfile[] = [...fixed, ...generated].map((profile, index) => {
    if (!random.chance(0.85)) return { ...profile, avatarMediaId: null };
    const id = nextMediaId();
    media.push({
      id,
      ownerId: profile.id,
      purpose: 'avatar',
      source: `clone-avatar-${index + 1}`,
      ratio: 'square',
      attachedAt: now,
    });
    return { ...profile, avatarMediaId: id };
  });

  // Abonnements : ceux de T4, puis chaque compte généré suit de 4 à 20 comptes (générés ou de T4,
  // sauf Inès, suspendue).
  const follows = new Map<string, [string, string]>();
  const addFollow = (follower: string, followee: string) => {
    if (follower !== followee) follows.set(`${follower}>${followee}`, [follower, followee]);
  };
  for (const [follower, followee] of SEED_FOLLOWS) addFollow(fixedId(follower), fixedId(followee));
  const followable = [
    ...(['lea', 'hugo', 'chloe', 'jade', 'nathan', 'lucas', 'emma', 'tom'] satisfies SeedKey[]).map(
      fixedId,
    ),
    ...generated.map((p) => p.id),
  ];
  for (const profile of generated) {
    for (const followee of random.sample(followable, random.int(4, 20))) {
      addFollow(profile.id, followee);
    }
  }

  // Posts : 0 à 6 par compte, un sur cinq en carrousel (2 à 4 photos au cadre de la première).
  const posts: PlannedPost[] = [];
  for (const profile of profiles) {
    const count = random.int(0, 6);
    for (let i = 0; i < count; i++) {
      const ratio = pickRatio(random);
      const ageDays = random.chance(0.3)
        ? random.next() * RECENT_DAYS
        : RECENT_DAYS + random.next() * (HISTORY_DAYS - RECENT_DAYS);
      const createdAt = new Date(Math.round(now.getTime() - ageDays * DAY_MS));
      const mediaIds: string[] = [];
      for (let j = random.chance(0.2) ? random.int(2, 4) : 1; j > 0; j--) {
        const id = nextMediaId();
        media.push({
          id,
          ownerId: profile.id,
          purpose: 'post',
          source: `clone-${random.int(1, 240)}`,
          ratio,
          attachedAt: createdAt,
        });
        mediaIds.push(id);
      }
      posts.push({
        id: seedPostId(posts.length + 1),
        authorId: profile.id,
        caption: random.pick(CAPTIONS),
        createdAt,
        mediaIds,
      });
    }
  }

  const { stories, closeFriends } = planStories(now, profiles, [...follows.values()], (story) => {
    const id = nextMediaId();
    media.push({ id, purpose: 'story', ratio: 'story', ...story });
    return id;
  });

  return {
    profiles,
    follows: [...follows.values()],
    blocks: SEED_BLOCKS.map(([blocker, blocked]) => [fixedId(blocker), fixedId(blocked)]),
    media,
    posts,
    stories,
    closeFriends,
  };
}

/**
 * Stories actives (T24) : Léa en a une pour tout le monde et une pour ses amis proches (Hugo, et le
 * compte de démo), Chloé une seule pour ses amis proches (Léa) ; 40 % des comptes générés en ont 1 à
 * 3, publiées dans les 20 dernières heures, un quart pour leurs amis proches (3 de leurs abonnés).
 */
function planStories(
  now: Date,
  profiles: readonly PlannedProfile[],
  follows: readonly [string, string][],
  addPhoto: (story: { ownerId: string; source: string; attachedAt: Date }) => string,
): Pick<SeedPlan, 'stories' | 'closeFriends'> {
  const random = new Random(20261103);
  const stories: PlannedStory[] = [];
  const closeFriends = new Map<string, [string, string]>();
  const add = (authorId: string, hoursAgo: number, audience: PlannedStory['audience']): void => {
    const createdAt = new Date(Math.round(now.getTime() - hoursAgo * HOUR_MS));
    const mediaId = addPhoto({
      ownerId: authorId,
      source: `clone-story-${stories.length + 1}`,
      attachedAt: createdAt,
    });
    stories.push({
      id: seedStoryId(stories.length + 1),
      authorId,
      mediaId,
      audience,
      createdAt,
      expiresAt: new Date(createdAt.getTime() + 24 * HOUR_MS),
    });
  };
  const addCloseFriend = (owner: string, friend: string) =>
    closeFriends.set(`${owner}>${friend}`, [owner, friend]);

  add(fixedId('lea'), 6, 'everyone');
  add(fixedId('lea'), 2, 'close_friends');
  addCloseFriend(fixedId('lea'), fixedId('hugo'));
  add(fixedId('chloe'), 1, 'close_friends');
  addCloseFriend(fixedId('chloe'), fixedId('lea'));

  const fixedIds = new Set<string>(Object.values(SEED_PROFILES).map((profile) => profile.id));
  for (const profile of profiles) {
    if (fixedIds.has(profile.id) || !random.chance(0.4)) continue;
    let hasCloseFriendsStory = false;
    for (let count = random.int(1, 3); count > 0; count--) {
      const audience = random.chance(0.25) ? 'close_friends' : 'everyone';
      hasCloseFriendsStory ||= audience === 'close_friends';
      add(profile.id, 0.2 + random.next() * 19.8, audience);
    }
    if (!hasCloseFriendsStory) continue;
    const followers = follows
      .filter(([, followee]) => followee === profile.id)
      .map(([follower]) => follower);
    for (const friend of random.sample(followers, Math.min(3, followers.length)))
      addCloseFriend(profile.id, friend);
  }
  return { stories, closeFriends: [...closeFriends.values()] };
}

/**
 * Relations du compte de démo (`SEED_VIEWER_USERNAME`) avec les profils du seed : celles de T4,
 * plus 30 comptes générés suivis (feed fourni), 20 qui le suivent, et Inès (suspendue : ses posts
 * restent absents du feed).
 */
export function planViewerRelations(
  viewerId: string,
): Pick<SeedPlan, 'follows' | 'blocks' | 'closeFriends'> {
  const random = new Random(7);
  const fixedCount = Object.keys(SEED_PROFILES).length;
  const generatedIds = Array.from({ length: SEED_PROFILE_COUNT - fixedCount }, (_, i) =>
    seedProfileId(fixedCount + 1 + i),
  );
  return {
    follows: [
      [viewerId, fixedId('lea')],
      [viewerId, fixedId('chloe')],
      [viewerId, fixedId('ines')],
      [fixedId('hugo'), viewerId],
      [fixedId('nathan'), viewerId],
      ...random.sample(generatedIds, 30).map((id): [string, string] => [viewerId, id]),
      ...random.sample(generatedIds, 20).map((id): [string, string] => [id, viewerId]),
    ],
    // Emma bloque le compte de démo, qui bloque Tom : profils en 404, posts absents du feed.
    blocks: [
      [fixedId('emma'), viewerId],
      [viewerId, fixedId('tom')],
    ],
    // Le compte de démo voit la story « amis proches » de Léa, pas celle de Chloé (T24).
    closeFriends: [[fixedId('lea'), viewerId]],
  };
}
