import { redirect } from "@remix-run/cloudflare";
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { clearSessionCookie, destroySession, getSessionId } from "~/lib/session.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const sessionId = getSessionId(request);
  if (sessionId) {
    await destroySession(sessionId, context);
  }
  throw redirect("/", {
    headers: { "Set-Cookie": clearSessionCookie() },
  });
}

export default function Deconnexion() {
  return null;
}
