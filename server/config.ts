import { IANAZone } from 'luxon';

export interface AppConfig {
  timezone: string;
  buildingName: string;
  /** scrypt hash from `npm run hash-password`; preferred over a plain password. */
  adminPasswordHash: string | null;
  /** Alternative to the hash (e.g. a sensitive Vercel env var); ignored if shorter than 12 characters. */
  adminPassword?: string | null;
  secureCookies: boolean;
  now: () => number;
}

export function configFromEnv(env: Record<string, string | undefined>): AppConfig {
  const timezone = env.BUILDING_TIMEZONE || 'Europe/Berlin';
  if (!IANAZone.isValidZone(timezone)) throw new Error(`Invalid BUILDING_TIMEZONE: ${timezone}`);
  const adminPassword = env.ADMIN_PASSWORD && env.ADMIN_PASSWORD.length >= 12 ? env.ADMIN_PASSWORD : null;
  if (env.ADMIN_PASSWORD && !adminPassword) console.warn('[config] ADMIN_PASSWORD ignored: use at least 12 characters.');
  return {
    timezone,
    buildingName: (env.BUILDING_NAME ?? '').slice(0, 60),
    adminPasswordHash: env.ADMIN_PASSWORD_HASH || null,
    adminPassword,
    secureCookies: env.INSECURE_COOKIES !== 'true',
    now: () => Date.now(),
  };
}
