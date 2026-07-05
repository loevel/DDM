import type { AppLoadContext } from "@remix-run/cloudflare";

/**
 * Rate limiter générique par IP (KV) pour les endpoints publics.
 * Retourne true si la requête est autorisée, false si la limite est atteinte.
 * Fixed window : suffisant contre le spam de formulaires.
 */
export async function checkRateLimit(
  context: AppLoadContext,
  request: Request,
  opts: { name: string; max: number; windowSeconds: number }
): Promise<boolean> {
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const key = `rl:${opts.name}:${ip}`;
  const cache = context.cloudflare.env.CACHE;

  const raw = await cache.get(key);
  const count = raw ? parseInt(raw, 10) || 0 : 0;
  if (count >= opts.max) return false;

  // Le TTL n'est posé qu'à la première écriture de la fenêtre
  await cache.put(key, String(count + 1), {
    expirationTtl: opts.windowSeconds,
  });
  return true;
}
