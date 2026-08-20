import {
  isAuthorizedBearerToken,
  isLoopbackAddress,
  isWorkflowProtocolPath,
} from '@anushdsouza/world-heroku';
import {
  createError,
  defineEventHandler,
  getHeader,
  getRequestURL,
  setHeader,
} from 'nitro/h3';

export default defineEventHandler((event) => {
  const pathname = getRequestURL(event).pathname;
  const remoteAddress = event.node?.req.socket.remoteAddress;
  setHeader(event, 'referrer-policy', 'no-referrer');
  setHeader(event, 'x-content-type-options', 'nosniff');
  setHeader(event, 'x-frame-options', 'DENY');

  if (isWorkflowProtocolPath(pathname)) {
    if (!isLoopbackAddress(remoteAddress)) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Workflow execution routes are loopback-only',
      });
    }
    return;
  }

  const forwardedProtocol = getHeader(event, 'x-forwarded-proto')
    ?.trim()
    .toLowerCase();
  if (process.env.DYNO && forwardedProtocol === 'https') {
    setHeader(event, 'strict-transport-security', 'max-age=31536000');
  }
  if (
    process.env.DYNO &&
    (pathname === '/' || pathname.startsWith('/api/')) &&
    forwardedProtocol !== 'https'
  ) {
    throw createError({
      statusCode: 426,
      statusMessage: 'HTTPS is required',
    });
  }

  if (!pathname.startsWith('/api/')) return;
  setHeader(event, 'cache-control', 'no-store');
  const expectedToken = process.env.WORKFLOW_HEROKU_API_TOKEN?.trim();
  if (!expectedToken) {
    throw createError({
      statusCode: 503,
      statusMessage: 'API token is not configured',
    });
  }
  if (
    !isAuthorizedBearerToken(getHeader(event, 'authorization'), expectedToken)
  ) {
    throw createError({
      statusCode: 401,
      statusMessage: 'A valid bearer token is required',
    });
  }
});
