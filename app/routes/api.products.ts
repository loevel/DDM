import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getDB, getProducts } from "~/lib/db.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const db = getDB(context);
  const products = await getProducts(db, {
    category: url.searchParams.get("category") ?? undefined,
    featured: url.searchParams.get("featured") === "1",
    search: url.searchParams.get("q") ?? undefined,
  });
  return Response.json({ products });
}
