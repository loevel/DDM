import type { LoaderFunctionArgs } from "@remix-run/cloudflare";

// Fichier de vérification Apple Pay requis par Stripe
// Servi à : /.well-known/apple-developer-merchantid-domain-association
export async function loader(_: LoaderFunctionArgs) {
  const res = await fetch(
    "https://stripe.com/files/apple-pay/apple-developer-merchantid-domain-association"
  );
  const body = await res.text();
  return new Response(body, {
    headers: { "Content-Type": "application/octet-stream" },
  });
}
