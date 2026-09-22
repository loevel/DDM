import { createRequestHandler } from "@remix-run/cloudflare";
import { EmailMessage } from "cloudflare:email";
// @ts-ignore — virtual module généré par Remix Vite
import * as build from "./build/server/index.js";

// Injecté sur globalThis avant chaque requête pour que auth.server.ts puisse
// l'utiliser sans importer cloudflare:email directement (non résolvable par Vite)
(globalThis as any).__CF_EmailMessage = EmailMessage;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handler = createRequestHandler(build as any);

// ── Garde d'accès /admin, au niveau du Worker ────────────────────────────────
// Remix sert les données d'une route enfant directement via `?_data=<routeId>`
// et n'exécute alors QUE le loader de cette route : la garde du layout parent
// (admin.tsx) ne couvre pas ces requêtes. Chaque loader admin porte donc sa
// propre garde, et ce filtre les double en amont — il s'applique aux pages
// comme aux requêtes de données, et couvre d'office toute route admin future.
const ADMIN_PUBLIC_PATHS = new Set(["/admin/connexion", "/admin/deconnexion"]);

async function hasAdminSession(request: Request, env: Env): Promise<boolean> {
  const match = (request.headers.get("Cookie") ?? "").match(/(?:^|;\s*)ddm_admin=([^;]+)/);
  if (!match) return false;
  const raw = await env.CACHE.get(`admin_session:${match[1]}`);
  if (!raw) return false;
  try {
    const session = JSON.parse(raw);
    return Boolean(session && typeof session === "object" && session.id && session.email);
  } catch {
    return false;
  }
}

/** Redirection vers la connexion, au format attendu par le client Remix. */
function loginRedirect(request: Request): Response {
  const isDataRequest = new URL(request.url).searchParams.has("_data");
  return isDataRequest
    ? new Response(null, {
        status: 204,
        headers: { "X-Remix-Redirect": "/admin/connexion", "X-Remix-Status": "302" },
      })
    : new Response(null, { status: 302, headers: { Location: "/admin/connexion" } });
}

const SECURITY_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);
    const isAdminPath = pathname === "/admin" || pathname.startsWith("/admin/");
    if (isAdminPath && !ADMIN_PUBLIC_PATHS.has(pathname) && !(await hasAdminSession(request, env))) {
      return loginRedirect(request);
    }

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
