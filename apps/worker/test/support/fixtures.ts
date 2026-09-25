import { media, newId, profiles, type Database } from '@clone/db';
import type { Job } from 'bullmq';
import { inArray } from 'drizzle-orm';
import type { PgInsertValue } from 'drizzle-orm/pg-core';
import { pino } from 'pino';
import sharp from 'sharp';

export const silentLogger = pino({ level: 'silent' });

/** JPEG avec EXIF (position GPS, appareil) et orientation 6 (photo prise en portrait). */
export function jpegWithGps(width = 2000, height = 1500): Promise<Buffer> {
  return (
    sharp({ create: { width, height, channels: 3, background: '#3a7' } })
      .jpeg()
      // L'orientation passe par `withMetadata` : sharp ignore la balise Orientation de `withExif`.
      .withMetadata({ orientation: 6 })
      .withExifMerge({
        IFD0: { Make: 'Apple', Model: 'iPhone 17' },
        IFD3: {
          GPSLatitudeRef: 'N',
          GPSLatitude: '48/1 51/1 24/1',
          GPSLongitudeRef: 'E',
          GPSLongitude: '2/1 21/1 3/1',
        },
      })
      .toBuffer()
  );
}

export function png(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background: '#fff0' } })
    .png()
    .toBuffer();
}

export function gif(): Promise<Buffer> {
  return sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } })
    .gif()
    .toBuffer();
}

/** Job BullMQ minimal : nom, données, tentatives. */
export function jobOf(name: string, data: unknown, attemptsMade = 0): Job {
  return { id: newId(), name, data, attemptsMade, opts: { attempts: 3 } } as unknown as Job;
}

/** Profils et médias de test sur la base de dev, supprimés après chaque test. */
export function testRows(db: Database) {
  const createdProfiles: string[] = [];
  return {
    async profile(): Promise<string> {
      const id = newId();
      createdProfiles.push(id);
      await db.insert(profiles).values({
        id,
        username: `w_${id.replaceAll('-', '').slice(-20)}`,
        fullName: 'Test',
        birthDate: '2000-01-01',
      });
      return id;
    },
    async media(ownerId: string, values: Partial<PgInsertValue<typeof media>> = {}) {
      const id = newId();
      const originalPath = `${ownerId}/${id}`;
      await db.insert(media).values({
        id,
        ownerId,
        kind: 'image',
        purpose: 'avatar',
        status: 'uploaded',
        originalPath,
        mimeType: 'image/jpeg',
        sizeBytes: 1000,
        ...values,
      });
      return { id, originalPath };
    },
    async cleanUp(): Promise<void> {
      if (createdProfiles.length === 0) return;
      await db.delete(profiles).where(inArray(profiles.id, createdProfiles.splice(0)));
    },
  };
}
