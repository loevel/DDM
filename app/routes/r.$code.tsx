import { redirect } from "@remix-run/cloudflare";
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";

// Referral redirect — sets cookie and sends to boutique
export async function loader({ params, request }: LoaderFunctionArgs) {
  const code = params.code ?? "";
  const url = new URL(request.url);
  const rawNext = url.searchParams.get("to") ?? "/boutique";
  // Autoriser uniquement les URLs relatives pour éviter les redirections ouvertes
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/boutique";

  return redirect(next, {
    headers: {
      "Set-Cookie": `ddm_ref=${encodeURIComponent(code)}; Path=/; Max-Age=2592000; SameSite=Lax`,
    },
  });
}
