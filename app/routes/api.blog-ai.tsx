import { json, type ActionFunctionArgs } from "@remix-run/cloudflare";
import { requireAdmin } from "~/lib/admin-session.server";
import {
  AiUnavailable, aiDraft, aiRewrite, aiSeo, aiIdeas, aiAltText, aiLinkProducts,
  type RewriteMode,
} from "~/lib/ai.server";

/**
 * Point d'entrée unique de l'assistant de rédaction. Toutes les fonctions IA de
 * /admin/blog passent par ici : l'éditeur reste une page normale et les appels
 * modèle, lents, se font en `fetch` sans recharger le brouillon en cours.
 *
 * Réservé aux admins connectés — le binding AI est facturé à l'usage.
 */
export async function action({ request, context }: ActionFunctionArgs) {
  await requireAdmin(request, context);

  const env = context.cloudflare.env;
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const g = (k: string) => String(form.get(k) ?? "").trim();

  try {
    switch (intent) {
      case "draft":
        if (!g("sujet")) return json({ error: "Indiquez un sujet." }, { status: 400 });
        return json({ body: await aiDraft(env.AI, g("sujet"), g("angle") || undefined) });

      case "rewrite": {
        const texte = g("texte");
        if (!texte) return json({ error: "Sélectionnez d'abord du texte." }, { status: 400 });
        const mode = g("mode") as RewriteMode;
        if (!["court", "clair", "chaleureux", "pro", "continuer"].includes(mode)) {
          return json({ error: "Mode de réécriture inconnu." }, { status: 400 });
        }
        return json({ texte: await aiRewrite(env.AI, texte, mode) });
      }

      case "seo": {
        if (!g("body")) return json({ error: "Écrivez l'article avant de générer le SEO." }, { status: 400 });
        return json({ seo: await aiSeo(env.AI, g("title"), g("body")) });
      }

      case "ideas": {
        // Le modèle a besoin du vrai catalogue et des vraies questions clientes,
        // sinon il propose des sujets génériques sans rapport avec la boutique.
        const db = env.DB;
        const safe = async <T,>(sql: string): Promise<T[]> => {
          try { return ((await db.prepare(sql).all<T>()).results ?? []) as T[]; } catch { return []; }
        };
        const produits = await safe<{ name: string }>(
          "SELECT name FROM products WHERE stock > 0 ORDER BY featured DESC LIMIT 30"
        );
        const questions = await safe<{ question: string }>(
          "SELECT question FROM product_questions ORDER BY id DESC LIMIT 20"
        );
        const traites = await safe<{ title: string }>("SELECT title FROM blog_posts LIMIT 50");
        return json({
          ideas: await aiIdeas(env.AI, {
            produits: produits.map(p => p.name),
            questions: questions.map(q => q.question),
            dejaTraites: traites.map(t => t.title),
          }),
        });
      }

      case "alt": {
        const file = form.get("file");
        if (!(file instanceof File)) return json({ error: "Aucune image reçue." }, { status: 400 });
        if (file.size > 6 * 1024 * 1024) {
          return json({ error: "Image trop lourde pour l'analyse (6 Mo max)." }, { status: 400 });
        }
        return json({ alt: await aiAltText(env.AI, await file.arrayBuffer(), g("contexte")) });
      }

      case "link_products": {
        if (!g("body")) return json({ error: "Écrivez l'article d'abord." }, { status: 400 });
        let produits: { id: number; name: string; texture: string | null }[] = [];
        try {
          produits = ((await env.DB
            .prepare("SELECT id, name, texture FROM products WHERE stock > 0 LIMIT 60")
            .all<{ id: number; name: string; texture: string | null }>()).results ?? []);
        } catch { /* table absente */ }
        if (!produits.length) return json({ ids: [] });
        return json({ ids: await aiLinkProducts(env.AI, g("body"), produits) });
      }

      default:
        return json({ error: "Action inconnue." }, { status: 400 });
    }
  } catch (e) {
    if (e instanceof AiUnavailable) return json({ error: e.message }, { status: 503 });
    throw e;
  }
}
