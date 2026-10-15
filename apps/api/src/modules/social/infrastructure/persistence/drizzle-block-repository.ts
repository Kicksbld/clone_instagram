import { blocks, type Executor } from '@clone/db';
import { and, eq } from 'drizzle-orm';

import type { BlockRepository } from '../../application/ports/block-repository.ts';

/** Blocages : `INSERT … ON CONFLICT DO NOTHING` / `DELETE`, sans effet si rien ne change. */
export class DrizzleBlockRepository implements BlockRepository {
  constructor(private readonly db: Executor) {}

  async has(blockerId: string, blockedId: string): Promise<boolean> {
    const rows = await this.db
      .select({ blockerId: blocks.blockerId })
      .from(blocks)
      .where(and(eq(blocks.blockerId, blockerId), eq(blocks.blockedId, blockedId)))
      .limit(1);
    return rows.length > 0;
  }

  async add(blockerId: string, blockedId: string): Promise<boolean> {
    const rows = await this.db
      .insert(blocks)
      .values({ blockerId, blockedId })
      .onConflictDoNothing()
      .returning({ blockerId: blocks.blockerId });
    return rows.length > 0;
  }

  async remove(blockerId: string, blockedId: string): Promise<boolean> {
    const rows = await this.db
      .delete(blocks)
      .where(and(eq(blocks.blockerId, blockerId), eq(blocks.blockedId, blockedId)))
      .returning({ blockerId: blocks.blockerId });
    return rows.length > 0;
  }
}
