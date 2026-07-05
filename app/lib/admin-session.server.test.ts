import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./admin-session.server";

describe("hashPassword / verifyPassword", () => {
  it("vérifie un mot de passe correct", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejette un mot de passe incorrect", async () => {
    const hash = await hashPassword("bon-mot-de-passe-123");
    expect(await verifyPassword("mauvais-mot-de-passe", hash)).toBe(false);
  });

  it("produit un sel différent à chaque hachage", async () => {
    const h1 = await hashPassword("même-mot-de-passe");
    const h2 = await hashPassword("même-mot-de-passe");
    expect(h1).not.toBe(h2);
    expect(await verifyPassword("même-mot-de-passe", h1)).toBe(true);
    expect(await verifyPassword("même-mot-de-passe", h2)).toBe(true);
  });

  it("stocke au format sel:hash en hexadécimal", async () => {
    const hash = await hashPassword("abc");
    const [salt, digest] = hash.split(":");
    expect(salt).toMatch(/^[0-9a-f]{32}$/);   // 16 octets
    expect(digest).toMatch(/^[0-9a-f]{64}$/); // 32 octets (SHA-256)
  });

  it("rejette une valeur stockée malformée sans lever d'erreur", async () => {
    expect(await verifyPassword("peu importe", "pas-un-hash")).toBe(false);
    expect(await verifyPassword("peu importe", "")).toBe(false);
  });

  it("gère les caractères Unicode", async () => {
    const hash = await hashPassword("perruque-élégance-québécoise-🦱");
    expect(await verifyPassword("perruque-élégance-québécoise-🦱", hash)).toBe(true);
    expect(await verifyPassword("perruque-elegance-quebecoise", hash)).toBe(false);
  });
});
