import { json, redirect } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { useEffect, useState } from "react";
import { isAdminAuthenticated } from "~/lib/admin-session.server";

interface FlashSale {
  id: number;
  product_id: number;
  product_name: string;
  product_price: number;
  flash_price_cad: number;
  starts_at: string;
  ends_at: string;
  active: number;
  status: "upcoming" | "active" | "expired";
}

interface Product { id: number; name: string; price_cad: number; }

function getStatus(starts: string, ends: string): "upcoming" | "active" | "expired" {
  const now = Date.now();
  const s = new Date(starts).getTime();
  const e = new Date(ends).getTime();
  if (now < s) return "upcoming";
  if (now > e) return "expired";
  return "active";
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const authed = await isAdminAuthenticated(request, context);
  if (!authed) throw redirect("/admin/connexion");

  const db = context.cloudflare.env.DB;

  const { results: sales } = await db.prepare(`
    SELECT fs.*, p.name as product_name, p.price_cad as product_price
    FROM flash_sales fs
    JOIN products p ON p.id = fs.product_id
    ORDER BY fs.ends_at DESC
  `).all<FlashSale>();

  const { results: products } = await db.prepare(
    "SELECT id, name, price_cad FROM products WHERE stock > 0 ORDER BY name ASC"
  ).all<Product>();

  const enriched = (sales ?? []).map(s => ({
    ...s,
    status: getStatus(s.starts_at, s.ends_at),
  }));

  return json({ sales: enriched, products: products ?? [] });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const authed = await isAdminAuthenticated(request, context);
  if (!authed) throw redirect("/admin/connexion");

  const db = context.cloudflare.env.DB;
  const form = await request.formData();
  const intent = form.get("intent") as string;

  if (intent === "create") {
    const product_id = form.get("product_id");
    const flash_price = parseFloat(form.get("flash_price_cad") as string);
    const starts_at = form.get("starts_at") as string;
    const ends_at = form.get("ends_at") as string;

    if (!product_id || isNaN(flash_price) || !starts_at || !ends_at) {
      return json({ error: "Tous les champs sont requis." }, { status: 400 });
    }
    if (new Date(ends_at) <= new Date(starts_at)) {
      return json({ error: "La date de fin doit être après la date de début." }, { status: 400 });
    }
    await db.prepare(
      "INSERT INTO flash_sales (product_id, flash_price_cad, starts_at, ends_at, active) VALUES (?, ?, ?, ?, 1)"
    ).bind(product_id, flash_price, starts_at, ends_at).run();
    return json({ ok: true });
  }

  if (intent === "toggle") {
    await db.prepare("UPDATE flash_sales SET active = CASE WHEN active=1 THEN 0 ELSE 1 END WHERE id=?")
      .bind(form.get("id")).run();
    return json({ ok: true });
  }

  if (intent === "delete") {
    await db.prepare("DELETE FROM flash_sales WHERE id=?").bind(form.get("id")).run();
    return json({ ok: true });
  }

  return json({ error: "Action inconnue." }, { status: 400 });
}

const STATUS_LABELS = {
  active:   { label: "En cours",    cls: "bg-secondary-container text-on-secondary-container" },
  upcoming: { label: "À venir",     cls: "bg-surface-container-high text-on-surface-variant" },
  expired:  { label: "Terminée",    cls: "bg-error-container/40 text-on-error-container" },
};

