import { z } from 'zod';

/**
 * Configuration de l'API, validée au démarrage (ADR-005) : l'API refuse de démarrer si elle est invalide.
 * Chaque tranche ajoute les variables qu'elle utilise (liste complète : ADR-009, `.env.example`).
 */
const configSchema = z.object({
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  // Clés de vérification des JWT lues sur `${SUPABASE_URL}/auth/v1/.well-known/jwks.json` (ADR-018).
  SUPABASE_URL: z.url({ protocol: /^https?$/ }),
  SUPABASE_JWT_ISSUER: z.url({ protocol: /^https?$/ }),
});

export type Config = z.infer<typeof configSchema>;

export class InvalidConfigError extends Error {
  constructor(problems: string[]) {
    super(`Configuration invalide :\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'InvalidConfigError';
  }
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  // Une variable vide (`API_PORT=` recopié de .env.example) est traitée comme absente.
  const defined = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ''));
  const result = configSchema.safeParse(defined);
  if (!result.success) {
    // Uniquement le nom de la variable et la règle : jamais la valeur, qui peut être un secret.
    throw new InvalidConfigError(
      result.error.issues.map((issue) => `${issue.path.join('.')} : ${issue.message}`),
    );
  }
  return result.data;
}
