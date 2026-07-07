import { describe, expect, it } from "vitest";
import { pointsEarnedFor, redeemableCad, pointsCostFor, LOYALTY } from "./loyalty.server";

describe("pointsEarnedFor", () => {
  it("crédite 1 point par dollar (arrondi inférieur)", () => {
    expect(pointsEarnedFor(300)).toBe(300);
    expect(pointsEarnedFor(299.99)).toBe(299);
    expect(pointsEarnedFor(0)).toBe(0);
  });

  it("ne descend jamais sous zéro", () => {
    expect(pointsEarnedFor(-50)).toBe(0);
  });
});

describe("redeemableCad", () => {
  it("retourne 0 sous le minimum de 100 points", () => {
    expect(redeemableCad(99, 500)).toBe(0);
    expect(redeemableCad(0, 500)).toBe(0);
  });

  it("convertit 20 points = 1 $", () => {
    expect(redeemableCad(100, 500)).toBe(5);
    expect(redeemableCad(450, 500)).toBe(22); // floor(450/20) = 22
  });

  it("plafonne au sous-total disponible", () => {
    expect(redeemableCad(10000, 12)).toBe(12);
    expect(redeemableCad(10000, 12.99)).toBe(12);
  });
});

describe("pointsCostFor", () => {
  it("coûte 20 points par dollar retranché", () => {
    expect(pointsCostFor(5)).toBe(100);
    expect(pointsCostFor(22)).toBe(440);
    expect(pointsCostFor(0)).toBe(0);
  });

  it("est cohérent avec le barème", () => {
    expect(pointsCostFor(1)).toBe(LOYALTY.redeemPointsPerDollar);
  });
});
