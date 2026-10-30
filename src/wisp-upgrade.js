/**
 * Small, independently testable wrapper around the Wisp HTTP Upgrade handler.
 *
 * Wisp v1/v2 routing checks the raw request URL. Normalize it to the exact
 * mounted path after validating its parsed pathname so query strings cannot
 * accidentally select the legacy wsproxy route.
 */
export function handleWispUpgrade(req, socket, head, {
  wisp,
  isSameOrigin,
  hasValidSession,
  onError = (error) => console.error('Wisp upgrade failed:', error)
}) {
  let parsed;
  try {
    parsed = new URL(req.url || '/', `http://${req.headers?.host || 'localhost'}`);
  } catch {
    socket.end();
    return 'invalid-url';
  }

  if (parsed.pathname !== '/wisp/') {
    socket.end();
    return 'ignored';
  }

  const upgrade = String(req.headers?.upgrade || '').toLowerCase();
  const connection = String(req.headers?.connection || '').toLowerCase().split(',').map((part) => part.trim());
  if (req.method !== 'GET' || upgrade !== 'websocket' || !connection.includes('upgrade')) {
    rejectUpgrade(socket, '400 Bad Request', 'A valid WebSocket upgrade is required');
    return 'bad-request';
  }

  if (!isSameOrigin(req)) {
    rejectUpgrade(socket, '403 Forbidden', 'Origin not allowed');
    return 'forbidden';
  }

  if (!hasValidSession(req)) {
    rejectUpgrade(socket, '401 Unauthorized', 'Authentication required');
    return 'unauthorized';
  }

  // wisp-js inspects req.url when deciding whether this is a mounted Wisp
  // endpoint. Keep the exact path and discard any query string.
  req.url = parsed.pathname;

  try {
    const routed = wisp.routeRequest(req, socket, head);
    if (routed && typeof routed.then === 'function') {
      routed.catch((error) => {
        onError(error);
        if (!socket.destroyed) socket.destroy();
      });
    }
    return 'routed';
  } catch (error) {
    onError(error);
    if (!socket.destroyed) socket.destroy();
    return 'failed';
  }
}

function rejectUpgrade(socket, status, message) {
  const response = [
    `HTTP/1.1 ${status}`,
    'Connection: close',
    'Content-Type: text/plain; charset=utf-8',
    `Content-Length: ${Buffer.byteLength(message)}`,
    '',
    message
  ].join('\r\n');
  try {
    // end() flushes the complete HTTP rejection; write()+destroy() can reset
    // the socket before browsers receive the status line and response body.
    socket.end(`${response}\r\n`);
  } catch {
    if (!socket.destroyed) socket.destroy();
  }
}
