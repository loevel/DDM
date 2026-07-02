import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDB } from "~/lib/db.server";

export async function loader({ context }: LoaderFunctionArgs) {
  try {
    const db = getDB(context);
    const { results } = await db.prepare(
      "SELECT id, name, slug FROM collections WHERE active = 1 ORDER BY position ASC, id ASC"
    ).all<{ id: number; name: string; slug: string }>();
    return json({ collections: results ?? [] });
  } catch {
    return json({ collections: [] });
  }
}
