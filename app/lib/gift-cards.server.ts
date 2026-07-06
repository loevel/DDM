// ─────────────────────────────────────────────────────────────────────────────
// Cartes cadeaux — génération de code, création et validation.
// Utilisé par l'achat en ligne (webhook Stripe) et le checkout (application
// d'un code comme mode de paiement).
// ─────────────────────────────────────────────────────────────────────────────

/** Montants permis à l'achat en ligne ($ CAD). */
export const GIFT_CARD_MIN_CAD = 25;
export const GIFT_CARD_MAX_CAD = 1000;

export function genGiftCardCode(): string {
  // Alphabet sans caractères ambigus (pas de I/O/0/1)
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const seg = (offset: number) =>
    Array.from({ length: 4 }, (_, i) => chars[bytes[offset + i] % chars.length]).join("");
  return `DDM-${seg(0)}-${seg(4)}-${seg(8)}`;
}

/** Crée une carte cadeau avec un code unique (réessaie en cas de collision). */
export async function createGiftCard(
  db: D1Database,
  opts: { amountCad: number; recipientName?: string | null; recipientEmail?: string | null; note?: string | null }
): Promise<{ id: number; code: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = genGiftCardCode();
    try {
      const row = await db
        .prepare(
          "INSERT INTO gift_cards (code, amount_cad, balance_cad, recipient_name, recipient_email, note, expires_at) VALUES (?,?,?,?,?,?,NULL) RETURNING id"
        )
        .bind(code, opts.amountCad, opts.amountCad, opts.recipientName ?? null, opts.recipientEmail ?? null, opts.note ?? null)
        .first<{ id: number }>();
      if (row) return { id: row.id, code };
    } catch {
      // Collision sur le code UNIQUE → nouveau tirage
    }
  }
  throw new Error("Impossible de générer un code de carte cadeau unique.");
}

/** Retourne la carte si le code existe avec un solde positif, sinon null. */
export async function getActiveGiftCard(
  db: D1Database,
  code: string
): Promise<{ id: number; code: string; balance_cad: number } | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;
  const card = await db
    .prepare("SELECT id, code, balance_cad FROM gift_cards WHERE code = ?")
    .bind(normalized)
    .first<{ id: number; code: string; balance_cad: number }>();
  if (!card || card.balance_cad <= 0) return null;
  return card;
}

/** Débite le solde (plancher à 0) — appelé au paiement confirmé seulement. */
export async function debitGiftCard(db: D1Database, code: string, amountCad: number): Promise<void> {
  await db
    .prepare(
      "UPDATE gift_cards SET balance_cad = MAX(0, ROUND(balance_cad - ?, 2)), updated_at = datetime('now') WHERE code = ?"
    )
    .bind(amountCad, code)
    .run();
}
