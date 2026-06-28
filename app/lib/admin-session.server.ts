import type { AppLoadContext } from "@remix-run/cloudflare";

const COOKIE = "ddm_admin";
const TTL = 60 * 60 * 8; // 8 heures

export function getAdminSessionId(request: Request): string | null {
  const cookie = request.headers.get("Cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return match ? match[1] : null;
}

export async function isAdminAuthenticated(
  request: Request,
  context: AppLoadContext
): Promise<boolean> {
  const sid = getAdminSessionId(request);
  if (!sid) return false;
  const val = await context.cloudflare.env.CACHE.get(`admin_session:${sid}`);
  return val === "1";
}

export async function createAdminSession(context: AppLoadContext): Promise<string> {
  const sid = crypto.randomUUID();
  await context.cloudflare.env.CACHE.put(`admin_session:${sid}`, "1", {
    expirationTtl: TTL,
  });
  return sid;
}

export async function destroyAdminSession(
  sid: string,
  context: AppLoadContext
): Promise<void> {
  await context.cloudflare.env.CACHE.delete(`admin_session:${sid}`);
}

export const setAdminCookie = (sid: string) =>
  `${COOKIE}=${sid}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${TTL}`;

export const clearAdminCookie = () =>
  `${COOKIE}=; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=0`;
