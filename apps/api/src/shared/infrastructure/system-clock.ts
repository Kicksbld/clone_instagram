import type { Clock } from '../application/clock.ts';

export const systemClock: Clock = { now: () => new Date() };
