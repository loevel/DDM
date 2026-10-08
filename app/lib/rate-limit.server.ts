import type { AppLoadContext } from "@remix-run/cloudflare";

/**
 * KV refuse un `expirationTtl` inférieur à 60 secondes.
 * Aucune de nos fenêtres n'est si courte, mais le plancher évite qu'un appel
 * en toute fin de fenêtre parte avec un TTL refusé.
 */
const TTL_MINIMUM = 60;

/**
 * Valeur stockée : `compte:débutDeFenêtre`, le début étant un horodatage Unix
 * en secondes.
 *
 * Le début est conservé explicitement parce que **le TTL de KV ne peut pas
 * porter la fenêtre à lui seul** : `put` réarme l'expiration à chaque
 * écriture, et KV ne conserve pas le TTL précédent lors d'un écrasement. Un
 * compteur réécrit à chaque requête voyait donc son expiration repoussée
 * indéfiniment — une IP qui restait active ne retrouvait jamais son quota, au
 * lieu de le retrouver après la fenêtre annoncée.
 *
 * En gardant le début, c'est ce code qui fait foi sur la fenêtre, et non
 * l'expiration de KV. Le TTL n'est plus qu'un ramasse-miettes : une lecture
 * périmée (KV est à cohérence éventuelle) ou une clé effacée en retard ne
 * fausse plus le calcul.
 */
function lireCompteur(brut: string | null, maintenant: number) {
  if (!brut) return { compte: 0, debut: maintenant };

  const [champCompte, champDebut] = brut.split(":");
  const compte = parseInt(champCompte, 10) || 0;
  const debut = parseInt(champDebut ?? "", 10);

  // Ancien format (un simple nombre, sans début de fenêtre) : on ouvre une
  // fenêtre à partir de maintenant en gardant le compte déjà consommé. Les
  // clés encore en vol au déploiement s'éteignent ainsi d'elles-mêmes, sans
  // offrir de quota neuf à qui martèle au même instant.
  return { compte, debut: Number.isFinite(debut) ? debut : maintenant };
}

/**
 * Rate limiter générique par IP (KV) pour les endpoints publics.
 * Retourne true si la requête est autorisée, false si la limite est atteinte.
 *
 * Fenêtre fixe : `max` requêtes par tranche de `windowSeconds`, la tranche
 * commençant à la première requête et expirant même si l'IP reste active.
 */
export async function checkRateLimit(
  context: AppLoadContext,
  request: Request,
  opts: { name: string; max: number; windowSeconds: number }
): Promise<boolean> {
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const key = `rl:${opts.name}:${ip}`;
  const cache = context.cloudflare.env.CACHE;
  const maintenant = Math.floor(Date.now() / 1000);

  const precedent = lireCompteur(await cache.get(key), maintenant);

  // Fenêtre révolue : on en ouvre une neuve sans attendre que KV ait
  // réellement effacé la clé.
  const revolue = maintenant - precedent.debut >= opts.windowSeconds;
  const compte = revolue ? 0 : precedent.compte;
  const debut = revolue ? maintenant : precedent.debut;

  if (compte >= opts.max) return false;

  // Ce qu'il reste à courir, borné : jamais plus que la fenêtre (une horloge
  // qui recule ne doit pas prolonger la clé), jamais moins que le plancher KV.
  const reste = Math.min(opts.windowSeconds, opts.windowSeconds - (maintenant - debut));
  await cache.put(key, `${compte + 1}:${debut}`, {
    expirationTtl: Math.max(TTL_MINIMUM, reste),
  });
  return true;
}
