import { json } from "@remix-run/cloudflare";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { getCustomerId } from "~/lib/session.server";
import { cfImage } from "~/lib/images";

export const meta: MetaFunction = () => [{ title: "Mon profil perruque — DDM Wigs & More" }];

export async function loader({ request, context }: LoaderFunctionArgs) {
  const customerId = (await getCustomerId(request, context))!;
  const db = context.cloudflare.env.DB;

  const customer = await db.prepare(
    "SELECT quiz_result, quiz_completed_at, texture_preferee, budget_habituel FROM customers WHERE id = ?"
  ).bind(customerId).first() as any;

  let quizData = null;
  if (customer?.quiz_result) {
    try { quizData = JSON.parse(customer.quiz_result); } catch {}
  }

  // Produits recommandés selon les préférences sauvegardées
  let recommended: any[] = [];
  if (quizData) {
    const texture = quizData.texture;
    const budget = quizData.budget;
    const facilite = quizData.facilite;
    const experience = quizData.experience;

    let where = ["p.stock > 0"];
    const binds: any[] = [];

    if (texture === "lisse") where.push("p.texture IN ('lisse')");
    else if (texture === "ondule") where.push("p.texture IN ('body-wave','water-wave','loose-wave')");
    else if (texture === "boucle") where.push("p.texture IN ('boucle','kinky-curly','deep-wave')");

    if (budget === "budget1") where.push("p.price_cad <= 400");
    else if (budget === "budget2") where.push("p.price_cad > 400 AND p.price_cad <= 600");
    else if (budget === "budget3") where.push("p.price_cad > 600");

    if (facilite === "simple" || experience === "premiere") {
      where.push("(p.glueless = 1 OR p.pret_a_porter = 1)");
    }

    try {
      const { results } = await db.prepare(
        `SELECT * FROM products p WHERE ${where.join(" AND ")} ORDER BY p.featured DESC LIMIT 6`
      ).bind(...binds).all();
      recommended = results ?? [];

      if (recommended.length < 3) {
        const { results: fallback } = await db.prepare(
          "SELECT * FROM products WHERE stock > 0 ORDER BY featured DESC LIMIT 6"
        ).all();
        recommended = fallback ?? [];
      }
    } catch {}
  }

  return json({ quizData, quizCompletedAt: customer?.quiz_completed_at, recommended });
}

const OPTION_LABELS: Record<string, Record<string, string>> = {
  experience: { premiere: "Première fois", parfois: "J'en porte parfois", habituee: "Je suis habituée" },
  occasion:   { quotidien: "Tous les jours", travail: "Travail / Pro", soiree: "Soirée / Événement", changement: "Changement de look" },
  texture:    { lisse: "Lisse & soyeux", ondule: "Ondulé naturel", boucle: "Bouclé & volume" },
  budget:     { budget1: "Moins de 400 $", budget2: "400 $ – 600 $", budget3: "600 $ et plus" },
  facilite:   { simple: "Le plus simple possible", apprendre: "Prête à apprendre", peu_importe: "Peu importe" },
};

const STEP_LABELS: Record<string, string> = {
  experience: "Expérience", occasion: "Occasion", texture: "Texture", budget: "Budget", facilite: "Facilité de pose",
};

export default function CompteQuiz() {
  const { quizData, quizCompletedAt, recommended } = useLoaderData<typeof loader>();
  const recs = recommended as any[];

  if (!quizData) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface mb-1">Mon profil perruque</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">Vos recommandations personnalisées</p>
        </div>
        <div className="bg-surface border border-outline-variant/30 px-6 py-16 text-center">
          <span className="material-symbols-outlined text-6xl text-outline-variant mb-4 block">auto_awesome</span>
          <h2 className="font-serif text-xl text-on-surface mb-3">Vous n'avez pas encore fait le quiz</h2>
          <p className="text-sm text-on-surface-variant max-w-sm mx-auto mb-8">
            Répondez à 5 questions et on vous propose les perruques parfaites pour votre style, budget et niveau.
          </p>
          <Link to="/quiz"
            className="inline-flex items-center gap-2 bg-primary text-on-primary px-8 py-4 text-sm font-bold uppercase tracking-widest hover:opacity-90 transition-opacity">
            <span className="material-symbols-outlined text-lg">auto_awesome</span>
            Faire le quiz maintenant
          </Link>
          <p className="text-on-surface-variant/50 text-xs mt-3">2 minutes · Gratuit</p>
        </div>
      </div>
    );
  }

  const completedDate = quizCompletedAt
    ? new Date(quizCompletedAt).toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" })
    : null;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface mb-1">Mon profil perruque</h1>
          {completedDate && (
            <p className="text-xs text-on-surface-variant">Quiz complété le {completedDate}</p>
          )}
        </div>
        <Link to="/quiz"
          className="flex items-center gap-2 border border-outline-variant px-4 py-2 text-sm font-semibold text-on-surface-variant hover:text-primary hover:border-primary transition-colors">
          <span className="material-symbols-outlined text-base">refresh</span>
          Refaire le quiz
        </Link>
      </div>

      {/* Résumé des réponses */}
      <div className="bg-surface border border-outline-variant/30 overflow-hidden">
        <div className="px-6 py-4 bg-on-surface flex items-center gap-3">
          <span className="material-symbols-outlined text-primary-fixed text-xl">auto_awesome</span>
          <h2 className="font-semibold text-white">Vos préférences</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-outline-variant/10">
          {Object.entries(quizData).map(([key, value]) => {
            if (!STEP_LABELS[key]) return null;
            const label = OPTION_LABELS[key]?.[value as string] ?? String(value);
            return (
              <div key={key} className="bg-surface px-5 py-4">
                <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">
                  {STEP_LABELS[key]}
                </p>
                <p className="font-semibold text-on-surface text-sm">{label}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Produits recommandés */}
      {recs.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-base text-primary">recommend</span>
              Recommandées pour vous
            </h2>
            <Link to="/boutique" className="text-xs text-primary hover:underline">Voir tout →</Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {recs.map(p => (
              <Link key={p.id} to={`/boutique/${p.slug}`}
                className="group bg-surface border border-outline-variant/30 hover:border-primary transition-colors overflow-hidden">
                <div className="aspect-[4/5] overflow-hidden bg-surface-container">
                  {p.image_key ? (
                    <img src={cfImage(p.image_key, "card") ?? p.image_key} alt={p.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="material-symbols-outlined text-3xl text-outline-variant">styler</span>
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <p className="text-xs text-on-surface-variant truncate mb-0.5">{p.name}</p>
                  <p className="font-bold text-primary text-sm">{Number(p.price_cad).toFixed(2)} $</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
