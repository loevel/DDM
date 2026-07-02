import type { AppLoadContext } from "@remix-run/cloudflare";

const COOKIE = "ddm_admin";
const TTL = 60 * 60 * 8; // 8 heures

// ── Rate limiting connexion ──────────────────────────────────────────────────
const MAX_ATTEMPTS = 5;
const LOCKOUT_TTL = 60 * 15; // 15 minutes

// ── Types ────────────────────────────────────────────────────────────────────

export type AdminSessionUser = {
  id: number;
  email: string;
  name: string;
  role: "owner" | "staff";
};

export type AdminUserRow = AdminSessionUser & {
  password_hash: string;
  active: number;
  last_login_at: string | null;
  created_at: string;
};

// ── Hachage de mot de passe (PBKDF2-SHA256, Web Crypto — dispo sur Workers) ──

const PBKDF2_ITERATIONS = 100_000;

function toHex(buf: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(buf as ArrayBuffer)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function pbkdf2(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as unknown as ArrayBuffer, iterations: PBKDF2_ITERATIONS },
    key,
    256
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt);
  return `${toHex(salt)}:${toHex(hash)}`;
}

// Comparaison à temps constant — le hash PBKDF2 rend de toute façon
// l'information temporelle inexploitable, ceinture et bretelles.
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const computed = await pbkdf2(password, fromHex(saltHex));
  return timingSafeEqual(computed, fromHex(hashHex));
}

// ── Rate limiting par IP (KV) ────────────────────────────────────────────────

export function getClientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "unknown";
}

/** Retourne les secondes restantes de blocage, ou 0 si autorisé. */
export async function checkLoginRateLimit(
  request: Request,
  context: AppLoadContext
): Promise<number> {
  const key = `admin_login_attempts:${getClientIp(request)}`;
  const raw = await context.cloudflare.env.CACHE.get(key);
  const data = raw ? (JSON.parse(raw) as { count: number; until: number }) : null;
  if (data && data.count >= MAX_ATTEMPTS) {
    const remaining = Math.ceil((data.until - Date.now()) / 1000);
    if (remaining > 0) return remaining;
  }
  return 0;
}

export async function recordFailedLogin(
  request: Request,
  context: AppLoadContext
): Promise<void> {
  const key = `admin_login_attempts:${getClientIp(request)}`;
  const raw = await context.cloudflare.env.CACHE.get(key);
  const data = raw ? (JSON.parse(raw) as { count: number; until: number }) : { count: 0, until: 0 };
  data.count += 1;
  data.until = Date.now() + LOCKOUT_TTL * 1000;
  await context.cloudflare.env.CACHE.put(key, JSON.stringify(data), {
    expirationTtl: LOCKOUT_TTL,
  });
}

export async function clearLoginAttempts(
  request: Request,
  context: AppLoadContext
): Promise<void> {
  await context.cloudflare.env.CACHE.delete(`admin_login_attempts:${getClientIp(request)}`);
}

// ── Sessions nominatives (KV) ────────────────────────────────────────────────

export function getAdminSessionId(request: Request): string | null {
  const cookie = request.headers.get("Cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return match ? match[1] : null;
}

/** Identité de l'admin connecté, ou null. */
export async function getAdminUser(
  request: Request,
  context: AppLoadContext
): Promise<AdminSessionUser | null> {
  const sid = getAdminSessionId(request);
  if (!sid) return null;
  const val = await context.cloudflare.env.CACHE.get(`admin_session:${sid}`);
  if (!val) return null;
  // Rétro-compat : anciennes sessions stockées comme "1" (sans identité)
  if (val === "1") return { id: 0, email: "admin@legacy", name: "Admin", role: "owner" };
  try {
    return JSON.parse(val) as AdminSessionUser;
  } catch {
    return null;
  }
}

export async function isAdminAuthenticated(
  request: Request,
  context: AppLoadContext
): Promise<boolean> {
  return (await getAdminUser(request, context)) !== null;
}

export async function createAdminSession(
  context: AppLoadContext,
  user: AdminSessionUser
): Promise<string> {
  const sid = crypto.randomUUID();
  await context.cloudflare.env.CACHE.put(`admin_session:${sid}`, JSON.stringify(user), {
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
  `${COOKIE}=${sid}; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=${TTL}`;

export const clearAdminCookie = () =>
  `${COOKIE}=; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

// ── Journal d'audit ──────────────────────────────────────────────────────────

/**
 * Enregistre une action admin. Ne bloque jamais l'action principale :
 * une erreur d'audit est avalée (loggée en console).
 */
export async function logAdminAction(
  context: AppLoadContext,
  entry: {
    admin: AdminSessionUser | { id?: number | null; email: string } | null;
    action: string;
    entity?: string;
    entityId?: string | number;
    details?: unknown;
    request?: Request;
  }
): Promise<void> {
  try {
    await context.cloudflare.env.DB.prepare(
      `INSERT INTO admin_audit_log (admin_id, admin_email, action, entity, entity_id, details, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        entry.admin?.id ?? null,
        entry.admin?.email ?? "anonyme",
        entry.action,
        entry.entity ?? null,
        entry.entityId != null ? String(entry.entityId) : null,
        entry.details != null ? JSON.stringify(entry.details) : null,
        entry.request ? getClientIp(entry.request) : null
      )
      .run();
  } catch (e) {
    console.error("audit log error:", e);
  }
}
