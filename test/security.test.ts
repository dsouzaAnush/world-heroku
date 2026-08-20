import { describe, expect, it } from 'vitest';

import {
  isAuthorizedBearerToken,
  isLoopbackAddress,
  isWorkflowProtocolPath,
} from '../src/security.js';

describe('embedded World request boundary', () => {
  it.each(['127.0.0.1', '::1', '::ffff:127.0.0.1', '::1%lo0'])(
    'accepts loopback address %s',
    (address) => expect(isLoopbackAddress(address)).toBe(true),
  );

  it.each([undefined, '10.0.0.1', '192.168.1.2', '::ffff:10.0.0.1'])(
    'rejects non-loopback address %s',
    (address) => expect(isLoopbackAddress(address)).toBe(false),
  );

  it('recognizes only the Workflow protocol route family', () => {
    expect(isWorkflowProtocolPath('/.well-known/workflow/v1/flow')).toBe(true);
    expect(isWorkflowProtocolPath('/.well-known/workflow/v1/step')).toBe(true);
    expect(isWorkflowProtocolPath('/api/runs')).toBe(false);
    expect(isWorkflowProtocolPath('/.well-known/workflows')).toBe(false);
  });

  it('requires an exact bearer token', () => {
    expect(isAuthorizedBearerToken('Bearer correct', 'correct')).toBe(true);
    expect(isAuthorizedBearerToken('Bearer incorrect', 'correct')).toBe(false);
    expect(isAuthorizedBearerToken('Basic correct', 'correct')).toBe(false);
  });
});
