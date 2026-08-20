import { createHash, timingSafeEqual, webcrypto } from 'node:crypto';

const AES_256_KEY_BYTES = 32;
const HEX_KEY_PATTERN = /^[0-9a-f]{64}$/i;
const BASE64_KEY_PATTERN = /^[A-Za-z0-9+/]{43}=$/;
const BASE64URL_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type EncryptionKeyMaterial = string | Uint8Array;

export interface EncryptionRunReference {
  runId: string;
}

/**
 * Decode exactly 32 bytes of AES-256 key material.
 *
 * Strings may be 64-character hexadecimal, padded base64, or unpadded
 * base64url. These are the formats produced by common secret generators.
 */
export function decodeEncryptionKey(value: EncryptionKeyMaterial): Uint8Array {
  if (value instanceof Uint8Array) {
    if (value.byteLength !== AES_256_KEY_BYTES) {
      throw new Error(
        `Workflow encryption key must contain exactly ${AES_256_KEY_BYTES} bytes; received ${value.byteLength}.`,
      );
    }
    return new Uint8Array(value);
  }

  const encoded = value.trim();
  let decoded: Buffer;
  if (HEX_KEY_PATTERN.test(encoded)) {
    decoded = Buffer.from(encoded, 'hex');
  } else if (BASE64_KEY_PATTERN.test(encoded)) {
    decoded = Buffer.from(encoded, 'base64');
  } else if (BASE64URL_KEY_PATTERN.test(encoded)) {
    decoded = Buffer.from(encoded, 'base64url');
  } else {
    throw new Error(
      'Workflow encryption key must be 64-character hexadecimal, 44-character padded base64, or 43-character base64url.',
    );
  }

  if (decoded.byteLength !== AES_256_KEY_BYTES) {
    throw new Error(
      `Workflow encryption key must decode to exactly ${AES_256_KEY_BYTES} bytes; received ${decoded.byteLength}.`,
    );
  }
  return new Uint8Array(decoded);
}

/**
 * Derive a different AES-256 key for every workflow run using the same
 * HKDF-SHA256 construction as the official Vercel World.
 */
export async function deriveRunEncryptionKey(
  masterKey: Uint8Array,
  context: string,
  runId: string,
): Promise<Uint8Array> {
  if (masterKey.byteLength !== AES_256_KEY_BYTES) {
    throw new Error(
      `Workflow encryption key must contain exactly ${AES_256_KEY_BYTES} bytes; received ${masterKey.byteLength}.`,
    );
  }
  if (!context.trim()) {
    throw new Error('Workflow encryption context must be a non-empty string.');
  }
  if (!runId.trim()) {
    throw new Error('Workflow run ID must be a non-empty string.');
  }

  const importedKey = await webcrypto.subtle.importKey(
    'raw',
    masterKey,
    'HKDF',
    false,
    ['deriveBits'],
  );
  const info = new TextEncoder().encode(`${context}|${runId}`);
  const derived = await webcrypto.subtle.deriveBits(
    {
      hash: 'SHA-256',
      info,
      name: 'HKDF',
      salt: new Uint8Array(AES_256_KEY_BYTES),
    },
    importedKey,
    AES_256_KEY_BYTES * 8,
  );
  return new Uint8Array(derived);
}

export function createGetEncryptionKeyForRun(
  keyMaterial: EncryptionKeyMaterial,
  context: string,
) {
  const masterKey = decodeEncryptionKey(keyMaterial);
  const normalizedContext = context.trim();
  if (!normalizedContext) {
    throw new Error('Workflow encryption context must be a non-empty string.');
  }

  return async (
    run: string | EncryptionRunReference,
    _context?: Record<string, unknown>,
  ): Promise<Uint8Array> => {
    const runId = typeof run === 'string' ? run : run.runId;
    return deriveRunEncryptionKey(masterKey, normalizedContext, runId);
  };
}

/** Constant-time comparison for bearer tokens of arbitrary string length. */
export function secretsEqual(candidate: string, expected: string): boolean {
  const candidateDigest = createHash('sha256').update(candidate).digest();
  const expectedDigest = createHash('sha256').update(expected).digest();
  return timingSafeEqual(candidateDigest, expectedDigest);
}
