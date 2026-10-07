import { describe, expect, it } from "vitest";
import { debitGiftCard, genGiftCardCode } from "./gift-cards.server";

/**
 * D1 en mémoire limité au seul `UPDATE gift_cards` de `debitGiftCard`.
 *
 * Le garde `balance_cad >= ?` n'est appliqué que si la requête le contient
 * vraiment : si quelqu'un le retire de l'implémentation, le faux cesse de
 * protéger le solde et les tests de double dépense échouent. C'est ce
 * couplage volontaire qui fait du fichier une protection et pas une
 * paraphrase.
 */
function fakeDb(soldes: Record<string, number>) {
  return {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async run() {
              const [montant, code, minimum] = args as [number, string, number | undefined];
              const solde = soldes[code];
              if (solde === undefined) return { meta: { changes: 0 } };
              if (/balance_cad\s*>=\s*\?/i.test(sql) && solde < (minimum ?? 0)) {
                return { meta: { changes: 0 } };
              }
              soldes[code] = Math.round((solde - montant) * 100) / 100;
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

describe("debitGiftCard", () => {
  it("débite une carte au solde suffisant", async () => {
    const soldes = { "DDM-AAAA-BBBB-CCCC": 100 };
    expect(await debitGiftCard(fakeDb(soldes), "DDM-AAAA-BBBB-CCCC", 40)).toBe(true);
    expect(soldes["DDM-AAAA-BBBB-CCCC"]).toBe(60);
  });

  it("refuse sans rien modifier quand le solde est insuffisant", async () => {
    const soldes = { "DDM-AAAA-BBBB-CCCC": 30 };
    expect(await debitGiftCard(fakeDb(soldes), "DDM-AAAA-BBBB-CCCC", 40)).toBe(false);
    expect(soldes["DDM-AAAA-BBBB-CCCC"]).toBe(30);
  });

  it("autorise le débit qui vide exactement la carte", async () => {
    const soldes = { "DDM-AAAA-BBBB-CCCC": 40 };
    expect(await debitGiftCard(fakeDb(soldes), "DDM-AAAA-BBBB-CCCC", 40)).toBe(true);
    expect(soldes["DDM-AAAA-BBBB-CCCC"]).toBe(0);
  });

  it("ne laisse pas dépenser deux fois le même solde", async () => {
    // Le cœur du correctif : deux commandes de 900 $ sur une carte de 1000 $.
    const soldes = { "DDM-AAAA-BBBB-CCCC": 1000 };
    const db = fakeDb(soldes);
    expect(await debitGiftCard(db, "DDM-AAAA-BBBB-CCCC", 900)).toBe(true);
    expect(await debitGiftCard(db, "DDM-AAAA-BBBB-CCCC", 900)).toBe(false);
    expect(soldes["DDM-AAAA-BBBB-CCCC"]).toBe(100);
  });

  it("ne descend jamais sous zéro", async () => {
    const soldes = { "DDM-AAAA-BBBB-CCCC": 5 };
    const db = fakeDb(soldes);
    for (let i = 0; i < 10; i++) await debitGiftCard(db, "DDM-AAAA-BBBB-CCCC", 5);
    expect(soldes["DDM-AAAA-BBBB-CCCC"]).toBe(0);
  });

  it("refuse un code inconnu", async () => {
    expect(await debitGiftCard(fakeDb({}), "DDM-ZZZZ-ZZZZ-ZZZZ", 10)).toBe(false);
  });

  it("normalise le code comme getActiveGiftCard", async () => {
    const soldes = { "DDM-AAAA-BBBB-CCCC": 50 };
    expect(await debitGiftCard(fakeDb(soldes), "  ddm-aaaa-bbbb-cccc  ", 10)).toBe(true);
    expect(soldes["DDM-AAAA-BBBB-CCCC"]).toBe(40);
  });

  it("refuse un montant nul ou négatif sans toucher à la base", async () => {
    const soldes = { "DDM-AAAA-BBBB-CCCC": 50 };
    expect(await debitGiftCard(fakeDb(soldes), "DDM-AAAA-BBBB-CCCC", 0)).toBe(false);
    expect(await debitGiftCard(fakeDb(soldes), "DDM-AAAA-BBBB-CCCC", -20)).toBe(false);
    expect(soldes["DDM-AAAA-BBBB-CCCC"]).toBe(50);
  });
});

describe("genGiftCardCode", () => {
  it("produit le format DDM-XXXX-XXXX-XXXX sans caractère ambigu", async () => {
    for (let i = 0; i < 50; i++) {
      expect(genGiftCardCode()).toMatch(/^DDM-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    }
  });

  it("ne se répète pas", async () => {
    const codes = new Set(Array.from({ length: 200 }, () => genGiftCardCode()));
    expect(codes.size).toBe(200);
  });
});
