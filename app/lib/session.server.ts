import type { AppLoadContext } from "@remix-run/cloudflare";

const COOKIE_NAME = "ddm_session";
const SESSION_TTL = 60 * 60 * 24 * 30; // 30 jours

export function getSessionId(request: Request): string | null {
  const cookie = request.headers.get("Cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  return match ? match[1] : null;
}

export async function getCustomerId(request: Request, context: AppLoadContext): Promise<string | null> {
  const sessionId = getSessionId(request);
  if (!sessionId) return null;
  return context.cloudflare.env.CACHE.get(`session:${sessionId}`);
}

export async function createSession(customerId: string, context: AppLoadContext): Promise<string> {
  const sessionId = crypto.randomUUID();
  await context.cloudflare.env.CACHE.put(`session:${sessionId}`, customerId, {
    expirationTtl: SESSION_TTL,
  });
  return sessionId;
}

export async function destroySession(sessionId: string, context: AppLoadContext): Promise<void> {
  await context.cloudflare.env.CACHE.delete(`session:${sessionId}`);
}

export function setSessionCookie(sessionId: string): string {
  return `${COOKIE_NAME}=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL}`;
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
