import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { getDB } from "~/lib/db.server";

export async function action({ request, context }: ActionFunctionArgs) {
  const { email } = await request.json();
  if (!email?.includes("@")) return Response.json({ error: "Email invalide" }, { status: 400 });
  try {
    await getDB(context).prepare("INSERT INTO newsletter (email) VALUES (?)").bind(email).run();
    return Response.json({ success: true, message: "Merci pour votre inscription !" });
  } catch (e: any) {
    if (e.message?.includes("UNIQUE")) return Response.json({ success: true, message: "Déjà inscrit." });
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
