import { describe, expect, it, vi } from "vitest";
import { genPromoCode } from "./promo-codes.server";

describe("genPromoCode", () => {
  it("préfixe le code et ajoute 8 caractères non ambigus", () => {
    expect(genPromoCode("RETOUR")).toMatch(/^RETOUR[A-HJ-NP-Z2-9]{8}$/);
    expect(genPromoCode("MERCI")).toMatch(/^MERCI[A-HJ-NP-Z2-9]{8}$/);
    expect(genPromoCode("QUIZ")).toMatch(/^QUIZ[A-HJ-NP-Z2-9]{8}$/);
  });

  it("met le préfixe en majuscules", () => {
    expect(genPromoCode("retour")).toMatch(/^RETOUR/);
  });

  it("n'emploie jamais I, O, 0 ni 1 dans le suffixe", () => {
    for (let i = 0; i < 200; i++) {
      expect(genPromoCode("X").slice(1)).not.toMatch(/[IO01]/);
    }
  });

  it("ne se répète pas sur un grand tirage", () => {
    const codes = new Set(Array.from({ length: 2000 }, () => genPromoCode("RETOUR")));
    expect(codes.size).toBe(2000);
  });

  it("tire ses octets de crypto.getRandomValues, jamais de Math.random", () => {
    // C'est l'invariant qui compte : un retour à `Math.random()` rendrait les
    // codes prédictibles sans rien changer à leur apparence, donc aucun des
    // tests de forme ci-dessus ne le verrait.
    const crng = vi.spyOn(crypto, "getRandomValues");
    const mathRandom = vi.spyOn(Math, "random");
    try {
      genPromoCode("RETOUR");
      expect(crng).toHaveBeenCalled();
      expect(mathRandom).not.toHaveBeenCalled();
    } finally {
      crng.mockRestore();
      mathRandom.mockRestore();
    }
  });

  it("couvre tout l'alphabet sans biais grossier", () => {
    // 32 valeurs possibles, 32 000 tirages : chaque caractère doit apparaître.
    // Un `% 32` biaisé ou un alphabet tronqué laisserait des trous.
    const vus = new Set<string>();
    for (let i = 0; i < 4000; i++) {
      for (const c of genPromoCode("")) vus.add(c);
    }
    expect(vus.size).toBe(32);
  });
});
