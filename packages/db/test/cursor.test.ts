import { describe, expect, it } from 'vitest';

import { decodeCursor, encodeCursor, InvalidCursorError } from '../src/cursor.ts';
import { newId } from '../src/ids.ts';

const encodeRaw = (value: unknown) =>
  Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');

describe('curseur de pagination', () => {
  it('fait un aller-retour sans perte', () => {
    const cursor = { createdAt: new Date('2026-09-23T10:15:30.123Z'), id: newId() };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it('accepte un UUID v4 (id de profil Supabase Auth)', () => {
    const cursor = {
      createdAt: new Date('2026-09-23T10:15:30.123Z'),
      id: '9b2f7c1e-8a3d-4f6b-9c2e-1d4a5b6c7d8e',
    };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it('produit une chaîne opaque sûre pour une URL', () => {
    const raw = encodeCursor({ createdAt: new Date(), id: newId() });
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([
    ['vide', ''],
    ['trop long', 'a'.repeat(200)],
    ['base64 invalide', '%%%'],
    ['pas du JSON', Buffer.from('bonjour').toString('base64url')],
    ['pas un tableau', encodeRaw({ createdAt: '2026-09-23T10:15:30.123Z', id: newId() })],
    ['mauvaise longueur', encodeRaw(['2026-09-23T10:15:30.123Z'])],
    ['date invalide', encodeRaw(['pas-une-date', newId()])],
    ['date non normalisée', encodeRaw(['2026-09-23', newId()])],
    ['id pas un UUID', encodeRaw(['2026-09-23T10:15:30.123Z', '42'])],
  ])('rejette un curseur %s', (_label, raw) => {
    expect(() => decodeCursor(raw)).toThrow(InvalidCursorError);
  });
});
