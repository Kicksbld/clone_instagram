import { describe, expect, it } from 'vitest';

import {
  canTransition,
  normalizeAdminReason,
  normalizeAdminSearch,
  STATUS_TRANSITIONS,
} from '../../../src/modules/identity/domain/account-moderation.ts';

describe('transitions de statut d’un compte (backoffice)', () => {
  it.each([
    ['suspend', 'active', true],
    ['suspend', 'suspended', false],
    ['suspend', 'banned', false],
    ['suspend', 'deleted', false],
    ['ban', 'active', true],
    ['ban', 'suspended', true],
    ['ban', 'banned', false],
    ['ban', 'deleted', false],
    ['reactivate', 'suspended', true],
    ['reactivate', 'banned', true],
    ['reactivate', 'active', false],
    ['reactivate', 'deleted', false],
  ] as const)('%s depuis %s → %s', (action, status, allowed) => {
    expect(canTransition(action, status)).toBe(allowed);
  });

  it('statut d’arrivée et action d’audit de chaque transition', () => {
    expect(STATUS_TRANSITIONS.suspend).toMatchObject({ to: 'suspended', audit: 'user_suspended' });
    expect(STATUS_TRANSITIONS.ban).toMatchObject({ to: 'banned', audit: 'user_banned' });
    expect(STATUS_TRANSITIONS.reactivate).toMatchObject({
      to: 'active',
      audit: 'user_reactivated',
    });
  });
});

describe('normalisation des entrées d’un admin', () => {
  it('motif sans espaces superflus', () => {
    expect(normalizeAdminReason('  Spam répété \n')).toBe('Spam répété');
  });

  it.each([
    [undefined, null],
    ['   ', null],
    ['@', null],
    ['  @Killian ', 'killian'],
    ['a'.repeat(30), 'a'.repeat(30)],
    ['a'.repeat(31), undefined],
  ])('recherche %j → %j', (raw, expected) => {
    expect(normalizeAdminSearch(raw)).toBe(expected);
  });
});
