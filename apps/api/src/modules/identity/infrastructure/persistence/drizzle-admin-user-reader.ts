import { media, profiles, type Executor } from '@clone/db';
import { and, desc, eq, ne, sql } from 'drizzle-orm';

import type { Page } from '../../../../shared/domain/pagination.ts';
import { escapeLike } from '../../../../shared/infrastructure/persistence/escape-like.ts';
import type { AdminUserQuery, AdminUserReader } from '../../application/ports/admin-user-reader.ts';
import type { Profile } from '../../domain/profile.ts';
import { toProfile } from './drizzle-profile-repository.ts';

/**
 * Comptes du backoffice : curseur `(created_at, id)` sur `profiles` (ADR-007), recherche `ILIKE` sur
 * le username et le nom (index trigramme, ADR-007). Sans tri par pertinence : il ne se combine pas
 * avec la pagination par curseur.
 */
export class DrizzleAdminUserReader implements AdminUserReader {
  constructor(private readonly db: Executor) {}

  async list({ search, status, after, limit }: AdminUserQuery): Promise<Page<Profile>> {
    const contains = search === null ? null : `%${escapeLike(search)}%`;
    const rows = await this.db
      .select({ profile: profiles, avatarVariants: media.variants })
      .from(profiles)
      .leftJoin(media, eq(media.id, profiles.avatarMediaId))
      .where(
        and(
          status === null ? ne(profiles.status, 'deleted') : eq(profiles.status, status),
          contains === null
            ? undefined
            : sql`(${profiles.username} ILIKE ${contains} OR ${profiles.fullName} ILIKE ${contains})`,
          after
            ? sql`(${profiles.createdAt}, ${profiles.id}) < (${after.createdAt.toISOString()}::timestamptz, ${after.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(desc(profiles.createdAt), desc(profiles.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit).map((row) => toProfile(row.profile, row.avatarVariants));
    const last = page.at(-1);
    return {
      items: page,
      next: rows.length > limit && last ? { createdAt: last.createdAt, id: last.id } : null,
    };
  }
}
