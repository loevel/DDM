import { createRequestHandler } from "@remix-run/cloudflare";
import { EmailMessage } from "cloudflare:email";
// @ts-ignore — virtual module généré par Remix Vite
import * as build from "./build/server/index.js";

// Injecté sur globalThis avant chaque requête pour que auth.server.ts puisse
// l'utiliser sans importer cloudflare:email directement (non résolvable par Vite)
(globalThis as any).__CF_EmailMessage = EmailMessage;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handler = createRequestHandler(build as any);

const SECURITY_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const response = await handler(request, { cloudflare: { env, ctx } });
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
      if (!headers.has(k)) headers.set(k, v);
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
} satisfies ExportedHandler<Env>;
