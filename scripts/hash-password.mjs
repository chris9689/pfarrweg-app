// Prints an ADMIN_PASSWORD_HASH value. Usage: npm run hash-password -- "your password"
import { randomBytes, scryptSync } from 'node:crypto';

const password = process.argv[2];
if (!password || password.length < 12) {
  console.error('Usage: npm run hash-password -- "<password with at least 12 characters>"');
  process.exit(1);
}
const [N, r, p] = [16384, 8, 1];
const salt = randomBytes(16);
const key = scryptSync(password, salt, 32, { N, r, p, maxmem: 64 * 1024 * 1024 });
console.log(['scrypt', N, r, p, salt.toString('base64'), key.toString('base64')].join('$'));
