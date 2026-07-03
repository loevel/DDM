import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { isAdminAuthenticated } from "~/lib/admin-session.server";
import { getCustomer } from "~/lib/auth.server";
import { getCustomerId } from "~/lib/session.server";

interface OrderRow {
  id: number;
  reference: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  type: string;
  total_cad: number;
  tps_cad: number;
  tvq_cad: number;
  status: string;
  notes: string | null;
  created_at: string;
}

interface ItemRow {
  product_name: string;
  quantity: number;
  unit_price_cad: number;
  rental_days: number | null;
}

// Couleurs de marque
const DARK = rgb(0.102, 0.102, 0.102);   // #1a1a1a
const GOLD = rgb(0.788, 0.663, 0.431);   // #c9a96e
const GRAY = rgb(0.4, 0.4, 0.4);
const LIGHT = rgb(0.94, 0.94, 0.94);
const WHITE = rgb(1, 1, 1);

const fmt = (n: number) =>
  n.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric" });

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  const db = context.cloudflare.env.DB;

  const order = await db
    .prepare("SELECT * FROM orders WHERE reference = ?")
    .bind(params.ref)
    .first<OrderRow>();

  if (!order) throw new Response("Commande introuvable", { status: 404 });

  // Vérification accès : admin OU client propriétaire
  const isAdmin = await isAdminAuthenticated(request, context);
  if (!isAdmin) {
    const customerId = await getCustomerId(request, context);
    if (!customerId) throw new Response("Non autorisé", { status: 401 });
    const customer = await getCustomer(customerId, context);
    if (!customer || customer.email.toLowerCase() !== order.customer_email.toLowerCase()) {
      throw new Response("Non autorisé", { status: 403 });
    }
  }

  const { results: items } = await db.prepare(`
    SELECT
      COALESCE(p.name, 'Produit') as product_name,
      oi.quantity,
      oi.unit_price_cad,
      oi.rental_days
    FROM order_items oi
    LEFT JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = ?
  `).bind(order.id).all<ItemRow>();

  // Infos boutique depuis site_settings
  const { results: settings } = await db
    .prepare("SELECT key, value FROM site_settings WHERE key IN ('contact_email','whatsapp_number')")
    .all<{ key: string; value: string }>();
  const siteEmail = settings.find(s => s.key === "contact_email")?.value ?? "contact@ddmwigs.ca";

  // ── Génération PDF ──────────────────────────────────────────────────────────

  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]); // Letter
  const { width, height } = page.getSize();

  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const oblique = await doc.embedFont(StandardFonts.HelveticaOblique);

  const M = 50; // marge

  // ── Bande d'en-tête ────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: height - 75, width, height: 75, color: DARK });

  page.drawText("DDM WIGS & MORE", {
    x: M, y: height - 42, font: bold, size: 18, color: GOLD,
  });
  page.drawText("ddmwigs.com", {
    x: M, y: height - 60, font: regular, size: 9, color: rgb(0.7, 0.7, 0.7),
  });

  // Badge reçu (coin droit)
  page.drawText("REÇU DE COMMANDE", {
    x: width - M - 130, y: height - 46, font: bold, size: 10, color: WHITE,
  });

  // ── Référence + date ───────────────────────────────────────────────────────
  let y = height - 110;

  page.drawText(`Commande n°`, { x: M, y, font: regular, size: 9, color: GRAY });
  page.drawText(order.reference, { x: M + 75, y, font: bold, size: 9, color: DARK });

  page.drawText(`Date :`, { x: M, y: y - 16, font: regular, size: 9, color: GRAY });
  page.drawText(fmtDate(order.created_at), { x: M + 75, y: y - 16, font: regular, size: 9, color: DARK });

  page.drawText(`Type :`, { x: M, y: y - 32, font: regular, size: 9, color: GRAY });
  page.drawText(order.type === "rental" ? "Location" : "Achat", {
    x: M + 75, y: y - 32, font: regular, size: 9, color: DARK,
  });

  // Infos client (colonne droite)
  const cx = width / 2 + 20;
  page.drawText("Facturé à :", { x: cx, y, font: bold, size: 9, color: GRAY });
  page.drawText(order.customer_name, { x: cx, y: y - 16, font: bold, size: 10, color: DARK });
  page.drawText(order.customer_email, { x: cx, y: y - 30, font: regular, size: 9, color: GRAY });
  if (order.customer_phone) {
    page.drawText(order.customer_phone, { x: cx, y: y - 44, font: regular, size: 9, color: GRAY });
  }

  // ── Séparateur ─────────────────────────────────────────────────────────────
  y -= 65;
  page.drawLine({ start: { x: M, y }, end: { x: width - M, y }, thickness: 0.5, color: LIGHT });

  // ── En-tête tableau articles ───────────────────────────────────────────────
  y -= 18;
  page.drawRectangle({ x: M, y: y - 4, width: width - 2 * M, height: 20, color: DARK });

  const colDesc = M + 6;
  const colQty = width - M - 140;
  const colUnit = width - M - 80;
  const colTotal = width - M - 6;

  page.drawText("DESCRIPTION", { x: colDesc, y: y + 1, font: bold, size: 8, color: GOLD });
  page.drawText("QTÉ", { x: colQty, y: y + 1, font: bold, size: 8, color: GOLD });
  page.drawText("PRIX UNIT.", { x: colUnit - 40, y: y + 1, font: bold, size: 8, color: GOLD });
  page.drawText("TOTAL", { x: colTotal - 26, y: y + 1, font: bold, size: 8, color: GOLD });

  // ── Lignes articles ────────────────────────────────────────────────────────
  y -= 20;
  let subtotal = 0;

  for (let i = 0; i < (items ?? []).length; i++) {
    const item = (items ?? [])[i];
    const lineTotal = item.unit_price_cad * item.quantity;
    subtotal += lineTotal;

    if (i % 2 === 0) {
      page.drawRectangle({
        x: M, y: y - 5, width: width - 2 * M, height: 20,
        color: rgb(0.97, 0.97, 0.97),
      });
    }

    // Troncature du nom si trop long
    const maxChars = 45;
    const name = item.product_name.length > maxChars
      ? item.product_name.slice(0, maxChars - 1) + "…"
      : item.product_name;
    const label = item.rental_days ? `${name} (${item.rental_days} j)` : name;

    page.drawText(label, { x: colDesc, y: y + 1, font: regular, size: 9, color: DARK });
    page.drawText(String(item.quantity), { x: colQty + 6, y: y + 1, font: regular, size: 9, color: DARK });
    page.drawText(fmt(item.unit_price_cad), { x: colUnit - 40, y: y + 1, font: regular, size: 9, color: DARK });
    page.drawText(fmt(lineTotal), { x: colTotal - fmt(lineTotal).length * 5.2, y: y + 1, font: regular, size: 9, color: DARK });

    y -= 20;
  }

  // ── Séparateur ─────────────────────────────────────────────────────────────
  y -= 6;
  page.drawLine({ start: { x: M, y }, end: { x: width - M, y }, thickness: 0.5, color: LIGHT });

  // ── Totaux ─────────────────────────────────────────────────────────────────
  y -= 18;
  const labelX = width - M - 130;
  const valueX = width - M;

  const drawTotal = (label: string, value: string, isMain = false) => {
    page.drawText(label, {
      x: labelX, y, font: isMain ? bold : regular,
      size: isMain ? 10 : 9, color: isMain ? DARK : GRAY,
    });
    page.drawText(value, {
      x: valueX - value.length * (isMain ? 6.2 : 5.2), y,
      font: isMain ? bold : regular,
      size: isMain ? 10 : 9, color: isMain ? DARK : GRAY,
    });
    y -= isMain ? 0 : 16;
  };

  const discount = subtotal - order.total_cad + (order.tps_cad ?? 0) + (order.tvq_cad ?? 0);
  if (Math.abs(discount) > 0.01) {
    drawTotal("Sous-total :", fmt(subtotal));
    drawTotal("Rabais :", `- ${fmt(discount)}`);
  }

  if ((order.tps_cad ?? 0) > 0 || (order.tvq_cad ?? 0) > 0) {
    drawTotal("TPS :", fmt(order.tps_cad ?? 0));
    drawTotal("TVQ :", fmt(order.tvq_cad ?? 0));
  }

  // Ligne TOTAL
  y -= 8;
  page.drawLine({ start: { x: labelX, y }, end: { x: width - M, y }, thickness: 0.5, color: DARK });
  y -= 14;
  drawTotal("TOTAL :", fmt(order.total_cad), true);

  // ── Note si présente ───────────────────────────────────────────────────────
  if (order.notes) {
    y -= 30;
    page.drawText("Note :", { x: M, y, font: bold, size: 9, color: GRAY });
    page.drawText(order.notes.slice(0, 80), { x: M + 40, y, font: oblique, size: 9, color: GRAY });
  }

  // ── Pied de page ───────────────────────────────────────────────────────────
  const footerY = 55;
  page.drawLine({
    start: { x: M, y: footerY + 20 },
    end: { x: width - M, y: footerY + 20 },
    thickness: 0.5, color: LIGHT,
  });

  page.drawText("DDM Wigs & More  ·  Montréal, Québec, Canada", {
    x: M, y: footerY + 6, font: regular, size: 8, color: GRAY,
  });
  page.drawText(siteEmail, {
    x: M, y: footerY - 6, font: regular, size: 8, color: GRAY,
  });
  page.drawText("Aucune taxe applicable", {
    x: width - M - 110, y: footerY + 6, font: oblique, size: 8, color: GRAY,
  });
  page.drawText(`Document généré le ${fmtDate(new Date().toISOString())}`, {
    x: width - M - 140, y: footerY - 6, font: regular, size: 8, color: GRAY,
  });

  // ── Retour ─────────────────────────────────────────────────────────────────
  const pdfBytes = await doc.save();

  return new Response(pdfBytes.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="recu-${order.reference}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
