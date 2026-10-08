import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyTurnstile } from "./turnstile.server";

/** Réponse siteverify simulée — on ne teste que notre logique de décision. */
function mockSiteverify(payload: Record<string, unknown>) {
  const calls: URLSearchParams[] = [];
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    calls.push(new URLSearchParams(init.body as string));
    return { json: async () => payload } as Response;
  });
  return calls;
}

const req = (url = "https://ddmwigs.com/contact", ip?: string) =>
  new Request(url, { headers: ip ? { "CF-Connecting-IP": ip } : {} });

const opts = (action = "contact", request = req()) => ({ action, request });

afterEach(() => vi.unstubAllGlobals());

describe("verifyTurnstile", () => {
  it("refuse un jeton absent sans appeler Cloudflare", async () => {
    const calls = mockSiteverify({ success: true });
    expect(await verifyTurnstile(null, "cle", opts())).toBe("refuse");
    expect(calls).toHaveLength(0);
  });

  it("accepte un jeton valide dont l'action et le domaine concordent", async () => {
    mockSiteverify({ success: true, action: "contact", hostname: "ddmwigs.com" });
    expect(await verifyTurnstile("jeton", "cle", opts())).toBe("ok");
  });

  it("refuse un jeton que Cloudflare rejette", async () => {
    mockSiteverify({ success: false, "error-codes": ["invalid-input-response"] });
    expect(await verifyTurnstile("jeton", "cle", opts())).toBe("refuse");
  });

  it("refuse un jeton déjà consommé", async () => {
    mockSiteverify({ success: false, "error-codes": ["timeout-or-duplicate"] });
    expect(await verifyTurnstile("jeton", "cle", opts())).toBe("refuse");
  });

  it("signale la clé invalide sans punir la visiteuse", async () => {
    mockSiteverify({ success: false, "error-codes": ["invalid-input-secret"] });
    expect(await verifyTurnstile("jeton", "mauvaise-cle", opts())).toBe("non-configure");
  });

  it("signale l'absence de clé sans appeler Cloudflare", async () => {
    const calls = mockSiteverify({ success: true });
    expect(await verifyTurnstile("jeton", "", opts())).toBe("non-configure");
    expect(calls).toHaveLength(0);
  });

  it("refuse un jeton du formulaire de contact rejoué sur la connexion admin", async () => {
    mockSiteverify({ success: true, action: "contact", hostname: "ddmwigs.com" });
    const request = req("https://ddmwigs.com/admin/connexion");
    expect(await verifyTurnstile("jeton", "cle", opts("admin-connexion", request))).toBe("refuse");
  });

  it("refuse un jeton résolu sur un domaine tiers", async () => {
    mockSiteverify({ success: true, action: "contact", hostname: "pirate.example" });
    expect(await verifyTurnstile("jeton", "cle", opts())).toBe("refuse");
  });

  it("accepte sur un déploiement preview, le domaine attendu suivant le Host", async () => {
    mockSiteverify({ success: true, action: "contact", hostname: "abc.ddm-wigs.pages.dev" });
    const request = req("https://abc.ddm-wigs.pages.dev/contact");
    expect(await verifyTurnstile("jeton", "cle", opts("contact", request))).toBe("ok");
  });

  it("ne bloque pas si Cloudflare omet action et hostname", async () => {
    mockSiteverify({ success: true });
    expect(await verifyTurnstile("jeton", "cle", opts())).toBe("ok");
  });

  it("transmet l'IP du visiteur quand elle est connue", async () => {
    const calls = mockSiteverify({ success: true });
    await verifyTurnstile("jeton", "cle", opts("contact", req("https://ddmwigs.com/contact", "9.9.9.9")));
    expect(calls[0].get("remoteip")).toBe("9.9.9.9");
    expect(calls[0].get("response")).toBe("jeton");
  });

  it("ne bloque pas la visiteuse si Cloudflare est injoignable", async () => {
    vi.stubGlobal("fetch", async () => { throw new Error("réseau indisponible"); });
    expect(await verifyTurnstile("jeton", "cle", opts())).toBe("non-configure");
  });
});
