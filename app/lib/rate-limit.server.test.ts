import { describe, expect, it } from "vitest";
import type { AppLoadContext } from "@remix-run/cloudflare";
import { checkRateLimit } from "./rate-limit.server";

/** KV en mémoire, suffisant pour tester la logique de fenêtre. */
function fakeContext() {
  const store = new Map<string, string>();
  const cache = {
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => void store.set(k, v),
    delete: async (k: string) => void store.delete(k),
  };
  return { cloudflare: { env: { CACHE: cache } } } as unknown as AppLoadContext;
}

const req = (ip: string) =>
  new Request("https://example.com", { headers: { "CF-Connecting-IP": ip } });

describe("checkRateLimit", () => {
  it("autorise jusqu'à la limite puis bloque", async () => {
    const ctx = fakeContext();
    const opts = { name: "test", max: 3, windowSeconds: 60 };
    expect(await checkRateLimit(ctx, req("1.1.1.1"), opts)).toBe(true);
    expect(await checkRateLimit(ctx, req("1.1.1.1"), opts)).toBe(true);
    expect(await checkRateLimit(ctx, req("1.1.1.1"), opts)).toBe(true);
    expect(await checkRateLimit(ctx, req("1.1.1.1"), opts)).toBe(false);
    expect(await checkRateLimit(ctx, req("1.1.1.1"), opts)).toBe(false);
  });

  it("compte séparément par IP", async () => {
    const ctx = fakeContext();
    const opts = { name: "test", max: 1, windowSeconds: 60 };
    expect(await checkRateLimit(ctx, req("1.1.1.1"), opts)).toBe(true);
    expect(await checkRateLimit(ctx, req("2.2.2.2"), opts)).toBe(true);
    expect(await checkRateLimit(ctx, req("1.1.1.1"), opts)).toBe(false);
  });

  it("compte séparément par nom de limite", async () => {
    const ctx = fakeContext();
    expect(await checkRateLimit(ctx, req("1.1.1.1"), { name: "a", max: 1, windowSeconds: 60 })).toBe(true);
    expect(await checkRateLimit(ctx, req("1.1.1.1"), { name: "b", max: 1, windowSeconds: 60 })).toBe(true);
    expect(await checkRateLimit(ctx, req("1.1.1.1"), { name: "a", max: 1, windowSeconds: 60 })).toBe(false);
  });
});
