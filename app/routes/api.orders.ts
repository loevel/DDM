import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/react";
import { getDB } from "~/lib/db.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const ref = new URL(request.url).searchParams.get("ref");
  if (!ref) return Response.json({ error: "Référence requise" }, { status: 400 });
  const db = getDB(context);
  const order = await db.prepare("SELECT * FROM orders WHERE reference = ?").bind(ref).first();
  if (!order) return Response.json({ error: "Commande introuvable" }, { status: 404 });
  const { results: items } = await db.prepare("SELECT * FROM order_items WHERE order_id = ?").bind((order as any).id).all();
  return Response.json({ order: { ...order, items } });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const { name, email, phone, type, items, notes } = await request.json<any>();
  if (!name || !email || !type || !items?.length) return Response.json({ error: "Données incomplètes" }, { status: 400 });

  const db = getDB(context);
  const ref = "DDM-" + Date.now().toString(36).toUpperCase();
  const total = items.reduce((s: number, i: any) => s + i.unit_price_cad * (i.quantity || 1), 0);

  const order = await db.prepare(
    "INSERT INTO orders (reference, customer_name, customer_email, customer_phone, type, total_cad, notes) VALUES (?,?,?,?,?,?,?) RETURNING *"
  ).bind(ref, name, email, phone || null, type, total, notes || null).first();

  for (const item of items) {
    await db.prepare(
      "INSERT INTO order_items (order_id, product_id, rental_id, quantity, unit_price_cad, rental_days) VALUES (?,?,?,?,?,?)"
    ).bind((order as any).id, item.product_id || null, item.rental_id || null, item.quantity || 1, item.unit_price_cad, item.rental_days || null).run();
  }

  return Response.json({ order }, { status: 201 });
}
