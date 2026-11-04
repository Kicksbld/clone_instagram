import { describe, expect, it } from 'vitest';

import { SEED_PROFILES } from '../src/seed/fixed-profiles.ts';
import { planSeed, planViewerRelations, SEED_PROFILE_COUNT } from '../src/seed/plan.ts';

const NOW = new Date('2026-10-01T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const plan = planSeed(NOW);

describe('planSeed', () => {
  it('déterministe : même plan à chaque exécution', () => {
    expect(planSeed(NOW)).toEqual(plan);
  });

  it('garde les 9 profils de T4 et complète jusqu’à 100', () => {
    expect(plan.profiles).toHaveLength(SEED_PROFILE_COUNT);
    for (const fixed of Object.values(SEED_PROFILES)) {
      expect(plan.profiles).toContainEqual(expect.objectContaining(fixed));
    }
  });

  it('usernames valides et uniques', () => {
    const usernames = plan.profiles.map((p) => p.username);
    for (const username of usernames) expect(username).toMatch(/^[a-z0-9._]{1,30}$/);
    expect(new Set(usernames).size).toBe(usernames.length);
  });

  it('identifiants uniques, UUID v7', () => {
    const ids = [...plan.profiles, ...plan.posts, ...plan.media].map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });

  it('posts de 1 à 4 photos au même cadre, de leur auteur, rattachées à la date du post', () => {
    const mediaById = new Map(plan.media.map((item) => [item.id, item]));
    expect(plan.posts.length).toBeGreaterThan(200);
    for (const post of plan.posts) {
      expect(post.mediaIds.length).toBeGreaterThanOrEqual(1);
      expect(post.mediaIds.length).toBeLessThanOrEqual(4);
      const items = post.mediaIds.map((id) => mediaById.get(id));
      expect(new Set(items.map((item) => item?.ratio)).size).toBe(1);
      for (const item of items) {
        expect(item).toMatchObject({
          ownerId: post.authorId,
          purpose: 'post',
          attachedAt: post.createdAt,
        });
      }
    }
  });

  it('dates sur 30 jours, dont une partie sur les 3 derniers', () => {
    const ages = plan.posts.map((post) => (NOW.getTime() - post.createdAt.getTime()) / DAY_MS);
    for (const age of ages) {
      expect(age).toBeGreaterThanOrEqual(0);
      expect(age).toBeLessThanOrEqual(30);
    }
    expect(ages.filter((age) => age < 3).length).toBeGreaterThan(20);
  });

  it('abonnements sans doublon ni abonnement à soi-même', () => {
    const keys = plan.follows.map(([a, b]) => `${a}>${b}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const [follower, followee] of plan.follows) expect(follower).not.toBe(followee);
  });
});

describe('planSeed — stories (T24)', () => {
  it('actives à la date du seed, photo 9:16 de leur auteur, une partie pour les amis proches', () => {
    const mediaById = new Map(plan.media.map((item) => [item.id, item]));
    expect(plan.stories.length).toBeGreaterThan(20);
    for (const story of plan.stories) {
      expect(story.createdAt.getTime()).toBeLessThanOrEqual(NOW.getTime());
      expect(story.expiresAt.getTime()).toBeGreaterThan(NOW.getTime());
      expect(mediaById.get(story.mediaId)).toMatchObject({
        ownerId: story.authorId,
        purpose: 'story',
        ratio: 'story',
      });
    }
    expect(plan.stories.some((story) => story.audience === 'close_friends')).toBe(true);
  });

  it('amis proches sans doublon ni soi-même', () => {
    const keys = plan.closeFriends.map(([a, b]) => `${a}>${b}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const [owner, friend] of plan.closeFriends) expect(owner).not.toBe(friend);
  });
});

describe('planViewerRelations', () => {
  const viewer = '0199a1b2-0000-7000-8000-00000000abcd';

  it('déterministe, avec les relations de T4', () => {
    const relations = planViewerRelations(viewer);
    expect(planViewerRelations(viewer)).toEqual(relations);
    expect(relations.follows).toContainEqual([viewer, SEED_PROFILES.lea.id]);
    expect(relations.follows).toContainEqual([viewer, SEED_PROFILES.ines.id]);
    expect(relations.blocks).toEqual([
      [SEED_PROFILES.emma.id, viewer],
      [viewer, SEED_PROFILES.tom.id],
    ]);
    expect(relations.follows.filter(([follower]) => follower === viewer)).toHaveLength(34);
    expect(relations.closeFriends).toEqual([[SEED_PROFILES.lea.id, viewer]]);
  });
});

describe('planSeed — J’aime et commentaires (T33)', () => {
  const followsSet = new Set(plan.follows.map(([a, b]) => `${a}>${b}`));
  const authorOf = new Map(plan.posts.map((post) => [post.id, post]));

  it('par des abonnés de l’auteur, sans doublon, entre la publication et le seed', () => {
    expect(plan.likes.length).toBeGreaterThan(500);
    expect(plan.comments.length).toBeGreaterThan(50);
    const keys = plan.likes.map((like) => `${like.userId}>${like.postId}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const row of [
      ...plan.likes,
      ...plan.comments.map((c) => ({ ...c, userId: c.authorId })),
    ]) {
      const post = authorOf.get(row.postId);
      expect(followsSet.has(`${row.userId}>${post?.authorId}`)).toBe(true);
      expect(row.createdAt.getTime()).toBeGreaterThanOrEqual(post?.createdAt.getTime() ?? 0);
      expect(row.createdAt.getTime()).toBeLessThanOrEqual(NOW.getTime());
    }
  });

  it('compte de démo : Léa et Hugo sont des abonnés mutuels', () => {
    const viewer = '0199a1b2-0000-7000-8000-00000000abcd';
    const keys = new Set(planViewerRelations(viewer).follows.map(([a, b]) => `${a}>${b}`));
    for (const key of ['lea', 'hugo'] as const) {
      const id = SEED_PROFILES[key].id;
      expect(keys.has(`${viewer}>${id}`) && keys.has(`${id}>${viewer}`)).toBe(true);
    }
  });
});
