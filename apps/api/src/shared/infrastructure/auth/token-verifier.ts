import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from 'jose';

/** JWT absent ou invalide → 401 `unauthenticated` (ADR-018). */
export class UnauthenticatedError extends Error {
  readonly code = 'unauthenticated';
}

export interface TokenVerifier {
  /** Identifiant Supabase Auth de l'utilisateur ; lève `UnauthenticatedError` si le JWT est invalide. */
  verify(token: string): Promise<{ userId: string }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Clés publiques de Supabase Auth, mises en cache par `jose` (ADR-018). */
export function supabaseJwks(supabaseUrl: string): JWTVerifyGetKey {
  return createRemoteJWKSet(new URL('/auth/v1/.well-known/jwks.json', supabaseUrl));
}

/** Vérification des access tokens Supabase : ES256 uniquement, émetteur, audience, expiration. */
export function createJwtVerifier(options: {
  issuer: string;
  keys: JWTVerifyGetKey;
}): TokenVerifier {
  return {
    async verify(token) {
      let subject: string | undefined;
      try {
        const { payload } = await jwtVerify(token, options.keys, {
          algorithms: ['ES256'],
          issuer: options.issuer,
          audience: 'authenticated',
          requiredClaims: ['sub', 'exp'],
        });
        subject = payload.sub;
      } catch (error) {
        // Clés injoignables : panne de notre côté (500), pas un jeton invalide.
        if (error instanceof errors.JOSEError && !(error instanceof errors.JWKSTimeout)) {
          throw new UnauthenticatedError('Jeton d’accès invalide ou expiré.');
        }
        throw error;
      }
      if (!subject || !UUID.test(subject)) {
        throw new UnauthenticatedError('Jeton d’accès sans utilisateur.');
      }
      return { userId: subject };
    },
  };
}
