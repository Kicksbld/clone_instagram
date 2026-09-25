import { newId } from '@clone/db';

import type { IdGenerator } from '../application/id-generator.ts';

export const uuidV7Generator: IdGenerator = { next: newId };
