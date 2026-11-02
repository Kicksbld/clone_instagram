import { describe, expect, it } from 'vitest';

import { groupKeyOf, shouldNotify } from '../../src/shared/domain/notification.ts';

const POST = '0199a1b2-0000-7000-a000-000000000001';
const NOTIFICATION = '0199a1b2-0000-7000-d000-000000000001';

describe('shouldNotify', () => {
  it('notifie un autre compte', () => {
    expect(shouldNotify('actor', 'recipient')).toBe(true);
  });

  it('ne notifie jamais soi-même', () => {
    expect(shouldNotify('me', 'me')).toBe(false);
  });
});

describe('groupKeyOf', () => {
  it('regroupe les J’aime par post', () => {
    expect(groupKeyOf(NOTIFICATION, { type: 'like', postId: POST })).toBe(`like:${POST}`);
  });

  it('ne regroupe pas les autres types', () => {
    expect(groupKeyOf(NOTIFICATION, { type: 'follow' })).toBe(`follow:${NOTIFICATION}`);
    expect(groupKeyOf(NOTIFICATION, { type: 'comment', postId: POST, commentId: POST })).toBe(
      `comment:${NOTIFICATION}`,
    );
  });
});
