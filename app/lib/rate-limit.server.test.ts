import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppLoadContext } from "@remix-run/cloudflare";
import { checkRateLimit } from "./rate-limit.server";

/**
 * KV en mémoire qui **modélise l'expiration**.
 *
 * Le faux précédent ignorait le troisième argument de `put`, donc le TTL
 * n'était couvert par aucun test — et c'est précisément là que se cachait le
 * défaut : l'expiration était repoussée à chaque écriture. Un faux qui jette
 * les options ne peut pas voir un défaut qui ne vit que dans les options.
 */
function fakeContext() {
  const store = new Map<string, { valeur: string; expire: number }>();
  /** Chaque TTL effectivement demandé à KV, dans l'ordre. */
  const ttls: number[] = [];
  const maintenant = () => Math.floor(Date.now() / 1000);

  const cache = {
    get: async (k: string) => {
      const e = store.get(k);
      if (!e) return null;
      if (maintenant() >= e.expire) {
        store.delete(k);
        return null;
      }
      return e.valeur;
    },
    put: async (k: string, valeur: string, o?: { expirationTtl?: number }) => {
      const ttl = o?.expirationTtl;
      if (ttl !== undefined) ttls.push(ttl);
      store.set(k, { valeur, expire: maintenant() + (ttl ?? Number.MAX_SAFE_INTEGER) });
    },
    delete: async (k: string) => void store.delete(k),
  };

  const ctx = { cloudflare: { env: { CACHE: cache } } } as unknown as AppLoadContext;
  return { ctx, store, ttls };
}

const req = (ip: string) =>
  new Request("https://example.com", { headers: { "CF-Connecting-IP": ip } });

