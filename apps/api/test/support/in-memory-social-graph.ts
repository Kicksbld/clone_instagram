import type {
  Account,
  AccountReader,
} from '../../src/modules/social/application/ports/account-reader.ts';
import type {
  FollowCounters,
  FollowRepository,
} from '../../src/modules/social/application/ports/follow-repository.ts';
import type {
  ListQuery,
  SearchQuery,
  SocialGraphReader,
} from '../../src/modules/social/application/ports/social-graph-reader.ts';
import type { UserSummary } from '../../src/modules/social/domain/user-summary.ts';
import type { Profile } from '../../src/modules/identity/domain/profile.ts';
import type { Page } from '../../src/shared/domain/pagination.ts';
import type { FollowEntry, InMemoryRelationshipReader } from './in-memory-relationship-reader.ts';
import type { InMemoryProfileRepository } from './in-memory-profile-repository.ts';

/**
 * Adapters en mémoire du module `social` (ADR-005), sur les profils et les abonnements des autres
 * adapters en mémoire : mêmes règles de visibilité et même ordre que les requêtes Drizzle.
 */
export class InMemorySocialGraph
  implements AccountReader, FollowRepository, FollowCounters, SocialGraphReader
{
  constructor(
    private readonly profiles: InMemoryProfileRepository,
    private readonly relationships: InMemoryRelationshipReader,
  ) {}

  findById(id: string): Promise<Account | null> {
    const profile = this.profiles.rows.get(id);
    if (!profile) return Promise.resolve(null);
    const { status, isPrivate, followerCount } = profile;
    return Promise.resolve({ id, status, isPrivate, followerCount });
  }

  add(followerId: string, followeeId: string): Promise<boolean> {
    return Promise.resolve(this.relationships.follow(followerId, followeeId));
  }

  remove(followerId: string, followeeId: string): Promise<boolean> {
    return Promise.resolve(this.relationships.unfollow(followerId, followeeId));
  }

  apply(followerId: string, followeeId: string, delta: 1 | -1): Promise<number> {
    const follower = this.row(followerId);
    const followee = this.row(followeeId);
    follower.followingCount += delta;
    followee.followerCount += delta;
    return Promise.resolve(followee.followerCount);
  }

  listFollowers(query: ListQuery): Promise<Page<UserSummary>> {
    return this.list(
      query,
      (f) => f.followeeId === query.ownerId,
      (f) => f.followerId,
    );
  }

  listFollowing(query: ListQuery): Promise<Page<UserSummary>> {
    return this.list(
      query,
      (f) => f.followerId === query.ownerId,
      (f) => f.followeeId,
    );
  }

  search({ viewerId, query, limit }: SearchQuery): Promise<UserSummary[]> {
    const matches = [...this.profiles.rows.values()].filter(
      (p) =>
        this.visibleTo(viewerId, p) &&
        (p.username.includes(query) || p.fullName.toLowerCase().includes(query)),
    );
    const rank = (p: Profile) => [
      p.username === query ? 0 : 1,
      p.username.startsWith(query) ? 0 : 1,
      this.relationships.isFollowing(viewerId, p.id) ? 0 : 1,
      -p.followerCount,
    ];
    matches.sort((a, b) => {
      const [ra, rb] = [rank(a), rank(b)];
      const index = ra.findIndex((value, i) => value !== rb[i]);
      return index === -1 ? a.id.localeCompare(b.id) : (ra[index] ?? 0) - (rb[index] ?? 0);
    });
    return Promise.resolve(matches.slice(0, limit).map((p) => this.summary(viewerId, p)));
  }

  private list(
    { viewerId, after, limit }: ListQuery,
    ofOwner: (follow: FollowEntry) => boolean,
    listed: (follow: FollowEntry) => string,
  ): Promise<Page<UserSummary>> {
    const entries = this.relationships.follows
      .filter(ofOwner)
      .map((follow) => ({ follow, profile: this.row(listed(follow)) }))
      .filter(({ profile }) => this.visibleTo(viewerId, profile))
      .sort(
        (a, b) =>
          b.follow.createdAt.getTime() - a.follow.createdAt.getTime() ||
          b.profile.id.localeCompare(a.profile.id),
      )
      .filter(
        ({ follow, profile }) =>
          !after ||
          follow.createdAt.getTime() < after.createdAt.getTime() ||
          (follow.createdAt.getTime() === after.createdAt.getTime() && profile.id < after.id),
      );
    const page = entries.slice(0, limit);
    const last = page.at(-1);
    return Promise.resolve({
      items: page.map(({ profile }) => this.summary(viewerId, profile)),
      next:
        entries.length > limit && last
          ? { createdAt: last.follow.createdAt, id: last.profile.id }
          : null,
    });
  }

  private visibleTo(viewerId: string, profile: Profile): boolean {
    return (
      profile.status === 'active' && !this.relationships.isBlockedEitherWay(viewerId, profile.id)
    );
  }

  private summary(viewerId: string, profile: Profile): UserSummary {
    return {
      id: profile.id,
      username: profile.username,
      fullName: profile.fullName,
      isPrivate: profile.isPrivate,
      avatarVariants: profile.avatar?.variants ?? null,
      relationship: {
        following: this.relationships.isFollowing(viewerId, profile.id),
        followedBy: this.relationships.isFollowing(profile.id, viewerId),
      },
    };
  }

  private row(id: string): Profile {
    const profile = this.profiles.rows.get(id);
    if (!profile) throw new Error(`Profil absent : ${id}`);
    return profile;
  }
}
