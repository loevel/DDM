interface Env {
  CRON_SECRET: string;
}

const PAGES_URL = "https://ddmwigs.com";

export default {
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    if (!env.CRON_SECRET) {
      console.error("[mailer] CRON_SECRET manquant");
      return;
    }
    const endpoints = ["/api/send-cart-reminders", "/api/send-review-requests", "/api/send-rebuy-reminders"];
    for (const path of endpoints) {
      try {
        const res = await fetch(`${PAGES_URL}${path}`, {
          method: "POST",
          headers: {
            "x-cron-secret": env.CRON_SECRET,
            "Content-Type": "application/json",
          },
        });
        const body = await res.json() as { sent?: number; errors?: number; error?: string };
        if (!res.ok) {
          console.error(`[mailer] ${path} — Erreur ${res.status}:`, body.error ?? "inconnue");
        } else {
          console.log(`[mailer] ${path} — OK, ${body.sent ?? 0} envoyé(s), ${body.errors ?? 0} erreur(s)`);
        }
      } catch (err) {
        console.error(`[mailer] ${path} — Fetch échoué:`, err);
      }
    }
  },

  async fetch(request: Request, _env: Env): Promise<Response> {
    if (new URL(request.url).pathname === "/health") {
      return Response.json({ ok: true, service: "ddm-wigs-mailer" });
    }
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
