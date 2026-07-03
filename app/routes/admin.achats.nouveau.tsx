import { json, redirect } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { Form, Link, useLoaderData } from "@remix-run/react";
import { useEffect, useRef, useState } from "react";
import { requireAdmin } from "~/lib/admin-session.server";

export const meta: MetaFunction = () => [{ title: "Nouvelle commande fournisseur — Admin DDM" }];

export async function loader({ context }: LoaderFunctionArgs) {
  const db = context.cloudflare.env.DB;
  const [{ results: products }, { results: fournisseurs }] = await Promise.all([
    db.prepare(`
      SELECT p.id, p.name, p.sku, p.ref_fournisseur, p.prix_achat_usd,
        f.nom as fournisseur_nom, f.id as fournisseur_id
      FROM products p
      LEFT JOIN fournisseurs f ON f.id = p.fournisseur_id
      ORDER BY p.name
    `).all(),
    db.prepare("SELECT id, nom, email, telephone FROM fournisseurs ORDER BY nom ASC").all(),
  ]);
  return json({ products: products ?? [], fournisseurs: fournisseurs ?? [] });
}

export async function action({ request, context }: ActionFunctionArgs) {
  await requireAdmin(request, context);
  const f = await request.formData();
  const g = (k: string) => String(f.get(k) ?? "").trim();
  const n = (k: string) => { const v = g(k); return v ? Number(v) : null; };
  const db = context.cloudflare.env.DB;

  if (!g("fournisseur")) return json({ error: "Le fournisseur est requis." });

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

  const productIds = f.getAll("product_id[]");
  const nomsProduits = f.getAll("nom_produit[]");
  const qtys = f.getAll("quantite_commandee[]");
  const prix = f.getAll("prix_unitaire_usd[]");
  const refs = f.getAll("ref_fournisseur[]");

  for (let i = 0; i < productIds.length; i++) {
    const pid = String(productIds[i]);
    const qty = Number(qtys[i] ?? 1);
    const prixUnit = Number(prix[i] ?? 0);
    const nom = String(nomsProduits[i] ?? "");
    const refF = String(refs[i] ?? "");
    if (qty > 0 && nom) {
      await db.prepare(`
        INSERT INTO commandes_fournisseurs_items (commande_id, product_id, nom_produit, ref_fournisseur, quantite_commandee, prix_unitaire_usd)
        VALUES (?,?,?,?,?,?)
      `).bind(commandeId, pid || null, nom, refF || null, qty, prixUnit).run();
    }
  }

  throw redirect(`/admin/achats/${commandeId}`);
}

// ─── Types ─────────────────────────────────────────────────────────────────────

type Fournisseur = { id: number; nom: string; email: string | null; telephone: string | null };
type Product = { id: number; name: string; sku: string | null; ref_fournisseur: string | null; prix_achat_usd: number | null; fournisseur_nom: string | null; fournisseur_id: number | null };
type QuickConfig = { id: string; nom: string; fournisseur: string; contact: string; taux_change: number; frais_expedition_usd: number; frais_douane_cad: number };
type LineState = { id: number; productId: string; productName: string; qty: number; prix: number; ref: string };

const CONFIGS_KEY = "ddm_achat_configs";

// ─── Composant principal ───────────────────────────────────────────────────────