/** Fait avancer l'horloge que partagent le faux KV et l'implémentation. */
const avance = (secondes: number) => vi.advanceTimersByTime(secondes * 1000);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("checkRateLimit", () => {
  it("autorise jusqu'à la limite puis bloque", async () => {
    const { ctx } = fakeContext();
    const opts = { name: "test", max: 3, windowSeconds: 60 };
    expect(await checkRateLimit(ctx, req("1.1.1.1"), opts)).toBe(true);
    expect(await checkRateLimit(ctx, req("1.1.1.1"), opts)).toBe(true);
    expect(await checkRateLimit(ctx, req("1.1.1.1"), opts)).toBe(true);
    expect(await checkRateLimit(ctx, req("1.1.1.1"), opts)).toBe(false);
    expect(await checkRateLimit(ctx, req("1.1.1.1"), opts)).toBe(false);
  });

  it("compte séparément par IP", async () => {
    const { ctx } = fakeContext();
    const opts = { name: "test", max: 1, windowSeconds: 60 };
    expect(await checkRateLimit(ctx, req("1.1.1.1"), opts)).toBe(true);
    expect(await checkRateLimit(ctx, req("2.2.2.2"), opts)).toBe(true);
    expect(await checkRateLimit(ctx, req("1.1.1.1"), opts)).toBe(false);
  });

  it("compte séparément par nom de limite", async () => {
    const { ctx } = fakeContext();
    expect(await checkRateLimit(ctx, req("1.1.1.1"), { name: "a", max: 1, windowSeconds: 60 })).toBe(true);
    expect(await checkRateLimit(ctx, req("1.1.1.1"), { name: "b", max: 1, windowSeconds: 60 })).toBe(true);
    expect(await checkRateLimit(ctx, req("1.1.1.1"), { name: "a", max: 1, windowSeconds: 60 })).toBe(false);
  });

  it("laisse toujours passer la toute première requête", async () => {
    const { ctx } = fakeContext();
    // Le plafond de /api/checkout : un refus au premier essai ne serait pas
    // une gêne, ce serait une vente perdue.
    expect(
      await checkRateLimit(ctx, req("1.1.1.1"), { name: "checkout", max: 20, windowSeconds: 600 })
    ).toBe(true);
  });

  it("rouvre la fenêtre à l'heure dite après une rafale", async () => {
    const { ctx } = fakeContext();
    const opts = { name: "checkout", max: 20, windowSeconds: 600 };
    for (let i = 0; i < 20; i++) {
      expect(await checkRateLimit(ctx, req("1.1.1.1"), opts)).toBe(true);
    }
    expect(await checkRateLimit(ctx, req("1.1.1.1"), opts)).toBe(false);

    avance(599);
    expect(await checkRateLimit(ctx, req("1.1.1.1"), opts)).toBe(false);
    avance(1);
    expect(await checkRateLimit(ctx, req("1.1.1.1"), opts)).toBe(true);
  });

  it("expire même quand l'IP reste active en continu", async () => {
    // LE défaut corrigé ici. `put` réarmait le TTL à chaque écriture, donc une
    // IP qui ne se taisait jamais ne retrouvait jamais son quota : le blocage
    // devenait permanent au lieu de durer une fenêtre. Derrière le NAT d'un
    // opérateur mobile, où des dizaines de clientes partagent une adresse,
    // c'est une vente perdue.
    const { ctx } = fakeContext();
    const opts = { name: "checkout", max: 20, windowSeconds: 600 };

    // 20 requêtes espacées d'une minute : 20 minutes, soit deux fois la
    // fenêtre annoncée. Elles passent dans les deux implémentations.
    for (let i = 0; i < 20; i++) {
      expect(await checkRateLimit(ctx, req("1.1.1.1"), opts)).toBe(true);
      avance(60);
    }
    // Celle-ci départage : la fenêtre ouverte à la première requête est
    // révolue depuis longtemps, donc le quota doit être revenu.
    expect(await checkRateLimit(ctx, req("1.1.1.1"), opts)).toBe(true);
  });

  it("ne repousse jamais sa propre expiration", async () => {
    const { ctx, ttls } = fakeContext();
    const opts = { name: "checkout", max: 20, windowSeconds: 600 };

    await checkRateLimit(ctx, req("1.1.1.1"), opts);
    avance(100);
    await checkRateLimit(ctx, req("1.1.1.1"), opts);
    avance(100);
    await checkRateLimit(ctx, req("1.1.1.1"), opts);

    // Les TTL demandés décroissent : la clé meurt à l'heure fixée par la
    // première requête, pas 600 s après la dernière.
    expect(ttls).toEqual([600, 500, 400]);
  });

  it("respecte le plancher de 60 s imposé par KV", async () => {
    const { ctx, ttls } = fakeContext();
    const opts = { name: "checkout", max: 20, windowSeconds: 600 };

    await checkRateLimit(ctx, req("1.1.1.1"), opts);
    avance(580); // il ne resterait que 20 s à courir
    await checkRateLimit(ctx, req("1.1.1.1"), opts);

    expect(ttls[1]).toBe(60);
  });

  it("accepte un compteur écrit dans l'ancien format", async () => {
    // Les clés encore en vol au moment du déploiement portent un simple
    // nombre, sans début de fenêtre.
    const { ctx, store } = fakeContext();
    const opts = { name: "contact", max: 3, windowSeconds: 3600 };
    store.set("rl:contact:1.1.1.1", {
      valeur: "2",
      expire: Math.floor(Date.now() / 1000) + 3600,
    });

    // Le compte déjà consommé est conservé : pas de quota neuf offert à qui
    // martèle à l'instant du déploiement.
    expect(await checkRateLimit(ctx, req("1.1.1.1"), opts)).toBe(true);
    expect(await checkRateLimit(ctx, req("1.1.1.1"), opts)).toBe(false);
  });

  it("ouvre une fenêtre neuve si KV sert un compteur périmé", async () => {
    // KV est à cohérence éventuelle et n'efface pas ses clés à la seconde
    // près : une lecture peut rendre un compteur dont la fenêtre est révolue.
    // C'est ce code qui fait foi sur la fenêtre, pas l'expiration de KV.
    const { ctx, store } = fakeContext();
    const opts = { name: "checkout", max: 20, windowSeconds: 600 };
    const maintenant = Math.floor(Date.now() / 1000);

    store.set("rl:checkout:1.1.1.1", {
      valeur: `20:${maintenant - 5000}`, // plafond atteint, mais il y a longtemps
      expire: maintenant + 9999, // clé encore servie par KV
    });

    expect(await checkRateLimit(ctx, req("1.1.1.1"), opts)).toBe(true);
  });
});
