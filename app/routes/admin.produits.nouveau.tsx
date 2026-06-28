import { redirect } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, MetaFunction } from "@remix-run/react";
import { Form, Link, useActionData, useNavigation } from "@remix-run/react";

export const meta: MetaFunction = () => [{ title: "Nouveau produit — Admin DDM" }];

export async function action({ request, context }: ActionFunctionArgs) {
  const f = await request.formData();
  const g = (k: string) => String(f.get(k) ?? "").trim();
  const n = (k: string) => { const v = g(k); return v ? Number(v) : null; };
  const b = (k: string) => f.get(k) === "1" ? 1 : 0;

  const slug = g("slug") || g("name").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

  if (!g("name") || !g("price_cad") || !g("famille") || !slug) {
    return { error: "Nom, prix, famille et slug sont requis." };
  }

  try {
    await context.cloudflare.env.DB.prepare(`
      INSERT INTO products (
        slug, name, description, price_cad, compare_at_price_cad, category, famille,
        type_lace, texture, longueur_po, densite, couleur,
        hd_lace, glueless, pret_a_porter, quantite_meches,
        stock, image_key, featured
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      slug, g("name"), g("description") || null,
      Number(g("price_cad")), n("compare_at_price_cad"),
      g("famille") === "perruque" ? "perruque" :
      g("famille") === "accessoire" || g("famille") === "soin" ? g("famille") : "perruque",
      g("famille"),
      g("type_lace") || null, g("texture") || null,
      n("longueur_po"), n("densite"),
      g("couleur") || null,
      b("hd_lace"), b("glueless"), b("pret_a_porter"),
      n("quantite_meches"),
      Number(g("stock") || 0), g("image_key") || null, b("featured")
    ).run();
  } catch (e: any) {
    if (e.message?.includes("UNIQUE")) return { error: "Ce slug existe déjà." };
    return { error: e.message };
  }

  throw redirect("/admin/produits");
}

export default function NouveauProduit() {
  const data = useActionData<typeof action>();
  const nav = useNavigation();

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center gap-4 mb-8">
        <Link to="/admin/produits" className="text-on-surface-variant hover:text-primary transition-colors">
          <span className="material-symbols-outlined">arrow_back</span>
        </Link>
        <h1 className="text-2xl font-bold text-on-surface">Nouveau produit</h1>
      </div>

      {data?.error && (
        <div className="mb-6 p-4 bg-error-container text-on-error-container rounded text-sm">{data.error}</div>
      )}

      <Form method="post" className="space-y-6">
        <ProduitFormFields />
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={nav.state === "submitting"}
            className="bg-primary text-on-primary px-6 py-2.5 text-sm font-semibold uppercase tracking-wider hover:opacity-90 disabled:opacity-60">
            {nav.state === "submitting" ? "Création…" : "Créer le produit"}
          </button>
          <Link to="/admin/produits" className="px-6 py-2.5 text-sm border border-outline-variant text-on-surface-variant hover:text-primary transition-colors">
            Annuler
          </Link>
        </div>
      </Form>
    </div>
  );
}

// ─── Shared form fields (used by nouveau + edit) ───────────────────────────

const TEXTURES = [
  ["lisse", "Lisse (Straight)"],
  ["body-wave", "Body Wave"],
  ["water-wave", "Water Wave"],
  ["deep-wave", "Deep Wave"],
  ["loose-wave", "Loose Wave"],
  ["boucle", "Bouclé (Curly)"],
  ["kinky-curly", "Kinky Curly"],
  ["kinky-straight", "Kinky Straight"],
  ["bob", "Bob"],
  ["avec-frange", "Avec frange"],
  ["autre", "Autre"],
];

const COULEURS = [
  ["naturel", "Noir naturel"],
  ["brun-fonce", "Brun foncé"],
  ["chatain", "Châtain"],
  ["balayage", "Balayage / Highlights"],
  ["ombre", "Ombré"],
  ["blonde-613", "Blonde 613"],
  ["colore", "Coloré (rouge, bordeaux…)"],
  ["autre", "Autre"],
];

const TYPES_LACE = [
  ["13x4", "13×4 Lace Front"],
  ["13x6", "13×6 Lace Front"],
  ["4x4", "4×4 Lace Closure"],
  ["5x5", "5×5 Lace Closure"],
  ["6x6", "6×6 Lace Closure"],
  ["360", "360 Lace"],
  ["full", "Full Lace"],
  ["v-part", "V-Part"],
  ["u-part", "U-Part"],
  ["glueless", "Glueless (sans colle)"],
  ["pre-everything", "Pré-Everything™"],
];

const LONGUEURS = [8,10,12,14,16,18,20,22,24,26,28,30,32,36,40];

export function ProduitFormFields({ defaults }: { defaults?: Record<string, any> }) {
  const famille = defaults?.famille ?? "perruque";

  return (
    <div className="space-y-6">
      {/* Section 1 — Infos de base */}
      <Section title="Informations générales">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label>Nom du produit *</Label>
            <input name="name" defaultValue={defaults?.name} required
              className={input} />
          </div>
          <div>
            <Label>Slug (URL)</Label>
            <input name="slug" defaultValue={defaults?.slug} placeholder="auto-généré"
              className={input} />
          </div>
          <div>
            <Label>Prix de vente CAD *</Label>
            <input name="price_cad" type="number" step="0.01" min="0"
              defaultValue={defaults?.price_cad} required className={input} />
          </div>
          <div>
            <Label>Prix avant réduction CAD</Label>
            <input name="compare_at_price_cad" type="number" step="0.01" min="0"
              defaultValue={defaults?.compare_at_price_cad ?? ""}
              placeholder="Laisser vide si prix normal"
              className={input} />
          </div>
          <div>
            <Label>Stock</Label>
            <input name="stock" type="number" min="0" defaultValue={defaults?.stock ?? 0}
              className={input} />
          </div>
          <div>
            <Label>Image (URL ou clé R2)</Label>
            <input name="image_key" defaultValue={defaults?.image_key} className={input} />
          </div>
          <div className="col-span-2">
            <Label>Description</Label>
            <textarea name="description" defaultValue={defaults?.description} rows={3}
              className={`${input} resize-none`} />
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <input type="checkbox" name="featured" id="featured" value="1"
              defaultChecked={defaults?.featured === 1} className="accent-primary" />
            <label htmlFor="featured" className="text-sm text-on-surface">Mettre en vedette (page d'accueil)</label>
          </div>
        </div>
      </Section>

      {/* Section 2 — Famille */}
      <Section title="Famille de produit">
        <div className="grid grid-cols-3 gap-3">
          {[
            ["perruque", "Perruque", "styler"],
            ["meche", "Mèche / Tissage", "waves"],
            ["closure", "Closure", "crop_square"],
            ["frontal", "Frontal", "crop_free"],
            ["accessoire", "Accessoire", "inventory_2"],
            ["soin", "Soin", "spa"],
          ].map(([val, label, icon]) => (
            <label key={val} className="flex items-center gap-2 p-3 border border-outline-variant rounded cursor-pointer hover:border-primary has-[:checked]:border-primary has-[:checked]:bg-primary/5 transition-colors">
              <input type="radio" name="famille" value={val}
                defaultChecked={(defaults?.famille ?? "perruque") === val}
                className="accent-primary" />
              <span className="material-symbols-outlined text-sm text-on-surface-variant">{icon}</span>
              <span className="text-sm font-medium text-on-surface">{label}</span>
            </label>
          ))}
        </div>
      </Section>

      {/* Section 3 — Attributs perruque / mèche / closure / frontal */}
      <Section title="Caractéristiques techniques" subtitle="Laissez vide si non applicable">
        <div className="grid grid-cols-2 gap-4">

          {/* Type de lace */}
          <div className="col-span-2">
            <Label>Type de construction (lace)</Label>
            <div className="grid grid-cols-3 gap-2 mt-1.5">
              {TYPES_LACE.map(([val, label]) => (
                <label key={val} className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input type="radio" name="type_lace" value={val}
                    defaultChecked={defaults?.type_lace === val}
                    className="accent-primary" />
                  {label}
                </label>
              ))}
              <label className="flex items-center gap-1.5 text-xs cursor-pointer col-span-3 text-on-surface-variant">
                <input type="radio" name="type_lace" value="" defaultChecked={!defaults?.type_lace}
                  className="accent-primary" />
                Non applicable
              </label>
            </div>
          </div>

          {/* Texture */}
          <div>
            <Label>Texture</Label>
            <select name="texture" defaultValue={defaults?.texture ?? ""} className={input}>
              <option value="">— Non applicable —</option>
              {TEXTURES.map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>

          {/* Couleur */}
          <div>
            <Label>Couleur</Label>
            <select name="couleur" defaultValue={defaults?.couleur ?? ""} className={input}>
              <option value="">— Non applicable —</option>
              {COULEURS.map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>

          {/* Longueur */}
          <div>
            <Label>Longueur (pouces)</Label>
            <select name="longueur_po" defaultValue={defaults?.longueur_po ?? ""} className={input}>
              <option value="">— Non applicable —</option>
              {LONGUEURS.map(l => (
                <option key={l} value={l}>{l} po</option>
              ))}
            </select>
          </div>

          {/* Densité */}
          <div>
            <Label>Densité</Label>
            <select name="densite" defaultValue={defaults?.densite ?? ""} className={input}>
              <option value="">— Non applicable —</option>
              {[130,150,180,200,250].map(d => (
                <option key={d} value={d}>{d}%</option>
              ))}
            </select>
          </div>

          {/* Quantité mèches */}
          <div>
            <Label>Quantité de mèches (bundles)</Label>
            <select name="quantite_meches" defaultValue={defaults?.quantite_meches ?? ""} className={input}>
              <option value="">— Non applicable —</option>
              {[1,2,3,4].map(q => (
                <option key={q} value={q}>{q} mèche{q > 1 ? "s" : ""}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Options booléennes */}
        <div className="flex flex-wrap gap-6 mt-5">
          {[
            ["hd_lace", "HD Lace (dentelle ultra-fine invisible)"],
            ["glueless", "Sans colle (glueless)"],
            ["pret_a_porter", "Prêt à porter (Pré-Everything™)"],
          ].map(([name, label]) => (
            <label key={name} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" name={name} id={name} value="1"
                defaultChecked={defaults?.[name] === 1} className="accent-primary w-4 h-4" />
              <span className="text-sm text-on-surface">{label}</span>
            </label>
          ))}
        </div>
      </Section>
    </div>
  );
}

// ─── Helpers UI ───────────────────────────────────────────────────────────────

const input = "w-full border border-outline-variant bg-surface px-3 py-2 text-sm focus:outline-none focus:border-primary";

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">{children}</label>;
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-outline-variant/30 rounded p-6">
      <h2 className="font-semibold text-on-surface mb-1">{title}</h2>
      {subtitle && <p className="text-xs text-on-surface-variant mb-4">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </div>
  );
}
