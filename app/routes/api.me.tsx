import { json } from "@remix-run/cloudflare";
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getCustomerId } from "~/lib/session.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const customerId = await getCustomerId(request, context);
  if (!customerId) return json(null, { status: 401 });

  const db = context.cloudflare.env.DB;

  const customer = await db
    .prepare("SELECT id, email, name, phone FROM customers WHERE id = ?")
    .bind(customerId)
    .first<{ id: string; email: string; name: string | null; phone: string | null }>();

  if (!customer) return json(null, { status: 401 });

  const address = await db
    .prepare(
      `SELECT street, city, province, postal_code
       FROM customer_addresses
       WHERE customer_id = ?
       ORDER BY is_default DESC, created_at DESC
       LIMIT 1`
    )
    .bind(customerId)
    .first<{ street: string; city: string; province: string; postal_code: string }>();

  return json({
    name: customer.name ?? "",
    email: customer.email,
    phone: customer.phone ?? "",
    address: address ?? null,
  });
}
