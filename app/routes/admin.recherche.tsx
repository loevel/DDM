import { json } from "@remix-run/cloudflare";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { Form, Link, useLoaderData } from "@remix-run/react";
import { useEffect, useRef } from "react";
import { cfImage } from "~/lib/images";

export const meta: MetaFunction = () => [{ title: "Recherche — Admin DDM" }];

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800", confirmed: "bg-blue-100 text-blue-800",
  shipped: "bg-purple-100 text-purple-800", delivered: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};
const STATUS_FR: Record<string, string> = {
  pending: "Attente", confirmed: "Confirmée", shipped: "Expédiée",
  delivered: "Livrée", cancelled: "Annulée",
};

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = context.cloudflare.env.DB;
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";

  // Stats globales (toujours chargées)
  const [statsProducts, statsOrders, statsClients] = await Promise.all([
    db.prepare("SELECT COUNT(*) as count FROM products WHERE stock > 0").first<{ count: number }>().catch(() => ({ count: 0 })),
    db.prepare("SELECT COUNT(*) as count FROM orders").first<{ count: number }>().catch(() => ({ count: 0 })),
    db.prepare("SELECT COUNT(*) as count FROM customers").first<{ count: number }>().catch(() => ({ count: 0 })),
  ]);

  if (q.length < 2) {
    return json({ q, products: [], orders: [], clients: [], statsProducts: statsProducts?.count ?? 0, statsOrders: statsOrders?.count ?? 0, statsClients: statsClients?.count ?? 0 });
  }

  const like = `%${q}%`;

  const [products, orders, clients] = await Promise.all([
    db.prepare("SELECT id, name, slug, price_cad, stock, famille, image_key FROM products WHERE name LIKE ? OR slug LIKE ? LIMIT 8")
      .bind(like, like).all().then((r: any) => r.results ?? []).catch(() => []),
    db.prepare("SELECT id, reference, customer_name, customer_email, total_cad, status, created_at FROM orders WHERE reference LIKE ? OR customer_name LIKE ? OR customer_email LIKE ? ORDER BY created_at DESC LIMIT 8")
      .bind(like, like, like).all().then((r: any) => r.results ?? []).catch(() => []),
    db.prepare("SELECT id, name, email, phone, created_at FROM customers WHERE name LIKE ? OR email LIKE ? OR phone LIKE ? ORDER BY created_at DESC LIMIT 8")
      .bind(like, like, like).all().then((r: any) => r.results ?? []).catch(() => []),
  ]);

  return json({
    q, products, orders, clients,
    statsProducts: statsProducts?.count ?? 0,
    statsOrders: statsOrders?.count ?? 0,
    statsClients: statsClients?.count ?? 0,
  });
}

