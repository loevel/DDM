// ─────────────────────────────────────────────────────────────────────────────
// Génération de codes promotionnels.
//
// Un code promo est de l'argent : il vaut une remise, il est porteur au sens
// où quiconque le connaît peut s'en servir, et `/api/promo` dit publiquement
// s'il est valide. Il doit donc être aussi imprévisible qu'une carte cadeau.
//
// Les cinq endroits qui en fabriquaient un utilisaient
// `Math.random().toString(36).slice(2, 6)` — quatre caractères, soit environ
// 1,7 million de possibilités, tirés d'un générateur non cryptographique dont
// l'état interne se déduit de quelques sorties. Ici : `crypto.getRandomValues`
// et huit caractères, soit 32⁸ ≈ 1,1 × 10¹².
// ─────────────────────────────────────────────────────────────────────────────

/** Alphabet sans caractères ambigus (ni I, O, 0, 1) — un code se lit au téléphone. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** 32 divise 256 exactement : le `%` ci-dessous n'introduit aucun biais. */
const LONGUEUR = 8;

/**
 * Code promo imprévisible, préfixé pour rester lisible en base et dans
 * l'administration (`RETOUR…`, `MERCI…`, `QUIZ…`).
 */
export function genPromoCode(prefixe: string): string {
  const bytes = new Uint8Array(LONGUEUR);
  crypto.getRandomValues(bytes);
  let suffixe = "";
  for (const b of bytes) suffixe += ALPHABET[b % ALPHABET.length];
  return prefixe.toUpperCase() + suffixe;
}
