import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';

import {
  createJwtVerifier,
  type TokenVerifier,
} from '../../src/shared/infrastructure/auth/token-verifier.ts';

/** JWT de test signés comme ceux de Supabase Auth (ES256, JWKS), sans réseau. */
export const TEST_ISSUER = 'http://127.0.0.1:54321/auth/v1';

const KID = 'test-key';
const { publicKey, privateKey } = await generateKeyPair('ES256');
const jwks = createLocalJWKSet({
  keys: [{ ...(await exportJWK(publicKey)), kid: KID, alg: 'ES256' }],
});

export const testTokenVerifier: TokenVerifier = createJwtVerifier({
  issuer: TEST_ISSUER,
  keys: jwks,
});

export interface TokenOptions {
  issuer?: string;
  audience?: string;
  expiresIn?: string | number;
  key?: Parameters<SignJWT['sign']>[0];
}

export async function signTestToken(subject: string, options: TokenOptions = {}): Promise<string> {
  return new SignJWT({ role: 'authenticated' })
    .setProtectedHeader({ alg: 'ES256', kid: KID })
    .setSubject(subject)
    .setIssuer(options.issuer ?? TEST_ISSUER)
    .setAudience(options.audience ?? 'authenticated')
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? '1h')
    .sign(options.key ?? privateKey);
}
