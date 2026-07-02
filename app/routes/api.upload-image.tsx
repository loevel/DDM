import { json } from "@remix-run/cloudflare";
import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { isAdminAuthenticated } from "~/lib/admin-session.server";
import { getCustomerId } from "~/lib/session.server";

// POST /api/upload-image
// Autorisé : admin OU client connecté (upload photos d'avis)
export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Méthode non autorisée" }, { status: 405 });
  }

  const isAdmin = await isAdminAuthenticated(request, context as any).catch(() => false);
  if (!isAdmin) {
    const customerId = await getCustomerId(request, context as any).catch(() => null);
    if (!customerId) return json({ error: "Non autorisé" }, { status: 401 });
  }

  const env = context.cloudflare.env;
  const CF_ACCOUNT_ID: string | undefined = env.CF_ACCOUNT_ID;
  const CF_ACCOUNT_HASH: string | undefined = env.CF_ACCOUNT_HASH;
  const CF_IMAGES_TOKEN: string | undefined = env.CF_IMAGES_TOKEN;

  if (!CF_ACCOUNT_ID || !CF_ACCOUNT_HASH || !CF_IMAGES_TOKEN) {
    return json(
      { error: "Cloudflare Images non configuré (CF_ACCOUNT_ID / CF_ACCOUNT_HASH / CF_IMAGES_TOKEN manquants)" },
      { status: 503 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: "Impossible de lire le formulaire" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file || typeof file === "string") {
    return json({ error: "Aucun fichier reçu" }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return json({ error: "Le fichier doit être une image" }, { status: 400 });
  }

  if (file.size > 10 * 1024 * 1024) {
    return json({ error: "Fichier trop volumineux (max 10 Mo)" }, { status: 400 });
  }

  // Transmission à l'API Cloudflare Images
  const cfForm = new FormData();
  cfForm.append("file", file, file.name);

  let cfResponse: Response;
  try {
    cfResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/images/v1`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${CF_IMAGES_TOKEN}` },
        body: cfForm,
      }
    );
  } catch (e) {
    console.error("Erreur réseau CF Images:", e);
    return json({ error: "Impossible de contacter Cloudflare Images" }, { status: 502 });
  }

  const result = (await cfResponse.json()) as {
    success: boolean;
    result?: { id: string };
    errors?: { message: string }[];
  };

  if (!result.success || !result.result?.id) {
    console.error("CF Images error:", result.errors);
    return json(
      { error: result.errors?.[0]?.message ?? "Erreur Cloudflare Images" },
      { status: 500 }
    );
  }

  const imageId = result.result.id;
  // On stocke l'URL de base sans variante — cfImage() ajoutera la variante à l'affichage
  const imageUrl = `https://imagedelivery.net/${CF_ACCOUNT_HASH}/${imageId}`;

  return json({ imageUrl, imageId });
}
