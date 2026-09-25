import { z } from 'zod';

/** Configuration du worker, validée au démarrage (liste complète : ADR-009, `.env.example`). */
const configSchema = z.object({
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  // T3 : état des médias en base, fichiers dans Supabase Storage avec la clé secrète (ADR-009).
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  SUPABASE_URL: z.url({ protocol: /^https?$/ }),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
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
    // Uniquement le nom de la variable et la règle : jamais la valeur, qui peut contenir un mot de passe.
    throw new InvalidConfigError(
      result.error.issues.map((issue) => `${issue.path.join('.')} : ${issue.message}`),
    );
  }
  return result.data;
}
