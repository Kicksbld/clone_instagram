import { SignJWT } from 'jose';

import type { ParticipantTokenSigner } from '../../application/ports/participant-token-signer.ts';
import type { LiveParticipant } from '../../domain/live-participant.ts';

/** JWT HS256 valable 5 minutes, format attendu par le serveur Live commun (echimine/live-sdk). */
export class JoseParticipantTokenSigner implements ParticipantTokenSigner {
  private readonly secret: Uint8Array;

  constructor(
    private readonly appId: string,
    secret: string,
  ) {
    this.secret = new TextEncoder().encode(secret);
  }

  async sign(participant: LiveParticipant): Promise<string> {
    return new SignJWT({
      name: participant.name,
      ...(participant.picture && { picture: participant.picture }),
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(this.appId)
      .setSubject(participant.id)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(this.secret);
  }
}
