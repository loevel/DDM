import type { AppLoadContext } from "@remix-run/cloudflare";
import { magicLinkEmail, sendEmail } from "~/lib/email.server";

const TOKEN_TTL_MIN = 15;

const MAGIC_MAX = 5;              // tentatives max
const MAGIC_WINDOW = 60 * 15;     // par fenêtre de 15 min

/**
 * Rate limit sur l'envoi de magic link : par IP (anti-abus massif) et par
 * email (anti-harcèlement d'une boîte ciblée). Retourne les secondes de
 * blocage restantes, ou 0 si autorisé.
 */
export async function checkMagicLinkRateLimit(
  email: string,
  context: AppLoadContext,
  request: Request
): Promise<number> {
  const cache = context.cloudflare.env.CACHE;
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const keys = [`magic_rl:ip:${ip}`, `magic_rl:email:${email.toLowerCase().trim()}`];

  let maxRemaining = 0;
  for (const key of keys) {
    const raw = await cache.get(key);
    const data = raw ? (JSON.parse(raw) as { count: number; until: number }) : { count: 0, until: 0 };
    if (data.count >= MAGIC_MAX) {
      const remaining = Math.ceil((data.until - Date.now()) / 1000);
      if (remaining > 0) maxRemaining = Math.max(maxRemaining, remaining);
    }
  }
  return maxRemaining;
}

async function recordMagicLinkAttempt(
  email: string,
  context: AppLoadContext,
  request: Request
): Promise<void> {
  const cache = context.cloudflare.env.CACHE;
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const keys = [`magic_rl:ip:${ip}`, `magic_rl:email:${email.toLowerCase().trim()}`];
  for (const key of keys) {
    const raw = await cache.get(key);
    const data = raw ? (JSON.parse(raw) as { count: number; until: number }) : { count: 0, until: 0 };
    data.count += 1;
    data.until = Date.now() + MAGIC_WINDOW * 1000;
    await cache.put(key, JSON.stringify(data), { expirationTtl: MAGIC_WINDOW });
  }
}

export async function sendMagicLink(
  email: string,
  context: AppLoadContext,
  request: Request
): Promise<void> {
  await recordMagicLinkAttempt(email, context, request);

  const db = context.cloudflare.env.DB;
  const token =
    crypto.randomUUID().replace(/-/g, "") +
    crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date(
    Date.now() + TOKEN_TTL_MIN * 60 * 1000
  ).toISOString();

  await db
    .prepare("INSERT INTO magic_tokens (token, email, expires_at) VALUES (?, ?, ?)")
    .bind(token, email.toLowerCase().trim(), expiresAt)
    .run();

  const origin = new URL(request.url).origin;
  const magicUrl = `${origin}/compte/auth?token=${token}`;

  const resendApiKey = context.cloudflare.env.RESEND_API_KEY as string | undefined;

  if (!resendApiKey) {
    // Mode dev : affiche le lien dans les logs Cloudflare
    console.log(`[DEV] Magic link pour ${email} → ${magicUrl}`);
    return;
  }

  const { subject, html } = magicLinkEmail({ magicUrl, ttlMin: TOKEN_TTL_MIN });
  const ok = await sendEmail({ apiKey: resendApiKey, to: email, subject, html });
  if (!ok) throw new Error("Impossible d'envoyer l'email de connexion.");
}

export async function validateToken(
  token: string,
  context: AppLoadContext
): Promise<string | null> {
  const db = context.cloudflare.env.DB;

  const row = await db
    .prepare("SELECT email, expires_at, used FROM magic_tokens WHERE token = ?")
    .bind(token)
    .first<{ email: string; expires_at: string; used: number }>();

  if (!row || row.used || new Date(row.expires_at) < new Date()) return null;

  await db
    .prepare("UPDATE magic_tokens SET used = 1 WHERE token = ?")
    .bind(token)
    .run();

  await db
    .prepare("INSERT INTO customers (email) VALUES (?) ON CONFLICT(email) DO NOTHING")
    .bind(row.email)
    .run();

  const customer = await db
    .prepare("SELECT id FROM customers WHERE email = ?")
    .bind(row.email)
    .first<{ id: string }>();

  return customer?.id ?? null;
}

export interface Customer {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  created_at: string;
}

export async function getCustomer(
  customerId: string,
  context: AppLoadContext
): Promise<Customer | null> {
  return context.cloudflare.env.DB.prepare(
    "SELECT id, email, name, phone, created_at FROM customers WHERE id = ?"
  )
    .bind(customerId)
    .first<Customer>();
}
