import { json, redirect } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { Form, Link, useLoaderData } from "@remix-run/react";
import { useState } from "react";

export const meta: MetaFunction = () => [{ title: "Nouvelle commande fournisseur — Admin DDM" }];

export async function loader({ context }: LoaderFunctionArgs) {
  const { results } = await context.cloudflare.env.DB
    .prepare("SELECT id, name, sku, fournisseur, ref_fournisseur, prix_achat_usd FROM products ORDER BY name")
    .all();
  return json({ products: results ?? [] });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const f = await request.formData();
  const g = (k: string) => String(f.get(k) ?? "").trim();
  const n = (k: string) => { const v = g(k); return v ? Number(v) : null; };
  const db = context.cloudflare.env.DB;

  if (!g("fournisseur")) return json({ error: "Le fournisseur est requis." });

  // Générer une référence unique
  const year = new Date().getFullYear();
  const { results: last } = await db
    .prepare("SELECT ref FROM commandes_fournisseurs WHERE ref LIKE ? ORDER BY id DESC LIMIT 1")
    .bind(`CF-${year}-%`).all();
  const lastNum = last?.[0] ? parseInt(String((last[0] as any).ref).split("-")[2] ?? "0") : 0;
  const ref = `CF-${year}-${String(lastNum + 1).padStart(3, "0")}`;

  const { meta } = await db.prepare(`
    INSERT INTO commandes_fournisseurs (ref, fournisseur, contact, statut, date_commande, date_livraison_prevue, frais_expedition_usd, frais_douane_cad, taux_change, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).bind(
    ref, g("fournisseur"), g("contact") || null,
    g("statut") || "brouillon",
    g("date_commande") || new Date().toISOString().split("T")[0],
    g("date_livraison_prevue") || null,
    n("frais_expedition_usd") ?? 0,
    n("frais_douane_cad") ?? 0,
    n("taux_change") ?? 1.38,
    g("notes") || null
  ).run();

  const commandeId = meta.last_row_id;

  // Insérer les lignes produit
  const productIds = f.getAll("product_id[]");
  for (let i = 0; i < productIds.length; i++) {
    const pid = String(productIds[i]);
    const qty = Number(f.getAll("quantite_commandee[]")[i] ?? 1);
    const prix = Number(f.getAll("prix_unitaire_usd[]")[i] ?? 0);
    const nom = String(f.getAll("nom_produit[]")[i] ?? "");
    const ref_f = String(f.getAll("ref_fournisseur[]")[i] ?? "");
    if (qty > 0 && nom) {
      await db.prepare(`
        INSERT INTO commandes_fournisseurs_items (commande_id, product_id, nom_produit, ref_fournisseur, quantite_commandee, prix_unitaire_usd)
        VALUES (?,?,?,?,?,?)
      `).bind(commandeId, pid || null, nom, ref_f || null, qty, prix).run();
    }
  }

  throw redirect(`/admin/achats/${commandeId}`);
}

export default function NouvelleCommande() {
  const { products } = useLoaderData<typeof loader>();
  const [lines, setLines] = useState([{ id: Date.now() }]);
  const [taux, setTaux] = useState(1.38);
  const [fraisExp, setFraisExp] = useState(0);
  const [fraisDouane, setFraisDouane] = useState(0);
  const [linePrices, setLinePrices] = useState<Record<number, { qty: number; prix: number }>>({});

  const totalUSD = Object.values(linePrices).reduce((s, l) => s + (l.qty || 0) * (l.prix || 0), 0) + fraisExp;
  const totalCAD = totalUSD * taux + fraisDouane;

  const updateLine = (id: number, key: "qty" | "prix", val: number) => {
    setLinePrices(prev => ({ ...prev, [id]: { ...prev[id], [key]: val } }));
  };

  const selectProduct = (lineId: number, pid: string) => {
    const p = (products as any[]).find(p => String(p.id) === pid);
    if (p?.prix_achat_usd) updateLine(lineId, "prix", Number(p.prix_achat_usd));
  };

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center gap-4 mb-8">
        <Link to="/admin/achats" className="text-on-surface-variant hover:text-primary transition-colors">
          <span className="material-symbols-outlined">arrow_back</span>
        </Link>
        <h1 className="text-2xl font-bold text-on-surface">Nouvelle commande fournisseur</h1>
      </div>

      <Form method="post" className="space-y-6">

        {/* Fournisseur */}
        <Section title="Fournisseur" icon="local_shipping">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Fournisseur *</Label>
              <input name="fournisseur" required placeholder="Nom du fournisseur" className={inp} />
            </div>
            <div>
              <Label>Contact (WhatsApp / email)</Label>
              <input name="contact" placeholder="contact@fournisseur.com" className={inp} />
            </div>
            <div>
              <Label>Statut initial</Label>
              <select name="statut" className={inp}>
                <option value="brouillon">Brouillon</option>
                <option value="confirmee">Confirmée</option>
              </select>
            </div>
            <div>
              <Label>Date de commande</Label>
              <input name="date_commande" type="date"
                defaultValue={new Date().toISOString().split("T")[0]} className={inp} />
            </div>
            <div>
              <Label>Livraison prévue</Label>
              <input name="date_livraison_prevue" type="date" className={inp} />
            </div>
          </div>
        </Section>

        {/* Articles */}
        <Section title="Articles commandés" icon="inventory_2">
          <div className="space-y-3">
            {lines.map((line, i) => (
              <div key={line.id} className="grid grid-cols-12 gap-2 items-end p-3 bg-surface-container-low border border-outline-variant/30">
                <div className="col-span-5">
                  <Label>Produit</Label>
                  <select name="product_id[]" className={inp}
                    onChange={e => selectProduct(line.id, e.target.value)}>
                    <option value="">— Sélectionner —</option>
                    {(products as any[]).map(p => (
                      <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ""}</option>
                    ))}
                  </select>
                  <input type="hidden" name="nom_produit[]"
                    value={(products as any[]).find(p => String(p.id) === "") ? "" : ""}
                    id={`nom_${line.id}`} />
                </div>
                <div className="col-span-2">
                  <Label>Qté</Label>
                  <input name="quantite_commandee[]" type="number" min="1" defaultValue={1}
                    onChange={e => updateLine(line.id, "qty", Number(e.target.value))}
                    className={inp} />
                </div>
                <div className="col-span-2">
                  <Label>Prix unit. USD</Label>
                  <input name="prix_unitaire_usd[]" type="number" step="0.01" min="0"
                    value={linePrices[line.id]?.prix ?? ""}
                    onChange={e => updateLine(line.id, "prix", Number(e.target.value))}
                    className={inp} />
                </div>
                <div className="col-span-2">
                  <Label>Réf. fourn.</Label>
                  <input name="ref_fournisseur[]" className={inp} />
                </div>
                <div className="col-span-1 flex items-end pb-0.5">
                  {lines.length > 1 && (
                    <button type="button" onClick={() => setLines(l => l.filter(x => x.id !== line.id))}
                      className="text-error hover:text-error/80">
                      <span className="material-symbols-outlined text-xl">delete</span>
                    </button>
                  )}
                </div>
                {/* Hidden field for nom_produit — will be overridden by JS */}
                <input type="hidden" name="nom_produit[]" value="Produit" />
              </div>
            ))}
            <button type="button" onClick={() => setLines(l => [...l, { id: Date.now() }])}
              className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 font-semibold">
              <span className="material-symbols-outlined text-lg">add_circle</span>
              Ajouter un article
            </button>
          </div>
        </Section>

        {/* Frais & Coûts */}
        <Section title="Frais & Coûts" icon="payments">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Frais d'expédition USD</Label>
              <input name="frais_expedition_usd" type="number" step="0.01" min="0" defaultValue={0}
                onChange={e => setFraisExp(Number(e.target.value))} className={inp} />
            </div>
            <div>
              <Label>Frais de douane CAD</Label>
              <input name="frais_douane_cad" type="number" step="0.01" min="0" defaultValue={0}
                onChange={e => setFraisDouane(Number(e.target.value))} className={inp} />
            </div>
            <div>
              <Label>Taux de change USD→CAD</Label>
              <input name="taux_change" type="number" step="0.001" min="1" defaultValue={1.38}
                onChange={e => setTaux(Number(e.target.value))} className={inp} />
            </div>
          </div>

          {totalUSD > 0 && (
            <div className="mt-4 p-4 bg-surface-container grid grid-cols-3 gap-4 border border-outline-variant/30">
              <div className="text-center">
                <p className="text-xs text-on-surface-variant uppercase tracking-wider mb-1">Total articles USD</p>
                <p className="font-mono font-bold text-lg text-on-surface">{totalUSD.toFixed(2)} $</p>
              </div>
              <div className="text-center border-x border-outline-variant">
                <p className="text-xs text-on-surface-variant uppercase tracking-wider mb-1">Coût total USD</p>
                <p className="font-mono font-bold text-lg text-on-surface">{(totalUSD).toFixed(2)} $</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-on-surface-variant uppercase tracking-wider mb-1">Coût total CAD</p>
                <p className="font-mono font-bold text-lg text-primary">{totalCAD.toFixed(2)} $</p>
              </div>
            </div>
          )}
        </Section>

        {/* Notes */}
        <Section title="Notes" icon="notes">
          <textarea name="notes" rows={3} placeholder="Instructions, numéro de commande externe, négociations…"
            className={`${inp} resize-none`} />
        </Section>

        <div className="flex gap-3">
          <button type="submit"
            className="bg-primary text-on-primary px-6 py-2.5 text-sm font-semibold uppercase tracking-wider hover:opacity-90">
            Créer la commande
          </button>
          <Link to="/admin/achats"
            className="px-6 py-2.5 text-sm border border-outline-variant text-on-surface-variant hover:text-primary transition-colors">
            Annuler
          </Link>
        </div>
      </Form>
    </div>
  );
}

const inp = "w-full border border-outline-variant bg-surface px-3 py-2 text-sm focus:outline-none focus:border-primary";

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">{children}</label>;
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-outline-variant/30 p-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="material-symbols-outlined text-base text-primary">{icon}</span>
        <h2 className="font-semibold text-on-surface">{title}</h2>
      </div>
      {children}
    </div>
  );
}
