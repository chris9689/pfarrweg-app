import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';

const SCRYPT = { N: 16384, r: 8, p: 1, keyLength: 32 };

function scryptAsync(secret: string, salt: Buffer, keyLength: number, N: number, r: number, p: number) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(secret, salt, keyLength, { N, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

/** Format: scrypt$N$r$p$saltBase64$hashBase64 (same as scripts/hash-password.mjs). */
export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const { N, r, p, keyLength } = SCRYPT;
  const key = await scryptAsync(secret, salt, keyLength, N, r, p);
  return ['scrypt', N, r, p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64');
  try {
    const key = await scryptAsync(secret, Buffer.from(saltB64, 'base64'), expected.length, +n, +r, +p);
    return key.length === expected.length && timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

export const newSessionToken = () => randomBytes(32).toString('base64url');

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** 8 random digits – easy to type on a phone keypad, ~27 bits of entropy plus rate limiting. */
export function generateAccessCode(): string {
  return Array.from({ length: 8 }, () => randomInt(0, 10)).join('');
}

export const normalizeCode = (input: unknown) => (typeof input === 'string' ? input.replace(/\D/g, '') : '');
