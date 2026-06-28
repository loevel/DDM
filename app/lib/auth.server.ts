import { createMimeMessage } from "mimetext/browser";
import type { AppLoadContext } from "@remix-run/cloudflare";

// EmailMessage vient de cloudflare:email — injecté dans globalThis par server.ts
// car Vite ne peut pas résoudre ce module virtuel Cloudflare
const getEmailMessage = () =>
  (globalThis as any).__CF_EmailMessage as typeof import("cloudflare:email").EmailMessage;

const TOKEN_TTL_MIN = 15;
const FROM_ADDRESS = "noreply@ddmwigs.ca";
const FROM_NAME = "DDM Wigs & More";

export async function sendMagicLink(
  email: string,
  context: AppLoadContext,
  request: Request
): Promise<void> {
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

  const htmlBody = `
    <div style="font-family:Manrope,sans-serif;max-width:520px;margin:0 auto;padding:40px 24px;background:#fcf9f8">
      <p style="font-size:22px;font-weight:800;color:#7d562d;letter-spacing:0.05em;margin-bottom:4px">DDM WIGS & MORE</p>
      <hr style="border:none;border-top:1px solid #d4c4b7;margin:16px 0 32px">
      <p style="font-size:16px;color:#1b1c1c;margin-bottom:8px">Bonjour,</p>
      <p style="font-size:15px;color:#50453b;line-height:1.6;margin-bottom:32px">
        Cliquez sur le bouton ci-dessous pour accéder à votre espace client.<br>
        Ce lien est valide pendant <strong>${TOKEN_TTL_MIN} minutes</strong>.
      </p>
      <a href="${magicUrl}"
         style="display:inline-block;background:#7d562d;color:#ffffff;padding:14px 32px;font-size:13px;font-weight:700;letter-spacing:0.1em;text-decoration:none;text-transform:uppercase">
        Accéder à mon espace
      </a>
      <p style="font-size:12px;color:#82756a;margin-top:40px;line-height:1.5">
        Si vous n'avez pas demandé ce lien, ignorez simplement cet email.<br>
        Ou copiez cette URL dans votre navigateur :<br>
        <span style="color:#7d562d;word-break:break-all">${magicUrl}</span>
      </p>
    </div>
  `;

  const emailBinding = (context.cloudflare.env as any).EMAIL as { send: (msg: unknown) => Promise<void> } | undefined;

  if (!emailBinding) {
    console.log(`[DEV] Magic link pour ${email} → ${magicUrl}`);
    return;
  }

  const msg = createMimeMessage();
  msg.setSender({ name: FROM_NAME, addr: FROM_ADDRESS });
  msg.setRecipient(email);
  msg.setSubject("Votre lien de connexion — DDM Wigs & More");
  msg.addMessage({ contentType: "text/html", data: htmlBody });

  const EmailMessage = getEmailMessage();
  const message = new EmailMessage(FROM_ADDRESS, email, msg.asRaw());
  await emailBinding.send(message);
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
