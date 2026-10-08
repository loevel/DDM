const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Codes qui désignent notre configuration, jamais le visiteur. */
const ERREURS_DE_CONFIG = new Set(["invalid-input-secret", "missing-input-secret"]);

type SiteverifyResponse = {
  success: boolean;
  action?: string;
  hostname?: string;
  "error-codes"?: string[];
};

/**
 * `refuse` : le visiteur n'a pas passé le défi, ou son jeton ne correspond pas.
 * `non-configure` : la clé secrète est absente ou invalide — notre faute.
 */
export type TurnstileVerdict = "ok" | "refuse" | "non-configure";

export type TurnstileOptions = {
  /** Doit correspondre au `data-action` du widget qui a produit le jeton. */
  action: string;
  /** Sert à transmettre l'IP du visiteur et à connaître le domaine attendu. */
  request?: Request;
};

/**
 * Vérifie un jeton Turnstile auprès de Cloudflare.
 *
 * Trois contrôles, pas un seul. `success` dit que le défi a été résolu, mais
 * ni pour quel formulaire, ni sur quel domaine :
 *
 * - sans `action`, un jeton obtenu sur le formulaire de contact — public et
 *   sans authentification — serait rejouable contre la connexion admin ;
 * - sans `hostname`, un jeton résolu sur une page tierce qui embarque notre
 *   clé publique (elle est dans wrangler.toml, donc lisible par tous)
 *   passerait tout autant.
 *
 * Les deux contrôles ne s'appliquent que si Cloudflare renvoie le champ : une
 * réponse amputée ne doit pas bloquer une visiteuse légitime.
 *
 * Une clé secrète absente ou erronée renvoie `non-configure` plutôt que
 * `refuse` : sans cette distinction, une simple faute de copie refuserait
 * toutes les soumissions *et* interdirait la connexion à l'administration,
 * c'est-à-dire l'écran même où l'on corrige le problème.
 */
export async function verifyTurnstile(
  token: string | null,
  secret: string,
  options: TurnstileOptions
): Promise<TurnstileVerdict> {
  if (!secret) return "non-configure";

  // Inutile d'interroger Cloudflare sans jeton : siteverify valide `response`
  // avant `secret` et répond `missing-input-response` seul, même quand la clé
  // est fausse. L'appel n'apprendrait donc rien sur la configuration.
  if (!token) return "refuse";

  const body = new URLSearchParams({ secret, response: token });
  const ip = options.request?.headers.get("CF-Connecting-IP");
  if (ip) body.set("remoteip", ip);

  try {
    const res = await fetch(SITEVERIFY, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = (await res.json()) as SiteverifyResponse;

    if (data.success !== true) {
      const codes = data["error-codes"] ?? [];
      if (codes.some(c => ERREURS_DE_CONFIG.has(c))) {
        console.error(
          `[Turnstile] CLÉ SECRÈTE INVALIDE (${codes.join(", ")}) — le captcha ne protège rien. ` +
            `Corriger TURNSTILE_SECRET sur le projet Pages.`
        );
        return "non-configure";
      }
      console.error("[Turnstile] refus :", codes.join(", ") || "cause inconnue");
      return "refuse";
    }

    if (data.action && data.action !== options.action) {
      console.error(`[Turnstile] action inattendue : ${data.action} au lieu de ${options.action}`);
      return "refuse";
    }

    // Comparaison au Host courant plutôt qu'à une liste figée : les
    // déploiements preview (*.pages.dev) restent couverts sans maintenance.
    const attendu = options.request ? new URL(options.request.url).hostname : null;
    if (attendu && data.hostname && data.hostname !== attendu) {
      console.error(`[Turnstile] domaine inattendu : ${data.hostname} au lieu de ${attendu}`);
      return "refuse";
    }

    return "ok";
  } catch {
    // Cloudflare injoignable : on ne punit pas la visiteuse pour une panne
    // réseau, les autres garde-fous (limite par IP, champ piège) restent.
    console.error("[Turnstile] siteverify injoignable");
    return "non-configure";
  }
}
