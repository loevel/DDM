import { json } from "@remix-run/cloudflare";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { Form, Link, useLoaderData } from "@remix-run/react";
import { getCustomerId } from "~/lib/session.server";
import { cfImage } from "~/lib/images";

export const meta: MetaFunction = () => [{ title: "Mes favoris — DDM Wigs & More" }];

export async function loader({ request, context }: LoaderFunctionArgs) {
  const customerId = (await getCustomerId(request, context))!;
  const db = context.cloudflare.env.DB;

  const { results } = await db.prepare(`
    SELECT p.*, w.id as wishlist_id, w.created_at as saved_at
    FROM wishlists w
    JOIN products p ON p.id = w.product_id
    WHERE w.customer_id = ?
    ORDER BY w.created_at DESC
  `).bind(customerId).all();

  return json({ favoris: results ?? [] });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const customerId = (await getCustomerId(request, context))!;
  const f = await request.formData();
  const intent = String(f.get("intent") ?? "");
  const productId = String(f.get("product_id") ?? "");
  const db = context.cloudflare.env.DB;

  if (intent === "remove") {
    await db.prepare("DELETE FROM wishlists WHERE customer_id = ? AND product_id = ?")
      .bind(customerId, productId).run();
  }

  return json({ ok: true });
}

export default function Favoris() {
  const { favoris } = useLoaderData<typeof loader>();
  const fs = favoris as any[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline-lg text-headline-lg text-on-surface mb-1">Mes favoris</h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          {fs.length} produit{fs.length !== 1 ? "s" : ""} sauvegardé{fs.length !== 1 ? "s" : ""}
        </p>
      </div>

      {fs.length === 0 ? (
        <div className="bg-surface border border-outline-variant/30 px-6 py-16 text-center">
          <span className="material-symbols-outlined text-5xl text-outline-variant mb-4 block">favorite</span>
          <p className="font-body-md text-body-md text-on-surface-variant mb-2">Aucun favori pour l'instant.</p>
          <p className="text-sm text-on-surface-variant/70 mb-6">Cliquez sur le ♡ sur une fiche produit pour sauvegarder.</p>
          <Link to="/boutique" className="font-label-md text-label-md text-primary border-b border-primary hover:opacity-70 transition-opacity">
            Explorer la boutique →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {fs.map(p => (
            <div key={p.id} className="bg-surface border border-outline-variant/30 group overflow-hidden">
              <div className="relative aspect-[4/5] overflow-hidden bg-surface-container">
                {p.image_key ? (
                  <img src={cfImage(p.image_key, "card") ?? p.image_key} alt={p.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="material-symbols-outlined text-4xl text-outline-variant">styler</span>
                  </div>
                )}
                <Form method="post" className="absolute top-3 right-3">
                  <input type="hidden" name="intent" value="remove" />
                  <input type="hidden" name="product_id" value={p.id} />
                  <button type="submit" title="Retirer des favoris"
                    className="w-9 h-9 bg-white/90 backdrop-blur-sm flex items-center justify-center hover:bg-error hover:text-on-error transition-colors">
                    <span className="material-symbols-outlined text-lg text-error" style={{ fontVariationSettings: "'FILL' 1" }}>favorite</span>
                  </button>
                </Form>
                {p.stock === 0 && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <span className="bg-error text-on-error text-xs font-bold px-3 py-1 uppercase tracking-wider">Rupture de stock</span>
                  </div>
                )}
              </div>
              <div className="p-4">
                <p className="text-xs text-on-surface-variant uppercase tracking-wider mb-1">{p.famille ?? "Perruque"}</p>
                <h3 className="font-semibold text-on-surface text-sm mb-2 leading-snug">{p.name}</h3>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-primary">{Number(p.price_cad).toFixed(2)} $</span>
                  <Link to={`/boutique/${p.slug}`}
                    className="text-xs font-semibold text-on-surface-variant hover:text-primary border-b border-outline-variant hover:border-primary transition-colors pb-0.5">
                    Voir le produit →
                  </Link>
                </div>
                <p className="text-[10px] text-on-surface-variant/60 mt-2">
                  Ajouté le {new Date(p.saved_at).toLocaleDateString("fr-CA", { day: "numeric", month: "long" })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
