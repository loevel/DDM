import { json } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { Link, useFetcher } from "@remix-run/react";
import { useState } from "react";
import { getDB } from "~/lib/db.server";
import type { Product } from "~/lib/db.server";
import { getCustomerId } from "~/lib/session.server";
import { cfImage } from "~/lib/images";

export const meta: MetaFunction = () => [
  { title: "Trouve ta perruque idéale — DDM Wigs & More" },
  { name: "description", content: "Réponds à 5 questions et découvre les perruques parfaites pour toi." },
];

// ─── Action (filtre les produits selon les réponses) ────────────────────────

export async function action({ request, context }: ActionFunctionArgs) {
  const form = await request.formData();
  const experience = form.get("experience") as string;
  const texture    = form.get("texture") as string;
  const budget     = form.get("budget") as string;
  const facilite   = form.get("facilite") as string;

  const db = getDB(context as any);

  // Sauvegarder le résultat si la cliente est connectée
  try {
    const customerId = await getCustomerId(request, context as any);
    if (customerId) {
      const answers = { experience, texture, budget, facilite,
        occasion: form.get("occasion") as string };
      await (context as any).cloudflare.env.DB
        .prepare("UPDATE customers SET quiz_result = ?, quiz_completed_at = datetime('now'), texture_preferee = ?, budget_habituel = ? WHERE id = ?")
        .bind(JSON.stringify(answers), texture || null, budget || null, customerId)
        .run();
    }
  } catch { /* silencieux si non connectée */ }

  let where: string[] = ["p.stock > 0"];
  const binds: any[] = [];

  // Texture
  if (texture === "lisse") {
    where.push("p.texture IN ('lisse')");
  } else if (texture === "ondule") {
    where.push("p.texture IN ('body-wave','water-wave','loose-wave')");
  } else if (texture === "boucle") {
    where.push("p.texture IN ('boucle','kinky-curly','deep-wave')");
  }

  // Budget
  if (budget === "budget1") {
    where.push("p.price_cad <= 400");
  } else if (budget === "budget2") {
    where.push("p.price_cad > 400 AND p.price_cad <= 600");
  } else if (budget === "budget3") {
    where.push("p.price_cad > 600");
  }

  // Facilité de pose
  if (facilite === "simple" || experience === "premiere") {
    where.push("(p.glueless = 1 OR p.pret_a_porter = 1)");
  }

  const sql = `SELECT * FROM products p WHERE ${where.join(" AND ")} ORDER BY p.featured DESC, p.price_cad ASC LIMIT 6`;

  try {
    const { results } = await db.prepare(sql).bind(...binds).all<Product>();
    let products = results ?? [];

    // Si trop peu de résultats, on élargit sans le filtre texture
    if (products.length < 2) {
      const whereFallback = where.filter(w => !w.includes("texture"));
      const { results: fallback } = await db.prepare(
        `SELECT * FROM products p WHERE ${whereFallback.join(" AND ")} ORDER BY p.featured DESC, p.price_cad ASC LIMIT 6`
      ).all<Product>();
      products = fallback ?? [];
    }

    return json({ products, ok: true });
  } catch {
    return json({ products: [], ok: true });
  }
}

// ─── Quiz steps ─────────────────────────────────────────────────────────────

