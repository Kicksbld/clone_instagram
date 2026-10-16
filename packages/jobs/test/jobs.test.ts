import { describe, expect, it } from 'vitest';

import {
  DEFAULT_JOB_OPTIONS,
  PROCESS_IMAGE,
  processImageJobId,
  PURGE_ACCOUNT,
  PURGE_CONTENT_FILES,
  PURGE_ORPHAN_MEDIA,
  purgeAccountJobId,
  purgeContentFilesJobId,
  QUEUE_NAMES,
} from '../src/index.ts';

describe('contrat des jobs', () => {
  it('déclare les files media et maintenance', () => {
    expect(Object.values(QUEUE_NAMES)).toEqual(['media', 'maintenance']);
  });

  it('impose 3 tentatives avec un délai croissant', () => {
    expect(DEFAULT_JOB_OPTIONS.attempts).toBe(3);
    expect(DEFAULT_JOB_OPTIONS.backoff.type).toBe('exponential');
  });
});

describe('process-image', () => {
  const mediaId = '01890a5d-ac96-774b-bcce-b302099a8057';

  it('accepte un payload { mediaId } et rien d’autre', () => {
    expect(PROCESS_IMAGE.payload.parse({ mediaId })).toEqual({ mediaId });
    expect(PROCESS_IMAGE.payload.safeParse({}).success).toBe(false);
    expect(PROCESS_IMAGE.payload.safeParse({ mediaId: 'pas-un-uuid' }).success).toBe(false);
  });

  it('renvoie { mediaId, ownerId }', () => {
    const result = { mediaId, ownerId: mediaId };
    expect(PROCESS_IMAGE.result.parse(result)).toEqual(result);
    expect(PROCESS_IMAGE.result.safeParse({ mediaId }).success).toBe(false);
  });

  it('dérive un identifiant de job stable du média', () => {
    expect(processImageJobId(mediaId)).toBe(`process-image-${mediaId}`);
    expect(PROCESS_IMAGE.queue).toBe('media');
  });
});

describe('purge-orphan-media', () => {
  it('tourne toutes les heures dans la file maintenance', () => {
    expect(PURGE_ORPHAN_MEDIA.queue).toBe('maintenance');
    expect(PURGE_ORPHAN_MEDIA.everyMs).toBe(3_600_000);
  });
});

describe('purge-account', () => {
  const profileId = '01890a5d-ac96-774b-bcce-b302099a8057';

  it('accepte un payload { profileId } et rien d’autre', () => {
    expect(PURGE_ACCOUNT.payload.parse({ profileId })).toEqual({ profileId });
    expect(PURGE_ACCOUNT.payload.safeParse({}).success).toBe(false);
    expect(PURGE_ACCOUNT.payload.safeParse({ profileId: 'pas-un-uuid' }).success).toBe(false);
  });

  it('dérive un identifiant de job stable du profil, dans la file maintenance', () => {
    expect(purgeAccountJobId(profileId)).toBe(`purge-account-${profileId}`);
    expect(PURGE_ACCOUNT.queue).toBe('maintenance');
  });
});

describe('purge-content-files', () => {
  const postId = '01890a5d-ac96-774b-bcce-b302099a8057';

  it('accepte un payload { postId } et rien d’autre', () => {
    expect(PURGE_CONTENT_FILES.payload.parse({ postId })).toEqual({ postId });
    expect(PURGE_CONTENT_FILES.payload.safeParse({}).success).toBe(false);
    expect(PURGE_CONTENT_FILES.payload.safeParse({ postId: 'pas-un-uuid' }).success).toBe(false);
  });

  it('dérive un identifiant de job stable du post, dans la file maintenance', () => {
    expect(purgeContentFilesJobId(postId)).toBe(`purge-content-files-${postId}`);
    expect(PURGE_CONTENT_FILES.queue).toBe('maintenance');
  });
});
