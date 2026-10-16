import { describe, expect, it } from 'vitest';

import { moderationErrorMessage } from '../data/messages';
import { moderationRequestSchema, moderationSchema } from './moderation';
import { parseUserSearch, usersHref } from './search';

describe('moderationSchema', () => {
  it('motif obligatoire, sans espaces superflus, 500 caractères au plus', () => {
    expect(moderationSchema.parse({ reason: '  Spam ' })).toEqual({ reason: 'Spam' });
    expect(moderationSchema.safeParse({ reason: '   ' }).success).toBe(false);
    expect(moderationSchema.safeParse({ reason: 'a'.repeat(501) }).success).toBe(false);
  });

  it('entrée d’une Server Action : identifiant UUID et action connue', () => {
    const valid = {
      userId: '0199a1b2-0000-7000-8000-000000000001',
      action: 'ban',
      reason: 'Spam',
    };
    expect(moderationRequestSchema.safeParse(valid).success).toBe(true);
    expect(moderationRequestSchema.safeParse({ ...valid, userId: '../admin' }).success).toBe(false);
    expect(moderationRequestSchema.safeParse({ ...valid, action: 'promote' }).success).toBe(false);
  });
});

describe('parseUserSearch', () => {
  it('garde les critères valides de l’URL, ignore les autres', () => {
    expect(parseUserSearch({ q: '  ines ', status: 'banned', cursor: 'abc' })).toEqual({
      q: 'ines',
      status: 'banned',
      cursor: 'abc',
    });
    expect(parseUserSearch({ q: '', status: 'deleted', cursor: ['a', 'b'] })).toEqual({
      cursor: 'a',
    });
    expect(parseUserSearch({})).toEqual({});
  });

  it('usersHref reconstruit l’URL de la liste', () => {
    expect(usersHref({})).toBe('/users');
    expect(usersHref({ q: 'a b', status: 'active', cursor: 'c' })).toBe(
      '/users?q=a+b&status=active&cursor=c',
    );
  });
});

describe('moderationErrorMessage', () => {
  it.each([
    [409, 'invalid_status_transition', 'Le statut du compte ne permet pas cette action.'],
    [422, 'cannot_moderate_self', 'votre propre compte'],
    [404, 'user_not_found', 'n’existe plus'],
    [500, 'internal_error', 'Réessayez'],
  ])('HTTP %i %s', (status, code, expected) => {
    expect(moderationErrorMessage(status, code)).toContain(expected);
  });
});
