import { redirect } from "@remix-run/cloudflare";
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";

// Referral redirect — sets cookie and sends to boutique
export async function loader({ params, request }: LoaderFunctionArgs) {
  const code = params.code ?? "";
  const url = new URL(request.url);
  const next = url.searchParams.get("to") ?? "/boutique";

  return redirect(next, {
    headers: {
      "Set-Cookie": `ddm_ref=${encodeURIComponent(code)}; Path=/; Max-Age=2592000; SameSite=Lax`,
    },
  });
}