export default function NouvelleCommande() {
  const { products, fournisseurs } = useLoaderData<typeof loader>();
  const ps = products as Product[];
  const fs = fournisseurs as Fournisseur[];

  // Fournisseur
  const [fournisseurNom, setFournisseurNom] = useState("");
  const [contact, setContact] = useState("");

  // Frais
  const [taux, setTaux] = useState(1.38);
  const [fraisExp, setFraisExp] = useState(0);
  const [fraisDouane, setFraisDouane] = useState(0);

  // Lignes articles
  const [lines, setLines] = useState<LineState[]>([{ id: Date.now(), productId: "", productName: "", qty: 1, prix: 0, ref: "" }]);

  // Configs rapides
  const [configs, setConfigs] = useState<QuickConfig[]>([]);
  const [newConfigNom, setNewConfigNom] = useState("");
  const [showSaveForm, setShowSaveForm] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CONFIGS_KEY);
      if (raw) setConfigs(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const saveConfigs = (updated: QuickConfig[]) => {
    setConfigs(updated);
    localStorage.setItem(CONFIGS_KEY, JSON.stringify(updated));
  };

  const applyConfig = (c: QuickConfig) => {
    setFournisseurNom(c.fournisseur);
    setContact(c.contact);
    setTaux(c.taux_change);
    setFraisExp(c.frais_expedition_usd);
    setFraisDouane(c.frais_douane_cad);
    setShowSaveForm(false);
  };

  const saveCurrentConfig = () => {
    if (!newConfigNom.trim()) return;
    const nc: QuickConfig = {
      id: String(Date.now()),
      nom: newConfigNom.trim(),
      fournisseur: fournisseurNom,
      contact,
      taux_change: taux,
      frais_expedition_usd: fraisExp,
      frais_douane_cad: fraisDouane,
    };
    saveConfigs([...configs, nc]);
    setNewConfigNom("");
    setShowSaveForm(false);
  };

  const deleteConfig = (id: string) => saveConfigs(configs.filter(c => c.id !== id));

  const onFournisseurChange = (nom: string) => {
    setFournisseurNom(nom);
    const found = fs.find(f => f.nom === nom);
    if (found?.email) setContact(found.email);
    else if (found?.telephone) setContact(found.telephone);
  };

  // Lignes articles
  const updateLine = (id: number, patch: Partial<LineState>) => {
    setLines(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
  };

  const selectProduct = (lineId: number, pid: string) => {
    const p = ps.find(p => String(p.id) === pid);
    updateLine(lineId, {
      productId: pid,
      productName: p?.name ?? "",
      prix: p?.prix_achat_usd ? Number(p.prix_achat_usd) : 0,
      ref: p?.ref_fournisseur ?? "",
    });
  };

  const totalArticlesUSD = lines.reduce((s, l) => s + l.qty * l.prix, 0);
  const totalUSD = totalArticlesUSD + fraisExp;
  const totalCAD = totalUSD * taux + fraisDouane;

  // Produits du fournisseur sélectionné en premier
  const fournisseurId = fs.find(f => f.nom === fournisseurNom)?.id ?? null;
  const sortedProducts = fournisseurId
    ? [...ps.filter(p => p.fournisseur_id === fournisseurId), ...ps.filter(p => p.fournisseur_id !== fournisseurId)]
    : ps;

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center gap-4 mb-8">
        <Link to="/admin/achats" className="text-on-surface-variant hover:text-primary transition-colors">
          <span className="material-symbols-outlined">arrow_back</span>
        </Link>
        <h1 className="text-2xl font-bold text-on-surface">Nouvelle commande fournisseur</h1>
      </div>

      {/* Configs rapides */}
      {(configs.length > 0 || true) && (
        <div className="mb-6 bg-surface border border-primary/20 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm text-primary">bookmark</span>
              Configs rapides
            </p>
            <button type="button" onClick={() => setShowSaveForm(v => !v)}
              className="text-xs text-primary hover:underline font-semibold flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">add</span>
              Sauvegarder la config actuelle
            </button>
          </div>

          {showSaveForm && (
            <div className="flex gap-2 mb-3">
              <input
                value={newConfigNom}
                onChange={e => setNewConfigNom(e.target.value)}
                placeholder="Nom de la config (ex: Aliexpress standard)"
                className={`${inp} flex-1`}
                onKeyDown={e => e.key === "Enter" && (e.preventDefault(), saveCurrentConfig())}
              />
              <button type="button" onClick={saveCurrentConfig}
                className="bg-primary text-on-primary px-4 py-2 text-xs font-semibold uppercase tracking-wider hover:opacity-90">
                Sauvegarder
              </button>
            </div>
          )}

          {configs.length === 0 ? (
            <p className="text-xs text-on-surface-variant">Aucune config sauvegardée. Remplis le formulaire puis clique "Sauvegarder la config actuelle".</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {configs.map(c => (
                <div key={c.id} className="flex items-center gap-1 border border-outline-variant/40 bg-surface-container-low px-3 py-1.5 text-xs">
                  <button type="button" onClick={() => applyConfig(c)}
                    className="font-semibold text-on-surface hover:text-primary transition-colors">
                    {c.nom}
                  </button>
                  <span className="text-on-surface-variant/50 mx-1">·</span>
                  <span className="text-on-surface-variant">{c.fournisseur}</span>
                  <button type="button" onClick={() => deleteConfig(c.id)}
                    className="ml-2 text-on-surface-variant/40 hover:text-error transition-colors">
                    <span className="material-symbols-outlined text-sm">close</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Form method="post" className="space-y-6">

        {/* Fournisseur */}
        <Section title="Fournisseur" icon="local_shipping">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Fournisseur *</Label>
              {fs.length > 0 ? (
                <div className="flex gap-2">
                  <select
                    name="fournisseur"
                    required
                    value={fournisseurNom}
                    onChange={e => onFournisseurChange(e.target.value)}
                    className={`${inp} flex-1`}
                  >
                    <option value="">— Sélectionner un fournisseur —</option>
                    {fs.map(f => (
                      <option key={f.id} value={f.nom}>{f.nom}</option>
                    ))}
                  </select>
                  <Link to="/admin/fournisseurs"
                    className="text-xs text-primary border border-primary/30 px-3 py-2 hover:bg-primary hover:text-on-primary transition-colors whitespace-nowrap flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">add</span>
                    Gérer
                  </Link>
                </div>
              ) : (
                <div>
                  <input name="fournisseur" required value={fournisseurNom}
                    onChange={e => setFournisseurNom(e.target.value)}
                    placeholder="Nom du fournisseur" className={inp} />
                  <p className="text-xs text-on-surface-variant mt-1">
                    <Link to="/admin/fournisseurs" className="text-primary hover:underline">Ajouter des fournisseurs</Link> pour utiliser le dropdown.
                  </p>
                </div>
              )}
            </div>
            <div>
              <Label>Contact (WhatsApp / email)</Label>
              <input name="contact" value={contact} onChange={e => setContact(e.target.value)}
                placeholder="contact@fournisseur.com" className={inp} />
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
            {lines.map((line) => (
              <div key={line.id} className="grid grid-cols-12 gap-2 items-end p-3 bg-surface-container-low border border-outline-variant/30">
                {/* hidden nom_produit[] — mis à jour via state */}
                <input type="hidden" name="nom_produit[]" value={line.productName || "Produit sans nom"} />
                <div className="col-span-5">
                  <Label>Produit</Label>
                  <select name="product_id[]" value={line.productId} className={inp}
                    onChange={e => selectProduct(line.id, e.target.value)}>
                    <option value="">— Sélectionner —</option>
                    {fournisseurId && sortedProducts.some(p => p.fournisseur_id === fournisseurId) && (
                      <optgroup label={`Produits ${fournisseurNom}`}>
                        {sortedProducts.filter(p => p.fournisseur_id === fournisseurId).map(p => (
                          <option key={p.id} value={String(p.id)}>
                            {p.name}{p.sku ? ` (${p.sku})` : ""}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label={fournisseurId ? "Autres produits" : "Tous les produits"}>
                      {sortedProducts.filter(p => !fournisseurId || p.fournisseur_id !== fournisseurId).map(p => (
                        <option key={p.id} value={String(p.id)}>
                          {p.name}{p.sku ? ` (${p.sku})` : ""}{p.fournisseur_nom ? ` — ${p.fournisseur_nom}` : ""}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>
                <div className="col-span-2">
                  <Label>Qté</Label>
                  <input name="quantite_commandee[]" type="number" min="1" value={line.qty}
                    onChange={e => updateLine(line.id, { qty: Number(e.target.value) })}
                    className={inp} />
                </div>
                <div className="col-span-2">
                  <Label>Prix unit. USD</Label>
                  <input name="prix_unitaire_usd[]" type="number" step="0.01" min="0" value={line.prix || ""}
                    onChange={e => updateLine(line.id, { prix: Number(e.target.value) })}
                    className={inp} />
                </div>
                <div className="col-span-2">
                  <Label>Réf. fourn.</Label>
                  <input name="ref_fournisseur[]" value={line.ref}
                    onChange={e => updateLine(line.id, { ref: e.target.value })}
                    className={inp} />
                </div>
                <div className="col-span-1 flex items-end pb-0.5">
                  {lines.length > 1 && (
                    <button type="button" onClick={() => setLines(l => l.filter(x => x.id !== line.id))}
                      className="text-error hover:text-error/80">
                      <span className="material-symbols-outlined text-xl">delete</span>
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Sous-total lignes */}
            {totalArticlesUSD > 0 && (
              <p className="text-xs text-on-surface-variant text-right font-mono">
                Sous-total articles : <span className="font-bold text-on-surface">{totalArticlesUSD.toFixed(2)} USD</span>
              </p>
            )}

            <button type="button" onClick={() => setLines(l => [...l, { id: Date.now(), productId: "", productName: "", qty: 1, prix: 0, ref: "" }])}
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
              <input name="frais_expedition_usd" type="number" step="0.01" min="0" value={fraisExp}
                onChange={e => setFraisExp(Number(e.target.value))} className={inp} />
            </div>
            <div>
              <Label>Frais de douane CAD</Label>
              <input name="frais_douane_cad" type="number" step="0.01" min="0" value={fraisDouane}
                onChange={e => setFraisDouane(Number(e.target.value))} className={inp} />
            </div>
            <div>
              <Label>Taux de change USD→CAD</Label>
              <input name="taux_change" type="number" step="0.001" min="1" value={taux}
                onChange={e => setTaux(Number(e.target.value))} className={inp} />
            </div>
          </div>

          {totalUSD > 0 && (
            <div className="mt-4 p-4 bg-surface-container grid grid-cols-3 gap-4 border border-outline-variant/30">
              <div className="text-center">
                <p className="text-xs text-on-surface-variant uppercase tracking-wider mb-1">Articles USD</p>
                <p className="font-mono font-bold text-lg text-on-surface">{totalArticlesUSD.toFixed(2)} $</p>
              </div>
              <div className="text-center border-x border-outline-variant">
                <p className="text-xs text-on-surface-variant uppercase tracking-wider mb-1">Total USD (+ expéd.)</p>
                <p className="font-mono font-bold text-lg text-on-surface">{totalUSD.toFixed(2)} $</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-on-surface-variant uppercase tracking-wider mb-1">Total CAD (+ douanes)</p>
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
