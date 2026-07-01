import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { isAdminAuthenticated } from "~/lib/admin-session.server";
import { redirect } from "@remix-run/cloudflare";
import { getDB } from "~/lib/db.server";

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

function csvResponse(lines: string[], filename: string): Response {
  // BOM UTF-8 pour que Excel reconnaisse les accents correctement
  const bom = "﻿";
  return new Response(bom + lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const authed = await isAdminAuthenticated(request, context);
  if (!authed) throw redirect("/admin/connexion");

  const db = getDB(context as any);
  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "commandes";
  const status = url.searchParams.get("status") ?? "all";
  const search = url.searchParams.get("q") ?? "";
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const date = new Date().toISOString().slice(0, 10);

  if (type === "commandes") {
    let query = "SELECT * FROM orders";
    const params: any[] = [];
    const conds: string[] = [];
    if (status !== "all") { conds.push("status = ?"); params.push(status); }
    if (search) { conds.push("(reference LIKE ? OR customer_name LIKE ? OR customer_email LIKE ?)"); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (from) { conds.push("date(created_at) >= ?"); params.push(from); }
    if (to) { conds.push("date(created_at) <= ?"); params.push(to); }
    if (conds.length) query += " WHERE " + conds.join(" AND ");
    query += " ORDER BY created_at DESC";

    const { results: orders } = await db.prepare(query).bind(...params).all<any>();
    const lines: string[] = [
      row(["Référence", "Client", "Email", "Téléphone", "Statut", "Paiement", "Total CAD", "Remise CAD", "Code promo", "Méthode paiement", "Adresse", "Date"]),
    ];
    for (const o of orders) {
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
    return csvResponse(lines, `commandes-${date}.csv`);
  }

  if (type === "clients") {
    const { results: clients } = await db.prepare(`
      SELECT c.id, c.email, c.name, c.phone, c.created_at, c.statut,
             COUNT(DISTINCT o.id) as orders_count,
             COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN o.total_cad ELSE 0 END), 0) as spent,
             MAX(o.created_at) as derniere_commande
      FROM customers c
      LEFT JOIN orders o ON o.customer_email = c.email
      GROUP BY c.id ORDER BY c.created_at DESC
    `).all<any>();
    const lines: string[] = [
      row(["Nom", "Email", "Téléphone", "Statut", "Inscrit le", "Dernière commande", "Nb commandes", "Total dépensé CAD"]),
    ];
    for (const c of clients) {
      lines.push(row([
        c.name, c.email, c.phone ?? "", c.statut ?? "actif",
        c.created_at, c.derniere_commande ?? "",
        c.orders_count, Number(c.spent).toFixed(2),
      ]));
    }
    return csvResponse(lines, `clients-${date}.csv`);
  }

  if (type === "stock") {
    // Produits principaux
    const { results: products } = await db.prepare(
      `SELECT p.id, p.name, p.slug, p.famille, p.texture, p.type_lace, p.longueur_po, p.densite,
              p.stock, p.price_cad, p.compare_at_price_cad,
              f.nom as fournisseur_nom
       FROM products p
       LEFT JOIN fournisseurs f ON f.id = p.fournisseur_id
       ORDER BY p.famille, p.name`
    ).all<any>();

    // Déclinaisons
    const { results: variants } = await db.prepare(
      `SELECT pv.product_id, pv.name as variant_name, pv.stock as variant_stock,
              pv.price_adjustment_cad, pv.sku
       FROM product_variants pv ORDER BY pv.product_id`
    ).all<any>();

    const variantsByProduct = new Map<number, any[]>();
    for (const v of variants) {
      if (!variantsByProduct.has(v.product_id)) variantsByProduct.set(v.product_id, []);
      variantsByProduct.get(v.product_id)!.push(v);
    }

    const lines: string[] = [
      row(["Produit", "Déclinaison", "SKU", "Famille", "Texture", "Lace", "Longueur (po)", "Densité (%)", "Stock", "Prix CAD", "Prix barré CAD", "Fournisseur"]),
    ];
    for (const p of products) {
      const pvs = variantsByProduct.get(p.id) ?? [];
      if (pvs.length === 0) {
        lines.push(row([p.name, "", "", p.famille ?? "", p.texture ?? "", p.type_lace ?? "", p.longueur_po ?? "", p.densite ?? "", p.stock, p.price_cad, p.compare_at_price_cad ?? "", p.fournisseur_nom ?? ""]));
      } else {
        for (const v of pvs) {
          lines.push(row([
            p.name, v.variant_name, v.sku ?? "",
            p.famille ?? "", p.texture ?? "", p.type_lace ?? "",
            p.longueur_po ?? "", p.densite ?? "",
            v.variant_stock, Number(p.price_cad) + Number(v.price_adjustment_cad || 0),
            p.compare_at_price_cad ?? "", p.fournisseur_nom ?? "",
          ]));
        }
      }
    }
    return csvResponse(lines, `stock-${date}.csv`);
  }

  if (type === "achats") {
    const { results: achats } = await db.prepare(`
      SELECT cf.reference, cf.date_commande, cf.statut,
             f.nom as fournisseur_nom,
             cf.frais_expedition_usd, cf.frais_douane_cad, cf.taux_change,
             cf.notes,
             COALESCE(SUM(cfi.quantite_commandee * cfi.prix_unitaire_usd), 0) as montant_articles_usd
      FROM commandes_fournisseurs cf
      LEFT JOIN fournisseurs f ON f.id = cf.fournisseur_id
      LEFT JOIN commandes_fournisseurs_items cfi ON cfi.commande_id = cf.id
      GROUP BY cf.id ORDER BY cf.date_commande DESC
    `).all<any>();

    const TAUX = 1.38;
    const lines: string[] = [
      row(["Référence", "Fournisseur", "Date", "Statut", "Articles USD", "Expédition USD", "Douane CAD", "Taux", "Total CAD", "Notes"]),
    ];
    for (const a of achats) {
      const taux = a.taux_change ?? TAUX;
      const totalCAD = (Number(a.montant_articles_usd) + Number(a.frais_expedition_usd ?? 0)) * taux + Number(a.frais_douane_cad ?? 0);
      lines.push(row([
        a.reference, a.fournisseur_nom ?? "", a.date_commande, a.statut,
        Number(a.montant_articles_usd).toFixed(2),
        Number(a.frais_expedition_usd ?? 0).toFixed(2),
        Number(a.frais_douane_cad ?? 0).toFixed(2),
        taux, totalCAD.toFixed(2), a.notes ?? "",
      ]));
    }
    return csvResponse(lines, `achats-${date}.csv`);
  }

  return new Response("Type invalide", { status: 400 });
}