function Countdown({ endsAt }: { endsAt: string }) {
  const [left, setLeft] = useState(0); // 0 on SSR, real value set by useEffect on client

  useEffect(() => {
    setLeft(Math.max(0, new Date(endsAt).getTime() - Date.now()));
    const id = setInterval(() => {
      const ms = Math.max(0, new Date(endsAt).getTime() - Date.now());
      setLeft(ms);
      if (ms === 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  const s = Math.floor(left / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const d = Math.floor(s / 86400);

  if (left === 0) return <span className="text-error text-xs font-mono">Terminée</span>;
  return (
    <span className="font-mono text-xs tabular-nums text-on-surface">
      {d > 0 ? `${d}j ` : ""}{pad(h)}:{pad(m)}:{pad(sec)}
    </span>
  );
}

function formatLocal(iso: string) {
  return new Date(iso).toLocaleString("fr-CA", { dateStyle: "short", timeStyle: "short" });
}

function localToISO(local: string) {
  if (!local) return "";
  return new Date(local).toISOString().slice(0, 16);
}

export default function AdminVentesFlash() {
  const { sales, products } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const [showCreate, setShowCreate] = useState(false);

  const now = Date.now();
  const active = sales.filter(s => s.status === "active" && s.active);
  const upcoming = sales.filter(s => s.status === "upcoming" && s.active);
  const others = sales.filter(s => s.status === "expired" || !s.active);

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">bolt</span>
            Ventes Flash
          </h1>
          <p className="text-sm text-on-surface-variant mt-0.5">Promotions à durée limitée sur des produits spécifiques</p>
        </div>
        {!showCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2 text-sm font-semibold uppercase tracking-wider hover:opacity-90 rounded"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Nouvelle vente flash
          </button>
        )}
      </div>

      {/* Formulaire de création */}
      {showCreate && (
        <div className="bg-surface-container-low border border-outline-variant rounded-lg p-5 mb-8">
          <h2 className="text-sm font-bold uppercase tracking-wider text-on-surface-variant mb-4">Nouvelle vente flash</h2>
          <fetcher.Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="create" />

            {fetcher.data?.error && (
              <p className="text-sm text-error bg-error-container/30 px-3 py-2 rounded">{fetcher.data.error}</p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                  Produit <span className="text-error">*</span>
                </label>
                <select name="product_id" required
                  className="w-full border border-outline-variant rounded px-3 py-2 text-sm bg-surface focus:outline-none focus:border-primary">
                  <option value="">Sélectionner un produit…</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} — {p.price_cad.toFixed(2)} $</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                  Prix flash ($ CAD) <span className="text-error">*</span>
                </label>
                <input type="number" name="flash_price_cad" step="0.01" min="0" required
                  placeholder="ex: 299.99"
                  className="w-full border border-outline-variant rounded px-3 py-2 text-sm bg-surface focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                  Début <span className="text-error">*</span>
                </label>
                <input type="datetime-local" name="starts_at" required
                  className="w-full border border-outline-variant rounded px-3 py-2 text-sm bg-surface focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                  Fin <span className="text-error">*</span>
                </label>
                <input type="datetime-local" name="ends_at" required
                  className="w-full border border-outline-variant rounded px-3 py-2 text-sm bg-surface focus:outline-none focus:border-primary" />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={fetcher.state === "submitting"}
                className="bg-primary text-on-primary px-5 py-2 text-sm font-semibold uppercase tracking-wider hover:opacity-90 disabled:opacity-60 rounded">
                {fetcher.state === "submitting" ? "Création…" : "Créer la vente flash"}
              </button>
              <button type="button" onClick={() => setShowCreate(false)}
                className="px-5 py-2 text-sm border border-outline-variant text-on-surface-variant hover:text-primary rounded">
                Annuler
              </button>
            </div>
          </fetcher.Form>
        </div>
      )}

      {/* En cours */}
      {active.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-secondary-container inline-block" />
            En cours ({active.length})
          </h2>
          <div className="space-y-2">
            {active.map(s => <SaleRow key={s.id} sale={s} fetcher={fetcher} />)}
          </div>
        </section>
      )}

      {/* À venir */}
      {upcoming.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-outline-variant inline-block" />
            À venir ({upcoming.length})
          </h2>
          <div className="space-y-2">
            {upcoming.map(s => <SaleRow key={s.id} sale={s} fetcher={fetcher} />)}
          </div>
        </section>
      )}

      {/* Terminées / inactives */}
      {others.length > 0 && (
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-error-container inline-block" />
            Terminées / inactives ({others.length})
          </h2>
          <div className="space-y-2">
            {others.map(s => <SaleRow key={s.id} sale={s} fetcher={fetcher} />)}
          </div>
        </section>
      )}

      {sales.length === 0 && (
        <div className="text-center py-16 text-on-surface-variant">
          <span className="material-symbols-outlined text-5xl mb-3 block text-primary/40">bolt</span>
          <p>Aucune vente flash pour l'instant.</p>
        </div>
      )}
    </div>
  );
}

function SaleRow({ sale, fetcher }: { sale: FlashSale & { status: string }; fetcher: any }) {
  const pct = Math.round((1 - sale.flash_price_cad / sale.product_price) * 100);
  const s = STATUS_LABELS[sale.status as keyof typeof STATUS_LABELS] ?? STATUS_LABELS.expired;

  return (
    <div className={`bg-surface border rounded-lg px-4 py-3 flex items-center gap-4 ${!sale.active ? "opacity-60" : "border-outline-variant"}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm text-on-surface truncate">{sale.product_name}</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${s.cls}`}>
            {s.label}
          </span>
          {sale.active && sale.status === "active" && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary uppercase tracking-wider">
              -{pct}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 mt-1 flex-wrap">
          <span className="text-xs text-on-surface-variant">
            <span className="line-through">{sale.product_price.toFixed(2)} $</span>
            {" → "}
            <span className="text-primary font-bold">{sale.flash_price_cad.toFixed(2)} $</span>
          </span>
          <span className="text-xs text-on-surface-variant">{formatLocal(sale.starts_at)} → {formatLocal(sale.ends_at)}</span>
          {sale.status === "active" && sale.active && (
            <span className="text-xs text-on-surface-variant flex items-center gap-1">
              <span className="material-symbols-outlined text-xs text-primary">timer</span>
              <Countdown endsAt={sale.ends_at} />
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="toggle" />
          <input type="hidden" name="id" value={sale.id} />
          <button type="submit" title={sale.active ? "Désactiver" : "Activer"}
            className="p-2 text-on-surface-variant hover:text-primary transition-colors">
            <span className="material-symbols-outlined text-base">{sale.active ? "visibility" : "visibility_off"}</span>
          </button>
        </fetcher.Form>
        <fetcher.Form method="post" onSubmit={(e: any) => {
          if (!confirm(`Supprimer la vente flash sur "${sale.product_name}" ?`)) e.preventDefault();
        }}>
          <input type="hidden" name="intent" value="delete" />
          <input type="hidden" name="id" value={sale.id} />
          <button type="submit" title="Supprimer"
            className="p-2 text-on-surface-variant hover:text-error transition-colors">
            <span className="material-symbols-outlined text-base">delete</span>
          </button>
        </fetcher.Form>
      </div>
    </div>
  );
}
