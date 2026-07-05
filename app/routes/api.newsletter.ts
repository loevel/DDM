import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { getDB } from "~/lib/db.server";
import { checkRateLimit } from "~/lib/rate-limit.server";

export async function action({ request, context }: ActionFunctionArgs) {
  const allowed = await checkRateLimit(context, request, { name: "newsletter", max: 5, windowSeconds: 3600 });
  if (!allowed) return Response.json({ error: "Trop de tentatives. Réessayez plus tard." }, { status: 429 });

  const { email } = await request.json();
  if (!email?.includes("@")) return Response.json({ error: "Email invalide" }, { status: 400 });

  const db = getDB(context);
  const normalized = String(email).trim().toLowerCase();
  // Preuve de consentement exigée par la LCAP : date (subscribed_at) + adresse IP
  const ip = request.headers.get("CF-Connecting-IP") ?? null;
  const token = crypto.randomUUID().replace(/-/g, "");

  try {
    await db.prepare(
      "INSERT INTO newsletter (email, consent_ip, unsub_token) VALUES (?, ?, ?)"
    ).bind(normalized, ip, token).run();
    return Response.json({ success: true, message: "Merci pour votre inscription !" });
  } catch (e: any) {
    if (e.message?.includes("UNIQUE")) {
      // Déjà présent : si désabonné, on ré-inscrit avec un nouveau consentement
      try {
        await db.prepare(`
          UPDATE newsletter
          SET unsubscribed_at = NULL, consent_ip = ?, subscribed_at = datetime('now')
          WHERE email = ? AND unsubscribed_at IS NOT NULL
        `).bind(ip, normalized).run();
      } catch { /* colonnes pas encore migrées */ }
      return Response.json({ success: true, message: "Déjà inscrit." });
    }
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
