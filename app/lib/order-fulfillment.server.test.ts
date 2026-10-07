import { describe, expect, it } from "vitest";
import { applyPostPaymentEffects, claimOrderAsPaid } from "./order-fulfillment.server";

type Stmt = { sql: string; args: unknown[] };

const COMMANDE = {
  id: 1,
  reference: "DDM-TEST01",
  customer_email: "cliente@example.com",
  shipping_address: null,
  promo_code: null,
  gift_card_code: null as string | null,
  gift_card_cad: 0,
  ambassador_code: null,
  total_cad: 200,
  tps_cad: 0,
  tvq_cad: 0,
  loyalty_points_redeemed: 0,
};

/**
 * D1 en mémoire qui ne connaît que les requêtes dont ce fichier teste la
 * logique ; tout le reste répond « rien trouvé », ce que chaque bloc de
 * `applyPostPaymentEffects` absorbe par construction. Le journal `stmts`
 * permet d'affirmer non seulement ce qui a été écrit, mais ce qui ne l'a pas
 * été — c'est exactement l'objet du correctif.
 */
function fakeDb(opts: {
  commande?: Partial<typeof COMMANDE>;
  parrainage?: { referrer_email: string; reward_cad: number } | null;
  /** Solde réellement disponible sur la carte cadeau, s'il y en a une. */
  soldeCarte?: number;
  /**
   * Modélise deux exécutions concurrentes : le `SELECT` continue de voir le
   * parrainage « en attente » parce qu'aucune des deux n'a encore écrit. Seule
   * la transition atomique les sépare — c'est le seul réglage sous lequel le
   * `meta.changes` de l'implémentation est réellement mis à l'épreuve.
   */
  lecturesSimultanees?: boolean;
}) {
  const stmts: Stmt[] = [];
  const commande = { ...COMMANDE, ...opts.commande };
  let parrainageEnAttente = opts.parrainage ?? null;

  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          const enregistre = () => stmts.push({ sql, args });
          return {
            async first() {
              if (/FROM orders WHERE id = \?/.test(sql)) return commande;
              if (/FROM referrals WHERE order_reference/.test(sql)) {
                return opts.lecturesSimultanees ? (opts.parrainage ?? null) : parrainageEnAttente;
              }
              return null;
            },
            async all() {
              return { results: [] };
            },
            async run() {
              enregistre();
              if (/UPDATE referrals SET status = 'rewarded'/.test(sql)) {
                // Transition atomique : seul le premier passage la gagne.
                const gagne = parrainageEnAttente !== null;
                parrainageEnAttente = null;
                return { meta: { changes: gagne ? 1 : 0 } };
              }
              if (/UPDATE gift_cards/.test(sql)) {
                const [montant, , minimum] = args as [number, string, number];
                const couvre = (opts.soldeCarte ?? 0) >= minimum;
                if (couvre) opts.soldeCarte = (opts.soldeCarte ?? 0) - montant;
                return { meta: { changes: couvre ? 1 : 0 } };
              }
              return { meta: { changes: 0 } };
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  return { db, stmts };
}

const credits = (stmts: Stmt[]) => stmts.filter(s => /referral_credit_cad/.test(s.sql));
const debits = (stmts: Stmt[]) => stmts.filter(s => /UPDATE gift_cards/.test(s.sql));

/**
 * D1 en mémoire pour `claimOrderAsPaid` : une seule commande, dont le
 * `payment_status` évolue vraiment. Le `WHERE` n'est honoré que si la requête
 * le contient — retirer le `AND payment_status != 'paid'` de l'implémentation
 * fait donc échouer les tests de rejeu.
 */
function fakeOrdersDb(etatInitial: string, piConnu: string | null = "pi_123") {
  let paymentStatus = etatInitial;
  return {
    get paymentStatus() {
      return paymentStatus;
    },
    db: {
      prepare(sql: string) {
        return {
          bind(...args: unknown[]) {
            return {
              async run() {
                const pi = args[1] as string;
                if (pi !== piConnu) return { meta: { changes: 0 } };
                if (/payment_status\s*!=\s*'paid'/.test(sql) && paymentStatus === "paid") {
                  return { meta: { changes: 0 } };
                }
                paymentStatus = "paid";
                return { meta: { changes: 1 } };
              },
              async first() {
                return (args[0] as string) === piConnu ? { id: 42 } : null;
              },
            };
          },
        };
      },
    } as unknown as D1Database,
  };
}

describe("claimOrderAsPaid", () => {
  it("retourne l'id de la commande au premier passage", async () => {
    const { db } = fakeOrdersDb("pending");
    expect(await claimOrderAsPaid(db, "pi_123", "card")).toBe(42);
  });

  it("marque la commande payée", async () => {
    const ordres = fakeOrdersDb("pending");
    await claimOrderAsPaid(ordres.db, "pi_123", "card");
    expect(ordres.paymentStatus).toBe("paid");
  });

  it("retourne null au rejeu — un seul appelant applique les effets", async () => {
    const { db } = fakeOrdersDb("pending");
    expect(await claimOrderAsPaid(db, "pi_123", "card")).toBe(42);
    expect(await claimOrderAsPaid(db, "pi_123", "card")).toBeNull();
    expect(await claimOrderAsPaid(db, "pi_123", "card")).toBeNull();
  });

  it("retourne null si la commande était déjà payée par l'autre chemin", async () => {
    // Page de retour 3DS plus rapide que le webhook, ou l'inverse.
    const { db } = fakeOrdersDb("paid");
    expect(await claimOrderAsPaid(db, "pi_123", "card")).toBeNull();
  });

  it("retourne null quand aucune commande ne correspond au PaymentIntent", async () => {
    const { db } = fakeOrdersDb("pending");
    expect(await claimOrderAsPaid(db, "pi_inconnu", "card")).toBeNull();
  });
});

describe("applyPostPaymentEffects — récompense de parrainage", () => {
  it("crédite le parrain quand un parrainage est en attente", async () => {
    const { db, stmts } = fakeDb({
      parrainage: { referrer_email: "marraine@example.com", reward_cad: 15 },
    });
    await applyPostPaymentEffects(db, 1);

    expect(credits(stmts)).toHaveLength(1);
    expect(credits(stmts)[0].args).toEqual([15, "marraine@example.com"]);
  });

  it("ne crédite pas deux fois si le webhook est rejoué", async () => {
    // Le garde du webhook devrait l'empêcher, mais la récompense ne doit pas
    // en dépendre : la transition 'pending' → 'rewarded' est son propre jeton.
    const { db, stmts } = fakeDb({
      parrainage: { referrer_email: "marraine@example.com", reward_cad: 15 },
    });
    await applyPostPaymentEffects(db, 1);
    await applyPostPaymentEffects(db, 1);

    expect(credits(stmts)).toHaveLength(1);
  });

  it("ne crédite qu'une fois quand deux exécutions voient le même parrainage", async () => {
    // Le cas que le test précédent ne couvre pas : les deux `SELECT` passent
    // avant toute écriture, donc le court-circuit `if (referral)` ne protège
    // rien. Seule la lecture de `meta.changes` sur la transition atomique
    // empêche le second crédit.
    const { db, stmts } = fakeDb({
      parrainage: { referrer_email: "marraine@example.com", reward_cad: 15 },
      lecturesSimultanees: true,
    });
    await applyPostPaymentEffects(db, 1);
    await applyPostPaymentEffects(db, 1);

    expect(credits(stmts)).toHaveLength(1);
  });

  it("ne crédite rien quand aucun parrainage n'est en attente", async () => {
    const { db, stmts } = fakeDb({ parrainage: null });
    await applyPostPaymentEffects(db, 1);

    expect(credits(stmts)).toHaveLength(0);
  });

  it("marque le parrainage récompensé avant de créditer", async () => {
    const { db, stmts } = fakeDb({
      parrainage: { referrer_email: "marraine@example.com", reward_cad: 15 },
    });
    await applyPostPaymentEffects(db, 1);

    const claim = stmts.findIndex(s => /UPDATE referrals SET status = 'rewarded'/.test(s.sql));
    const credit = stmts.findIndex(s => /referral_credit_cad/.test(s.sql));
    expect(claim).toBeGreaterThanOrEqual(0);
    expect(credit).toBeGreaterThan(claim);
  });
});

describe("applyPostPaymentEffects — carte cadeau", () => {
  it("débite la carte retenue sur la commande", async () => {
    const { db, stmts } = fakeDb({
      commande: { gift_card_code: "DDM-AAAA-BBBB-CCCC", gift_card_cad: 50 },
      soldeCarte: 200,
    });
    await applyPostPaymentEffects(db, 1);

    expect(debits(stmts)).toHaveLength(1);
    expect(opts0(debits(stmts)[0])).toBe(50);
  });

  it("ne débite pas deux fois quand l'appelant l'a déjà fait", async () => {
    // Cas de la commande entièrement payée par carte cadeau : le débit a eu
    // lieu avant la confirmation, c'est lui qui l'a autorisée.
    const { db, stmts } = fakeDb({
      commande: { gift_card_code: "DDM-AAAA-BBBB-CCCC", gift_card_cad: 50 },
      soldeCarte: 200,
    });
    await applyPostPaymentEffects(db, 1, { giftCardAlreadyDebited: true });

    expect(debits(stmts)).toHaveLength(0);
  });

  it("n'interrompt pas les autres effets si le solde a fondu entre-temps", async () => {
    const { db, stmts } = fakeDb({
      commande: { gift_card_code: "DDM-AAAA-BBBB-CCCC", gift_card_cad: 50 },
      soldeCarte: 10,
      parrainage: { referrer_email: "marraine@example.com", reward_cad: 15 },
    });
    await applyPostPaymentEffects(db, 1);

    expect(debits(stmts)).toHaveLength(1);        // tenté
    expect(credits(stmts)).toHaveLength(1);       // et la suite a bien eu lieu
  });

  it("ne tente rien sans carte cadeau sur la commande", async () => {
    const { db, stmts } = fakeDb({});
    await applyPostPaymentEffects(db, 1);

    expect(debits(stmts)).toHaveLength(0);
  });
});

/** Montant lié en première position de l'UPDATE gift_cards. */
function opts0(stmt: Stmt): unknown {
  return stmt.args[0];
}