const STEPS = [
  {
    id: "experience",
    question: "C'est ta première perruque ?",
    subtitle: "Dis-nous où tu en es pour mieux te guider.",
    options: [
      { value: "premiere",  icon: "sentiment_satisfied", label: "Première fois",      desc: "Je découvre les perruques" },
      { value: "parfois",   icon: "face_retouching_natural", label: "J'en porte parfois", desc: "J'ai déjà quelques expériences" },
      { value: "habituee",  icon: "workspace_premium", label: "Je suis habituée",    desc: "Je connais bien mes préférences" },
    ],
  },
  {
    id: "occasion",
    question: "Pour quelle occasion ?",
    subtitle: "Ça nous aide à trouver le style parfait.",
    options: [
      { value: "quotidien", icon: "wb_sunny",       label: "Tous les jours",        desc: "Confort et naturel avant tout" },
      { value: "travail",   icon: "work",           label: "Travail / Pro",          desc: "Look soigné et discret" },
      { value: "soiree",    icon: "celebration",    label: "Soirée / Événement",     desc: "Je veux briller" },
      { value: "changement",icon: "auto_awesome",   label: "Changement de look",     desc: "J'envie quelque chose de nouveau" },
    ],
  },
  {
    id: "texture",
    question: "Quelle texture te fait envie ?",
    subtitle: "Choisis ce qui correspond à ton style naturel.",
    options: [
      { value: "lisse",  icon: "straighten",    label: "Lisse & soyeux",     desc: "Straight, élégant, facile à coiffer" },
      { value: "ondule", icon: "waves",         label: "Ondulé naturel",      desc: "Body wave, water wave, loose wave" },
      { value: "boucle", icon: "grain",         label: "Bouclé & volume",     desc: "Bouclé, kinky curly, deep wave" },
    ],
  },
  {
    id: "budget",
    question: "Quel est ton budget ?",
    subtitle: "Nous avons des options pour chaque budget.",
    options: [
      { value: "budget1", icon: "savings",       label: "Moins de 400 $",     desc: "Qualité premium accessible" },
      { value: "budget2", icon: "account_balance_wallet", label: "400 $ – 600 $", desc: "Le meilleur rapport qualité/prix" },
      { value: "budget3", icon: "diamond",       label: "600 $ et plus",      desc: "Le summum de la qualité" },
    ],
  },
  {
    id: "facilite",
    question: "Tu veux quelque chose de facile à poser ?",
    subtitle: "On s'adapte à ton niveau de confort.",
    options: [
      { value: "simple",      icon: "bolt",          label: "Le plus simple possible", desc: "Prête à porter ou sans colle" },
      { value: "apprendre",   icon: "school",        label: "Je suis prête à apprendre", desc: "Avec un peu de pratique, ça ira" },
      { value: "peu_importe", icon: "tune",          label: "Peu importe",              desc: "Je suis à l'aise avec tout" },
    ],
  },
];

type Answers = Record<string, string>;

