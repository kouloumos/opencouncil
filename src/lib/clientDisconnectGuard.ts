/**
 * The two messages React uses when it cancels a render because its output
 * destination went away. React builds both strings itself, and only its own
 * cancel handler throws them, so application code can never produce one.
 */
const CLIENT_DISCONNECT_MESSAGES = new Set([
    'The destination stream closed early.',
    'The destination stream errored while writing data.',
]);

/**
 * Decide whether an error that reaches `onRequestError` only records a client
 * that disconnected in the middle of a stream.
 *
 * When a browser drops an in-flight RSC request — a cancelled prefetch, a
 * navigation away — Next destroys the PassThrough that React streams the
 * flight payload into. React sees its destination close before the render
 * ends. It calls its cancel handler, which aborts the render with a plain
 * `Error('The destination stream closed early.')`.
 *
 * Next drops client aborts in `createReactServerErrorHandler`, but its
 * `isAbortError` check matches only the names `AbortError` and
 * `ResponseAborted`. This generic error passes the filter and arrives at
 * `onRequestError` as a server render error (vercel/next.js#96704). The alert
 * is not actionable: the request completed as far as the client wanted it to.
 *
 * Remove this guard with the upgrade to Next 16.4. The fix
 * (vercel/next.js#96715) aborts the pipeable with a `ResponseAborted` reason,
 * which Next's own filter recognises. Version 16.3.4 does not carry it.
 *
 * The check reads `message` off any object instead of using `instanceof Error`,
 * because an error from the edge runtime crosses a realm boundary and fails
 * that test.
 *
 * Pure function so the decision is unit-testable.
 */
export function isClientDisconnectError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;
    const { message } = error as { message?: unknown };
    return typeof message === 'string' && CLIENT_DISCONNECT_MESSAGES.has(message);
}
