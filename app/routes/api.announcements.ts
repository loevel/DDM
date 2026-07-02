import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";

export async function loader({ context }: LoaderFunctionArgs) {
  try {
    const { results } = await context.cloudflare.env.DB
      .prepare("SELECT * FROM announcements WHERE active = 1 ORDER BY position ASC, id ASC")
      .all();
    return json({ announcements: results ?? [] });
  } catch {
    return json({ announcements: [] });
  }
}
