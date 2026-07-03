/**
 * Configuration automatique des règles de sécurité Cloudflare pour ddmwigs.com
 *
 * Usage :
 *   CLOUDFLARE_API_TOKEN=<token> node scripts/setup-cloudflare-security.mjs
 *
 * Le token doit avoir les permissions :
 *   - Zone > Firewall Services > Edit
 *   - Zone > Zone > Read
 *
 * Créer un token sur : https://dash.cloudflare.com/profile/api-tokens
 * Template : "Edit zone DNS" puis ajouter "Zone > Firewall Services > Edit"
 */

const ACCOUNT_ID = "d58014fa11833876c245e4828ab1cc8a";
const ZONE_NAME  = "ddmwigs.com";
const ZONE_ID    = "805ba89c7d5b00f9eef56e53b358b2fc"; // ddmwigs.com
const TOKEN      = process.env.CLOUDFLARE_API_TOKEN;

if (!TOKEN) {
  console.error("❌ CLOUDFLARE_API_TOKEN manquant. Usage : CLOUDFLARE_API_TOKEN=xxx node scripts/setup-cloudflare-security.mjs");
  process.exit(1);
}

const headers = {
  "Authorization": `Bearer ${TOKEN}`,
  "Content-Type": "application/json",
};

async function cf(path, options = {}) {
  const url = `https://api.cloudflare.com/client/v4${path}`;
  const res = await fetch(url, { ...options, headers: { ...headers, ...(options.headers ?? {}) } });
  const data = await res.json();
  if (!data.success) {
    throw new Error(`CF API error on ${path}: ${JSON.stringify(data.errors)}`);
  }
  return data;
}

console.log(`✅ Zone : ${ZONE_NAME} (${ZONE_ID})`);

// ── 2. Lister les règles WAF existantes ────────────────────────────────────
const existing = await cf(`/zones/${ZONE_ID}/firewall/rules`);
const existingDescriptions = existing.result?.map(r => r.description) ?? [];
console.log(`ℹ️  Règles WAF existantes : ${existingDescriptions.length}`);

// ── 3. Règle WAF : Managed Challenge sur /admin ────────────────────────────
const adminRuleDesc = "DDM Admin - Managed Challenge";
if (existingDescriptions.includes(adminRuleDesc)) {
  console.log(`⏭️  Règle "${adminRuleDesc}" déjà en place, skip.`);
} else {
  // Créer le filtre d'abord
  const filterRes = await cf(`/zones/${ZONE_ID}/filters`, {
    method: "POST",
    body: JSON.stringify([{
      expression: `(http.request.uri.path contains "/admin")`,
      description: "DDM Admin paths",
    }]),
  });
  const filterId = filterRes.result?.[0]?.id;
  if (!filterId) throw new Error("Filtre non créé");

  // Créer la règle firewall
  await cf(`/zones/${ZONE_ID}/firewall/rules`, {
    method: "POST",
    body: JSON.stringify([{
      filter: { id: filterId },
      action: "managed_challenge",
      description: adminRuleDesc,
      priority: 1,
    }]),
  });
  console.log(`✅ Règle WAF "${adminRuleDesc}" créée.`);
}

// ── 4. Rate limiting : /admin/connexion (max 5 req / 60s) ──────────────────
console.log("🔍 Vérification des règles de rate limiting…");
const rlExisting = await cf(`/zones/${ZONE_ID}/rate_limits`);
const rlDescs = rlExisting.result?.map(r => r.description) ?? [];
const rlDesc = "DDM Admin Login - Rate Limit 5/60s";

if (rlDescs.includes(rlDesc)) {
  console.log(`⏭️  Rate limit "${rlDesc}" déjà en place, skip.`);
} else {
  await cf(`/zones/${ZONE_ID}/rate_limits`, {
    method: "POST",
    body: JSON.stringify({
      description: rlDesc,
      match: {
        request: { url_pattern: `*ddmwigs.com/admin/connexion*`, methods: ["POST"] },
        response: { statuses: [] },
      },
      threshold: 5,
      period: 60,
      action: {
        mode: "ban",
        timeout: 600,
        response: {
          content_type: "text/html",
          body: "<html><body><h1>Trop de tentatives. Réessayez dans 10 minutes.</h1></body></html>",
        },
      },
      enabled: true,
    }),
  });
  console.log(`✅ Rate limit "${rlDesc}" créé.`);
}

console.log("\n🎉 Configuration Cloudflare terminée !");
console.log("   WAF : Managed Challenge sur toutes les routes /admin");
console.log("   Rate Limit : 5 tentatives / 60s sur /admin/connexion");
