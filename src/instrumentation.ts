import type { Instrumentation } from 'next';
import { isClientDisconnectError } from './lib/clientDisconnectGuard';

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }

  // Keep the Node-only code (cache handler + Prisma boot probe with
  // process.exit) in a separate module so Next's Edge-runtime bundler never
  // sees it — static analysis can't follow the runtime guard above.
  const { runNodeInstrumentation } = await import('./instrumentation-node');
  await runNodeInstrumentation();
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context
) => {
  // A client that hangs up mid-stream is not an error; see
  // isClientDisconnectError for why Next reports it as one.
  if (isClientDisconnectError(error)) return;

  // Log first so we get visibility even if Discord fails.
  console.error(
    `[onRequestError] ${context.routeType} ${context.routePath} (${request.method} ${request.path}):`,
    error
  );

  // Skip Discord in dev so local errors don't spam the team channel.
  if (process.env.NODE_ENV === 'development') return;

  const err = error as Error & { digest?: string };
  // onRequestError runs after the request scope is gone, so the alert cannot
  // read headers() for itself. Its Host is what names the realm the failure
  // happened on — every realm is served by this one deployment.
  const host = request.headers.host;
  // Lazy on purpose, like the node instrumentation above: an error handler must
  // not break the request path it reports on. A static import evaluates the
  // module when the Edge runtime starts, so a node-only import added to
  // discord-core later would fail every proxied request instead of costing one
  // alert.
  //
  // discord-core, not discord: this handler is compiled for the Edge runtime
  // too (proxy errors land here), and discord.ts reads the database.
  const { sendErrorAdminAlert } = await import('@/lib/discord-core');
  await sendErrorAdminAlert({
    source: `${context.routerKind} ${context.routeType}`,
    error: err.stack ?? err.message ?? String(error),
    host: Array.isArray(host) ? host[0] : host,
    context: {
      url: `${request.method} ${request.path}`,
      route: context.routePath,
      digest: err.digest,
      renderSource: context.renderSource,
      revalidateReason: context.revalidateReason,
    },
  });
};
