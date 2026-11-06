import { LiveProfileNotFoundError, LiveUnavailableError } from '../../domain/errors.ts';
import { liveParticipantOf } from '../../domain/live-participant.ts';
import type { LiveProfileReader } from '../ports/live-profile-reader.ts';
import type { ParticipantTokenSigner } from '../ports/participant-token-signer.ts';

/** Jeton de Participant du Live commun pour l'utilisateur authentifié. */
export class CreateLiveParticipantToken {
  constructor(
    private readonly profiles: LiveProfileReader,
    /** `null` : Live non configuré (`LIVE_APP_ID` ou `LIVE_TOKEN_SECRET` absent). */
    private readonly signer: ParticipantTokenSigner | null,
  ) {}

  async execute(input: { userId: string }): Promise<{ token: string }> {
    if (!this.signer) throw new LiveUnavailableError();
    const profile = await this.profiles.find(input.userId);
    if (!profile) throw new LiveProfileNotFoundError();
    return { token: await this.signer.sign(liveParticipantOf(profile)) };
  }
}
