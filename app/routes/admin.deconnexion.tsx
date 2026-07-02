import { redirect } from "@remix-run/cloudflare";
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { clearAdminCookie, destroyAdminSession, getAdminSessionId } from "~/lib/admin-session.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const sid = getAdminSessionId(request);
  if (sid) await destroyAdminSession(sid, context);
  throw redirect("/admin/connexion", { headers: { "Set-Cookie": clearAdminCookie() } });
}
export default function AdminDeconnexion() { return null; }
