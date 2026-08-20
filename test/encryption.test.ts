import { hkdfSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  createGetEncryptionKeyForRun,
  decodeEncryptionKey,
  deriveRunEncryptionKey,
} from '../src/encryption.js';

const key = Uint8Array.from({ length: 32 }, (_value, index) => index);

describe('Workflow payload encryption', () => {
  it('accepts exact 32-byte hex, base64, and base64url keys', () => {
    const representations = [
      Buffer.from(key).toString('hex'),
      Buffer.from(key).toString('base64'),
      Buffer.from(key).toString('base64url'),
      key,
    ];

    for (const representation of representations) {
      expect(decodeEncryptionKey(representation)).toEqual(key);
    }
  });

  it.each(['short', 'a'.repeat(63), Buffer.alloc(31)])(
    'rejects invalid key material %#',
    (value) => {
      expect(() => decodeEncryptionKey(value)).toThrow(
        'Workflow encryption key',
      );
    },
  );

  it('matches the official HKDF-SHA256 per-run construction', async () => {
    const expected = new Uint8Array(
      hkdfSync(
        'sha256',
        key,
        Buffer.alloc(32),
        Buffer.from('app-context|wrun_123'),
        32,
      ),
    );

    await expect(
      deriveRunEncryptionKey(key, 'app-context', 'wrun_123'),
    ).resolves.toEqual(expected);
  });

  it('isolates keys by application context and run ID', async () => {
    const getKey = createGetEncryptionKeyForRun(key, 'app-one');
    const first = await getKey('wrun_one');
    const same = await getKey({ runId: 'wrun_one' });
    const differentRun = await getKey('wrun_two');
    const differentContext = await createGetEncryptionKeyForRun(
      key,
      'app-two',
    )('wrun_one');

    expect(first).toEqual(same);
    expect(first).not.toEqual(differentRun);
    expect(first).not.toEqual(differentContext);
  });
});
