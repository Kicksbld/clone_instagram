import { z } from 'zod';

/** Configuration du worker, validée au démarrage (liste complète : ADR-009, `.env.example`). */
const configSchema = z.object({
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  // T3 : état des médias en base, fichiers dans Supabase Storage avec la clé secrète (ADR-009).
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  SUPABASE_URL: z.url({ protocol: /^https?$/ }),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // T13 : purge d'un compte supprimé. RevenueCat : clé secrète V2 (Customers en lecture-écriture).
  REVENUECAT_SECRET_KEY: z.string().min(1),
  REVENUECAT_PROJECT_ID: z.string().min(1),
  // PostHog : clé personnelle (jamais exposée). Optionnelle, comme les analytics de l'API : sans
  // elle, la personne PostHog n'est pas supprimée (avertissement journalisé).
  POSTHOG_PERSONAL_API_KEY: z.string().min(1).optional(),
  POSTHOG_PROJECT_ID: z.string().min(1).optional(),
  // API privée de PostHog (hôte de l'application, pas celui d'ingestion `eu.i.posthog.com`).
  POSTHOG_API_HOST: z.url({ protocol: /^https?$/ }).default('https://eu.posthog.com'),
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
