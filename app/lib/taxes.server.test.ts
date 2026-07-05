import { describe, expect, it } from "vitest";
import { computeTaxes } from "./taxes.server";

describe("computeTaxes", () => {
  it("applique TPS + TVQ au Québec", () => {
    const t = computeTaxes(100, "QC");
    expect(t.tps).toBe(5);
    expect(t.tvq).toBe(9.98); // 9,975 % arrondi au cent
    expect(t.tpsLabel).toBe("TPS (5 %)");
    expect(t.tvqLabel).toBe("TVQ (9,975 %)");
  });

  it("applique la TVH en Ontario (13 %)", () => {
    const t = computeTaxes(100, "ON");
    expect(t.tps).toBe(13);
    expect(t.tvq).toBe(0);
    expect(t.tpsLabel).toBe("TVH (13 %)");
    expect(t.tvqLabel).toBeNull();
  });

  it("applique la TVH à 15 % dans les Maritimes", () => {
    for (const prov of ["NS", "NB", "NL", "PE"]) {
      const t = computeTaxes(200, prov);
      expect(t.tps).toBe(30);
      expect(t.tvq).toBe(0);
    }
  });

  it("applique la TPS seule ailleurs (AB, BC…)", () => {
    const t = computeTaxes(100, "AB");
    expect(t.tps).toBe(5);
    expect(t.tvq).toBe(0);
    expect(t.tvqLabel).toBeNull();
  });

  it("prend le Québec par défaut si la province est vide", () => {
    const t = computeTaxes(100, "");
    expect(t.tvq).toBeGreaterThan(0);
  });

  it("est insensible à la casse", () => {
    expect(computeTaxes(100, "on").tps).toBe(13);
  });

  it("arrondit correctement au cent", () => {
    const t = computeTaxes(19.99, "QC");
    expect(t.tps).toBe(1);      // 0.9995 → 1.00
    expect(t.tvq).toBe(1.99);   // 1.9940… → 1.99
  });

  it("retourne zéro pour un montant nul", () => {
    const t = computeTaxes(0, "QC");
    expect(t.tps).toBe(0);
    expect(t.tvq).toBe(0);
  });
});
