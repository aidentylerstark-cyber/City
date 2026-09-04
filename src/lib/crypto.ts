import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  scrypt as scryptCb,
  timingSafeEqual,
} from 'node:crypto'
import type { ScryptOptions } from 'node:crypto'

/**
 * promisify() resolves to the 3-argument overload of scrypt, which drops the
 * options we need to set the cost parameters. Wrap it by hand instead.
 */
function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (error, derived) => {
      if (error) reject(error)
      else resolve(derived)
    })
  })
}

/** Constant-time comparison that tolerates different-length inputs. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  // Hash both sides first so length differences do not leak through the
  // length check that timingSafeEqual requires.
  return timingSafeEqual(sha256Buffer(ab), sha256Buffer(bb))
}

function sha256Buffer(input: Buffer): Buffer {
  return createHash('sha256').update(input).digest()
}

export function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

export function hmacSha256(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload, 'utf8').digest('hex')
}

/** URL-safe opaque token, for session cookies and invite codes. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

/**
 * Crockford base32: no I, L, O or U. Those are exactly the glyphs that get
 * misread when someone reads a code off a chat line and retypes it here.
 */
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** A verification code a person reads in-world and retypes on the web. */
export function generateVerificationCode(length = 6): string {
  let out = ''
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  }
  return out
}

/**
 * Fold what the user typed back onto the issued alphabet, so "O" for zero and
 * "l" for one are accepted rather than silently failing.
 */
export function normalizeVerificationCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
}

const SCRYPT_KEYLEN = 64
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

/**
 * Password hashing with scrypt from the Node standard library. No native
 * build step, and the parameters below are the OWASP-recommended floor.
 * Format: scrypt$N$r$p$salt$hash
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scrypt(password.normalize('NFKC'), salt, SCRYPT_KEYLEN, SCRYPT_PARAMS)
  const { N, r, p } = SCRYPT_PARAMS
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false

  const [, nRaw, rRaw, pRaw, saltRaw, hashRaw] = parts
  const salt = Buffer.from(saltRaw, 'base64')
  const expected = Buffer.from(hashRaw, 'base64')

  const key = await scrypt(password.normalize('NFKC'), salt, expected.length, {
    N: Number(nRaw),
    r: Number(rRaw),
    p: Number(pRaw),
    maxmem: 256 * 1024 * 1024,
  })

  return key.length === expected.length && timingSafeEqual(key, expected)
}
