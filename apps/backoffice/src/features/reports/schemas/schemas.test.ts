import { describe, expect, it } from 'vitest';

import { resolutionErrorMessage } from '../data/messages';
import { resolutionRequestSchema, resolutionSchema } from './resolution';
import { parseReportSearch, reportsHref } from './search';

describe('resolutionSchema', () => {
  it('note facultative, sans espaces superflus, 500 caractères au plus', () => {
    expect(resolutionSchema.parse({ note: '  Spam ' })).toEqual({ note: 'Spam' });
    expect(resolutionSchema.parse({ note: '   ' })).toEqual({ note: '' });
    expect(resolutionSchema.safeParse({ note: 'a'.repeat(501) }).success).toBe(false);
  });

  it('entrée d’une Server Action : identifiant UUID et action connue', () => {
    const valid = {
      reportId: '0199a1b2-0000-7000-8000-000000000001',
      action: 'remove_content',
      note: '',
    };
    expect(resolutionRequestSchema.safeParse(valid).success).toBe(true);
    expect(resolutionRequestSchema.safeParse({ ...valid, reportId: '../x' }).success).toBe(false);
    expect(resolutionRequestSchema.safeParse({ ...valid, action: 'ban' }).success).toBe(false);
  });
});

describe('parseReportSearch', () => {
  it('garde les filtres valides de l’URL, ignore les autres', () => {
    expect(
      parseReportSearch({
        status: 'resolved_removed',
        reason: 'hate',
        targetType: 'post',
        cursor: 'abc',
      }),
    ).toEqual({ status: 'resolved_removed', reason: 'hate', targetType: 'post', cursor: 'abc' });
    expect(
      parseReportSearch({ status: 'closed', reason: ['spam', 'hate'], targetType: 'story' }),
    ).toEqual({
      reason: 'spam',
    });
    expect(parseReportSearch({})).toEqual({});
  });
});

describe('reportsHref', () => {
  it('construit l’URL de la file avec ses filtres', () => {
    expect(reportsHref({})).toBe('/reports');
    expect(reportsHref({ reason: 'spam', targetType: 'comment', cursor: 'c' })).toBe(
      '/reports?reason=spam&targetType=comment&cursor=c',
    );
  });
});

describe('resolutionErrorMessage', () => {
  it('message selon le code de l’API', () => {
    expect(resolutionErrorMessage(409, 'report_already_resolved')).toContain('déjà été traité');
    expect(resolutionErrorMessage(422, 'cannot_remove_user')).toContain('fiche');
    expect(resolutionErrorMessage(429, undefined)).toContain('Trop de requêtes');
    expect(resolutionErrorMessage(500, 'internal_error')).toBe('L’action a échoué. Réessayez.');
  });
});
