import { secretsEqual } from './encryption.js';

const WORKFLOW_PROTOCOL_PREFIX = '/.well-known/workflow/';

export function isWorkflowProtocolPath(pathname: string): boolean {
  return (
    pathname === '/.well-known/workflow' ||
    pathname.startsWith(WORKFLOW_PROTOCOL_PREFIX)
  );
}

/**
 * Accept only kernel-reported loopback addresses. Do not use forwarding
 * headers for this check because clients can supply them.
 */
export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  const normalized = address.toLowerCase().split('%', 1)[0];
  return (
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '::ffff:127.0.0.1'
  );
}

export function isAuthorizedBearerToken(
  authorization: string | undefined,
  expectedToken: string,
): boolean {
  if (!expectedToken || !authorization?.startsWith('Bearer ')) return false;
  const candidate = authorization.slice('Bearer '.length);
  return candidate.length > 0 && secretsEqual(candidate, expectedToken);
}
