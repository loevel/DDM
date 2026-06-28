import { createRequestHandler } from "@remix-run/cloudflare";
import { EmailMessage } from "cloudflare:email";
// @ts-ignore — virtual module généré par Remix Vite
import * as build from "./build/server/index.js";

// Injecté sur globalThis avant chaque requête pour que auth.server.ts puisse
// l'utiliser sans importer cloudflare:email directement (non résolvable par Vite)
(globalThis as any).__CF_EmailMessage = EmailMessage;

const handler = createRequestHandler(build);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return handler(request, { cloudflare: { env, ctx } });
  },
} satisfies ExportedHandler<Env>;