function highlight(text: string, q: string) {
  if (!q || !text) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-primary/20 text-primary rounded-sm px-0.5 not-italic">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

export default function AdminRecherche() {
  const { q, products, orders, clients, statsProducts, statsOrders, statsClients } = useLoaderData<typeof loader>();
  const inputRef = useRef<HTMLInputElement>(null);
  const totalResults = (products as any[]).length + (orders as any[]).length + (clients as any[]).length;
  const searched = q.length >= 2;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "/" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-on-surface mb-6">Recherche globale</h1>

      {/* Barre de recherche */}
      <Form method="get" className="mb-8">
        <div className="relative">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-xl">search</span>
          <input
            ref={inputRef}
            name="q"
            autoFocus
            defaultValue={q}
            placeholder="Chercher une commande, un client, un produit… (ou appuyez / )"
            className="w-full pl-12 pr-4 py-4 text-base border border-outline-variant bg-surface focus:outline-none focus:border-primary transition-colors"
          />
        </div>
      </Form>

      {/* État initial */}
      {!searched && (
        <div>
          <div className="grid grid-cols-3 gap-4 mb-8">
            {[
              { label: "Produits", count: statsProducts, icon: "inventory_2", to: "/admin/produits" },
              { label: "Commandes", count: statsOrders, icon: "receipt_long", to: "/admin/commandes" },
              { label: "Clients", count: statsClients, icon: "group", to: "/admin/clients" },
            ].map(s => (
              <Link key={s.label} to={s.to} className="bg-surface border border-outline-variant/30 rounded p-5 hover:border-primary transition-colors group">
                <span className="material-symbols-outlined text-2xl text-on-surface-variant group-hover:text-primary transition-colors">{s.icon}</span>
                <p className="text-2xl font-bold text-on-surface mt-2">{s.count}</p>
                <p className="text-sm text-on-surface-variant">{s.label}</p>
              </Link>
            ))}
          </div>
          <div className="flex flex-col items-center py-12 text-center text-on-surface-variant">
            <span className="material-symbols-outlined text-5xl mb-3 opacity-30">manage_search</span>
            <p className="text-sm">Tapez au moins 2 caractères pour lancer la recherche.</p>
          </div>
        </div>
      )}

      {/* 0 résultats */}
      {searched && totalResults === 0 && (
        <div className="flex flex-col items-center py-16 text-center text-on-surface-variant">
          <span className="material-symbols-outlined text-5xl mb-3 opacity-30">search_off</span>
          <p className="font-semibold text-on-surface mb-1">Aucun résultat pour « {q} »</p>
          <p className="text-sm">Vérifiez l'orthographe ou essayez un terme différent.</p>
        </div>
      )}

      {/* Résultats */}
      {searched && totalResults > 0 && (
        <div className="space-y-8">

          {/* Produits */}
          {(products as any[]).length > 0 && (
            <section>
              <p className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">
                Produits ({(products as any[]).length})
              </p>
              <div className="bg-surface border border-outline-variant/30 rounded divide-y divide-outline-variant/10">
                {(products as any[]).map((p: any) => {
                  const img = cfImage(p.image_key, "thumbnail");
                  return (
                    <Link key={p.id} to={`/admin/produits/${p.id}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-surface-container transition-colors">
                      {img ? (
                        <img src={img} alt={p.name} className="w-10 h-10 object-cover rounded border border-outline-variant/30 shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded bg-surface-container-low flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined text-on-surface-variant text-base">styler</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-on-surface truncate">{highlight(p.name, q)}</p>
                        <p className="text-xs text-on-surface-variant">{p.famille} · {p.price_cad.toFixed(2)} $</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${p.stock <= 2 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                        Stock: {p.stock}
                      </span>
                      <span className="material-symbols-outlined text-base text-on-surface-variant">chevron_right</span>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* Commandes */}
          {(orders as any[]).length > 0 && (
            <section>
              <p className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">
                Commandes ({(orders as any[]).length})
              </p>
              <div className="bg-surface border border-outline-variant/30 rounded divide-y divide-outline-variant/10">
                {(orders as any[]).map((o: any) => (
                  <Link key={o.id} to={`/admin/commandes/${o.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-surface-container transition-colors">
                    <span className="material-symbols-outlined text-on-surface-variant shrink-0">receipt_long</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono font-bold text-primary">{highlight(o.reference, q)}</p>
                      <p className="text-xs text-on-surface-variant">{highlight(o.customer_name, q)} · {highlight(o.customer_email, q)}</p>
                    </div>
                    <span className="font-semibold text-sm text-on-surface shrink-0">{Number(o.total_cad).toFixed(2)} $</span>
                    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded shrink-0 ${STATUS_COLOR[o.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {STATUS_FR[o.status] ?? o.status}
                    </span>
                    <span className="material-symbols-outlined text-base text-on-surface-variant">chevron_right</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Clients */}
          {(clients as any[]).length > 0 && (
            <section>
              <p className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">
                Clients ({(clients as any[]).length})
              </p>
              <div className="bg-surface border border-outline-variant/30 rounded divide-y divide-outline-variant/10">
                {(clients as any[]).map((c: any) => (
                  <Link key={c.id} to={`/admin/clients?q=${encodeURIComponent(c.email)}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-surface-container transition-colors">
                    <span className="material-symbols-outlined text-on-surface-variant shrink-0">person</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-on-surface">{highlight(c.name, q)}</p>
                      <p className="text-xs text-on-surface-variant">{highlight(c.email, q)}{c.phone ? ` · ${c.phone}` : ""}</p>
                    </div>
                    <p className="text-xs text-on-surface-variant shrink-0">
                      {new Date(c.created_at).toLocaleDateString("fr-CA")}
                    </p>
                    <span className="material-symbols-outlined text-base text-on-surface-variant">chevron_right</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