function generateTitle(answers: Answers): string {
  const parts: string[] = [];
  if (answers.texture === "lisse") parts.push("lisse & élégante");
  else if (answers.texture === "ondule") parts.push("ondulée & naturelle");
  else if (answers.texture === "boucle") parts.push("bouclée & volumineuse");
  if (answers.facilite === "simple" || answers.experience === "premiere") parts.push("facile à poser");
  if (answers.occasion === "soiree") parts.push("pour briller");
  else if (answers.occasion === "quotidien") parts.push("pour tous les jours");
  return parts.length > 0 ? parts.join(", ") : "sélectionnée pour toi";
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function Quiz() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [done, setDone] = useState(false);
  const fetcher = useFetcher<{ products: Product[] }>();

  function choose(value: string) {
    const current = STEPS[step];
    const next = { ...answers, [current.id]: value };
    setAnswers(next);

    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      // Dernier step — soumettre
      setDone(true);
      const fd = new FormData();
      Object.entries(next).forEach(([k, v]) => fd.append(k, v));
      fetcher.submit(fd, { method: "post" });
    }
  }

  function reset() {
    setStep(0);
    setAnswers({});
    setDone(false);
  }

  const current = STEPS[step];
  const progress = ((step) / STEPS.length) * 100;

  // ── Résultats ──
  if (done) {
    const products = fetcher.data?.products ?? [];
    const loading = fetcher.state !== "idle";
    const title = generateTitle(answers);

    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-site mx-auto px-6 md:px-10 lg:px-20 py-16">
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-2 bg-primary/10 text-primary text-xs font-bold px-3 py-1.5 uppercase tracking-widest mb-4">
              <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
              Tes résultats
            </span>
            <h1 className="font-serif text-3xl md:text-4xl text-on-surface mt-2 mb-3">
              Pour toi : <span className="text-primary italic">{title}</span>
            </h1>
            <p className="font-sans text-sm text-on-surface-variant max-w-lg mx-auto">
              Basé sur tes réponses, voici les perruques qui te correspondent le mieux.
            </p>
          </div>

          {loading ? (
            <div className="flex flex-col items-center gap-4 py-16">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent animate-spin" />
              <p className="text-sm text-on-surface-variant">Recherche en cours…</p>
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-16">
              <span className="material-symbols-outlined text-5xl text-outline-variant mb-4 block">search_off</span>
              <p className="font-sans text-lg font-semibold text-on-surface mb-2">Aucun produit trouvé</p>
              <p className="font-sans text-sm text-on-surface-variant mb-6">Essaie d'ajuster tes critères ou explore toute la boutique.</p>
              <div className="flex gap-3 justify-center">
                <button onClick={reset}
                  className="px-5 py-2.5 border border-outline-variant text-sm font-semibold text-on-surface-variant hover:text-primary transition-colors">
                  Refaire le quiz
                </button>
                <Link to="/boutique"
                  className="px-5 py-2.5 bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition-opacity">
                  Voir la boutique
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-10 mb-12">
                {products.map(p => (
                  <Link key={p.id} to={`/boutique/${p.slug}`} className="group block">
                    <div className="aspect-[4/5] overflow-hidden bg-surface-container mb-3 relative">
                      {p.image_key ? (
                        <img alt={p.name} src={cfImage(p.image_key, "card") ?? p.image_key}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="material-symbols-outlined text-4xl text-outline-variant">styler</span>
                        </div>
                      )}
                      {p.featured === 1 && (
                        <span className="absolute top-2 left-2 bg-primary text-on-primary text-[10px] font-bold px-2 py-0.5">Vedette</span>
                      )}
                    </div>
                    <h3 className="font-serif text-base text-on-surface group-hover:text-primary transition-colors leading-snug mb-1">{p.name}</h3>
                    <p className="font-sans text-sm font-bold text-primary">{Number(p.price_cad).toFixed(2)} $ CAD</p>
                  </Link>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button onClick={reset}
                  className="px-6 py-3 border border-outline-variant text-sm font-semibold text-on-surface-variant hover:text-primary transition-colors uppercase tracking-wider">
                  Refaire le quiz
                </button>
                <Link to="/boutique"
                  className="px-6 py-3 bg-primary text-on-primary text-sm font-semibold hover:opacity-90 transition-opacity uppercase tracking-wider text-center">
                  Voir toute la boutique
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Quiz ──
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b border-outline-variant bg-surface">
        <div className="max-w-2xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between mb-4">
            <p className="font-sans text-xs font-bold text-on-surface-variant uppercase tracking-widest">
              Étape {step + 1} sur {STEPS.length}
            </p>
            <button onClick={reset} className="text-xs text-on-surface-variant hover:text-primary transition-colors">
              Recommencer
            </button>
          </div>
          {/* Barre de progression */}
          <div className="h-0.5 bg-surface-container-high overflow-hidden">
            <div className="h-full bg-primary transition-all duration-500"
              style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      {/* Question */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-10">
            <h1 className="font-serif text-2xl md:text-3xl text-on-surface mb-2">{current.question}</h1>
            <p className="font-sans text-sm text-on-surface-variant">{current.subtitle}</p>
          </div>

          <div className={`grid gap-3 ${current.options.length === 4 ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-3"}`}>
            {current.options.map(opt => (
              <button
                key={opt.value}
                onClick={() => choose(opt.value)}
                className="group text-left border-2 border-outline-variant bg-surface hover:border-primary hover:bg-primary/5 transition-all duration-200 p-5"
              >
                <span className="material-symbols-outlined text-3xl text-on-surface-variant group-hover:text-primary transition-colors mb-3 block"
                  style={{ fontVariationSettings: "'FILL' 1" }}>
                  {opt.icon}
                </span>
                <p className="font-sans font-bold text-sm text-on-surface group-hover:text-primary transition-colors mb-1">{opt.label}</p>
                <p className="font-sans text-xs text-on-surface-variant leading-snug">{opt.desc}</p>
              </button>
            ))}
          </div>

          {step > 0 && (
            <div className="flex justify-center mt-8">
              <button onClick={() => setStep(step - 1)}
                className="flex items-center gap-1.5 text-xs text-on-surface-variant hover:text-primary transition-colors">
                <span className="material-symbols-outlined text-sm">arrow_back</span>
                Question précédente
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
