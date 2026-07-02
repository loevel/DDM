// Taxes de vente canadiennes — règle du lieu de fourniture pour les biens expédiés :
// la taxe applicable est celle de la province de livraison.
// TVH (taxe harmonisée) : ON, NS, NB, NL, PE. TPS + TVQ : QC. TPS seule : ailleurs.

export type TaxBreakdown = {
  tps: number;   // TPS ou TVH selon la province
  tvq: number;   // TVQ (Québec seulement)
  tpsLabel: string;
  tvqLabel: string | null;
};

const HST_RATES: Record<string, number> = {
  ON: 0.13,
  NS: 0.15,
  NB: 0.15,
  NL: 0.15,
  PE: 0.15,
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeTaxes(taxableCad: number, province: string): TaxBreakdown {
  const prov = (province || "QC").toUpperCase();

  if (prov === "QC") {
    return {
      tps: round2(taxableCad * 0.05),
      tvq: round2(taxableCad * 0.09975),
      tpsLabel: "TPS (5 %)",
      tvqLabel: "TVQ (9,975 %)",
    };
  }

  const hst = HST_RATES[prov];
  if (hst) {
    return {
      tps: round2(taxableCad * hst),
      tvq: 0,
      tpsLabel: `TVH (${Math.round(hst * 100)} %)`,
      tvqLabel: null,
    };
  }

  return {
    tps: round2(taxableCad * 0.05),
    tvq: 0,
    tpsLabel: "TPS (5 %)",
    tvqLabel: null,
  };
}

export async function getTaxSettings(db: D1Database): Promise<{
  enabled: boolean;
  tpsNumber: string;
  tvqNumber: string;
}> {
  try {
    const { results } = await db
      .prepare("SELECT key, value FROM site_settings WHERE key IN ('taxes_enabled','tps_number','tvq_number')")
      .all<{ key: string; value: string }>();
    const map: Record<string, string> = {};
    for (const r of results ?? []) map[r.key] = r.value;
    return {
      enabled: map.taxes_enabled === "1",
      tpsNumber: map.tps_number ?? "",
      tvqNumber: map.tvq_number ?? "",
    };
  } catch {
    return { enabled: false, tpsNumber: "", tvqNumber: "" };
  }
}
