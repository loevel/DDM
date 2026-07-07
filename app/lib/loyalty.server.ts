// ─────────────────────────────────────────────────────────────────────────────
// Programme de fidélité par points. Barème centralisé + helpers de calcul et
// d'écriture au ledger (loyalty_transactions) avec idempotence par commande.
// ─────────────────────────────────────────────────────────────────────────────

export const LOYALTY = {
  /** Points gagnés par dollar de marchandise nette payée. */
  earnPerDollar: 1,
  /** Points nécessaires pour retrancher 1 $ (20 pts = 1 $ → 5 % de « cashback »). */
  redeemPointsPerDollar: 20,
  /** Échange minimum (5 $). */
  minRedeemPoints: 100,
  /** Bonus pour un avis vérifié avec photo (encourage l'UGC / preuve sociale). */
  reviewPhotoBonus: 100,
  /** Bonus pour un avis vérifié sans photo. */
  reviewTextBonus: 25,
} as const;

/** Points gagnés pour un montant de marchandise nette (arrondi à l'entier inférieur). */
export function pointsEarnedFor(netMerchandiseCad: number): number {
  return Math.max(0, Math.floor(netMerchandiseCad * LOYALTY.earnPerDollar));
}

/** Dollars échangeables avec `points`, en $ entiers, plafonnés par le sous-total. */
export function redeemableCad(points: number, capCad: number): number {
  if (!points || points < LOYALTY.minRedeemPoints) return 0;
  const affordable = Math.floor(points / LOYALTY.redeemPointsPerDollar);
  return Math.max(0, Math.min(affordable, Math.floor(capCad)));
}

/** Coût en points d'une remise de `cad` dollars. */
export function pointsCostFor(cad: number): number {
  return Math.round(cad) * LOYALTY.redeemPointsPerDollar;
}

/**
 * Écrit une transaction de points et met à jour le solde. `points` peut être
 * négatif (échange). Le solde n'est jamais poussé sous zéro. Retourne le nombre
 * de points réellement appliqués (utile quand un débit dépasse le solde).
 */
export async function recordPoints(
  db: D1Database,
  opts: { customerId: string; points: number; type: "earn" | "redeem" | "review" | "adjust"; reason?: string; orderRef?: string }
): Promise<number> {
  let applied = opts.points;
  if (applied < 0) {
    const row = await db.prepare("SELECT loyalty_points FROM customers WHERE id = ?").bind(opts.customerId).first<{ loyalty_points: number }>();
    const balance = row?.loyalty_points ?? 0;
    applied = -Math.min(balance, -applied); // ne pas descendre sous zéro
  }
  if (applied === 0) return 0;

  await db.prepare("UPDATE customers SET loyalty_points = MAX(0, loyalty_points + ?) WHERE id = ?")
    .bind(applied, opts.customerId).run();
  await db.prepare("INSERT INTO loyalty_transactions (customer_id, points, type, reason, order_reference) VALUES (?,?,?,?,?)")
    .bind(opts.customerId, applied, opts.type, opts.reason ?? null, opts.orderRef ?? null).run();
  return applied;
}

/** Vrai si une transaction d'un type donné existe déjà pour cette commande (idempotence). */
export async function hasPointsTxForOrder(db: D1Database, orderRef: string, type: string): Promise<boolean> {
  const row = await db.prepare("SELECT id FROM loyalty_transactions WHERE order_reference = ? AND type = ?")
    .bind(orderRef, type).first<{ id: number }>();
  return !!row;
}
