import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { isAdminAuthenticated } from "~/lib/admin-session.server";
import { redirect } from "@remix-run/cloudflare";

function escapeCSV(val: any): string {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(fields: any[]): string {
  return fields.map(escapeCSV).join(",");
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const authed = await isAdminAuthenticated(request, context);
  if (!authed) throw redirect("/admin/connexion");

  const db = (context.cloudflare.env as any).DB;
  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "commandes";
  const status = url.searchParams.get("status") ?? "all";
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";

  if (type === "commandes") {
    let query = "SELECT * FROM orders";
    const params: string[] = [];
    const conds: string[] = [];
    if (status !== "all") { conds.push("status = ?"); params.push(status); }
    if (from) { conds.push("date(created_at) >= ?"); params.push(from); }
    if (to) { conds.push("date(created_at) <= ?"); params.push(to); }
    if (conds.length) query += " WHERE " + conds.join(" AND ");
    query += " ORDER BY created_at DESC";

    const { results: orders } = await db.prepare(query).bind(...params).all();
    const lines: string[] = [
      row(["Référence", "Client", "Email", "Téléphone", "Statut", "Paiement", "Total CAD", "Remise CAD", "Code promo", "Méthode paiement", "Adresse", "Date"]),
    ];
    for (const o of orders as any[]) {
      let addr = "";
      try {
        const a = JSON.parse(o.shipping_address ?? "{}");
        addr = [a.line1, a.city, a.province, a.postal_code, a.country].filter(Boolean).join(", ");
      } catch { addr = o.shipping_address ?? ""; }
      lines.push(row([
        o.reference, o.customer_name, o.customer_email, o.customer_phone ?? "",
        o.status, o.payment_status ?? "", o.total_cad, o.discount_cad ?? 0,
        o.promo_code ?? "", o.payment_method ?? "", addr, o.created_at,
      ]));
    }
    const date = new Date().toISOString().slice(0, 10);
    return new Response(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="commandes-${date}.csv"`,
      },
    });
  }

  if (type === "clients") {
    const { results: clients } = await db.prepare(`
      SELECT c.id, c.email, c.name, c.phone, c.created_at,
             COUNT(o.id) as orders_count,
             COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN o.total_cad ELSE 0 END), 0) as spent
      FROM customers c
      LEFT JOIN orders o ON o.customer_email = c.email
      GROUP BY c.id ORDER BY c.created_at DESC
    `).all();
    const lines: string[] = [
      row(["Nom", "Email", "Téléphone", "Inscrit le", "Nb commandes", "Total dépensé CAD"]),
    ];
    for (const c of clients as any[]) {
      lines.push(row([c.name, c.email, c.phone ?? "", c.created_at, c.orders_count, Number(c.spent).toFixed(2)]));
    }
    const date = new Date().toISOString().slice(0, 10);
    return new Response(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="clients-${date}.csv"`,
      },
    });
  }

  if (type === "stock") {
    const { results: products } = await db.prepare(
      "SELECT name, slug, famille, texture, type_lace, longueur_po, densite, stock, price_cad, compare_at_price_cad FROM products ORDER BY famille, name"
    ).all();
    const lines: string[] = [
      row(["Produit", "Slug", "Famille", "Texture", "Lace", "Longueur (po)", "Densité (%)", "Stock", "Prix CAD", "Prix barré CAD"]),
    ];
    for (const p of products as any[]) {
      lines.push(row([p.name, p.slug, p.famille ?? "", p.texture ?? "", p.type_lace ?? "", p.longueur_po ?? "", p.densite ?? "", p.stock, p.price_cad, p.compare_at_price_cad ?? ""]));
    }
    const date = new Date().toISOString().slice(0, 10);
    return new Response(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="stock-${date}.csv"`,
      },
    });
  }

  return new Response("Type invalide", { status: 400 });
}
