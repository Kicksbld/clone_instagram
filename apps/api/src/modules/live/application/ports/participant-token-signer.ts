import type { LiveParticipant } from '../../domain/live-participant.ts';

/** Signe un Jeton de Participant avec le secret de l'App membre. */
export interface ParticipantTokenSigner {
  sign(participant: LiveParticipant): Promise<string>;
}
