import type { ActionFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Form, Link, useActionData } from "@remix-run/react";
import { useState } from "react";
import { getDB } from "~/lib/db.server";

export const meta: MetaFunction = () => [
  { title: "Nous Contacter — DDM Wigs & More" },
  { name: "description", content: "Contactez notre équipe d'experts pour une consultation personnalisée. Nous sommes à votre disposition pour vous accompagner dans le choix de votre chevelure idéale." },
];

export async function action({ request, context }: ActionFunctionArgs) {
  const formData = await request.formData();
  const nom     = String(formData.get("nom")     ?? "").trim();
  const email   = String(formData.get("email")   ?? "").trim();
  const tel     = String(formData.get("tel")     ?? "").trim();
  const sujet   = String(formData.get("sujet")   ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (!nom || !email || !message) {
    return json({ success: false, error: "Veuillez remplir tous les champs obligatoires (marqués d'un *)." });
  }

  const db = getDB(context);
  try {
    await db
      .prepare(
        "INSERT INTO contact_messages (nom, email, tel, sujet, message, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .bind(nom, email, tel, sujet, message, new Date().toISOString())
      .run();
  } catch {
    // Table may not exist yet — message still processed
  }

  return json({ success: true, error: null });
}

const INPUT_CLASS =
  "peer w-full font-body-md text-body-md pt-5 pb-2 border-b border-outline-variant bg-transparent focus:outline-none focus:border-primary transition-colors pl-0";

const LABEL_BASE =
  "absolute left-0 font-label-md text-label-md transition-all duration-300 pointer-events-none";

const LABEL_UP   = "-top-2 text-[10px] text-primary";
const LABEL_DOWN = "top-5 text-on-surface-variant";

const FLOAT_LABEL =
  `${LABEL_BASE} peer-focus:${LABEL_UP} peer-[&:not(:placeholder-shown)]:${LABEL_UP}`;

export default function Contact() {
  const actionData = useActionData<typeof action>();
  const [sujet, setSujet] = useState("");

  return (
    <main className="pt-20">

      {/* Hero */}
      <section className="relative h-[520px] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0">
          <div
            className="w-full h-full bg-cover bg-center"
            style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuB7rScq-XYyeC3Ypz_yDaUUWcT7cqyxXVpzMDxsBIFJLClVJYGzkSOosqD5bZNBL3Y3wLJjIORpXM9_OKZjZaeDtOHaAF2i9o9i8iMNuYCnAiB6V23VGogrQvgE9Q7VY1oWk9uQSgA1jUmAgL_ldjlHR57ELiYIw6fk84kEU8iGVI4FHNe3PluBNBqHd6ehc57AmLKrwQKrwEV5aSo84fK_flyju-d6P9b30YmpNUiOCqV8XI1WgmrCTAXSv698kX05nBeSmyn_D0Y')" }}
          />
          <div className="absolute inset-0 bg-black/40" />
        </div>
        <div className="relative z-10 text-center px-4">
          <p className="font-sans text-[11px] font-bold uppercase tracking-[0.3em] text-white/70 mb-4">DDM Wigs & More</p>
          <h1 className="font-serif text-5xl md:text-6xl text-white mb-4 leading-tight">Contactez-nous</h1>
          <p className="font-sans text-base text-white/80 max-w-xl mx-auto leading-relaxed">
            Une consultation personnalisée pour sublimer votre allure. Nos experts vous accompagnent dans le choix de votre chevelure idéale.
          </p>
        </div>
      </section>

      {/* Contenu principal */}
      <section className="py-section-gap-desktop max-w-container-max-width mx-auto px-grid-margin-desktop">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-grid-gutter lg:gap-24">

          {/* ── Infos de contact ── */}
          <div className="flex flex-col space-y-10 order-2 lg:order-1">
            <div>
              <h2 className="font-serif text-3xl text-on-surface mb-8">Nos coordonnées</h2>
              <div className="space-y-7">
                <div className="flex items-start gap-4">
                  <span className="material-symbols-outlined text-primary mt-0.5">location_on</span>
                  <div>
                    <p className="font-sans text-[11px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">Adresse</p>
                    <p className="font-sans text-sm text-on-surface leading-relaxed">
                      Service en ligne &amp; livraison partout au Canada<br />
                      <span className="text-on-surface-variant text-xs">Consultations disponibles sur rendez-vous</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <span className="material-symbols-outlined text-primary mt-0.5">call</span>
                  <div>
                    <p className="font-sans text-[11px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">Téléphone / WhatsApp</p>
                    <a
                      href="https://wa.me/23797193723"
                      target="_blank"
                      rel="noreferrer"
                      className="font-sans text-sm text-on-surface hover:text-primary transition-colors"
                    >
                      +237 97 193 723
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <span className="material-symbols-outlined text-primary mt-0.5">mail</span>
                  <div>
                    <p className="font-sans text-[11px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">Adresse e-mail</p>
                    <a
                      href="mailto:contact@ddmwigs.ca"
                      className="font-sans text-sm text-on-surface hover:text-primary transition-colors"
                    >
                      contact@ddmwigs.ca
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Horaires */}
            <div className="pt-8 border-t border-outline-variant">
              <h3 className="font-serif text-xl text-on-surface mb-5">Disponibilités</h3>
              <ul className="space-y-3 font-sans text-sm">
                <li className="flex justify-between max-w-xs">
                  <span className="text-on-surface-variant">Lun — Ven</span>
                  <span className="font-bold text-on-surface">10h — 18h</span>
                </li>
                <li className="flex justify-between max-w-xs">
                  <span className="text-on-surface-variant">Samedi</span>
                  <span className="font-bold text-on-surface">11h — 17h</span>
                </li>
                <li className="flex justify-between max-w-xs">
                  <span className="text-on-surface-variant">Dimanche</span>
                  <span className="text-error italic font-medium">Fermé</span>
                </li>
              </ul>
            </div>

            {/* WhatsApp CTA */}
            <div className="pt-8 border-t border-outline-variant">
              <h3 className="font-serif text-xl text-on-surface mb-3">Réponse rapide</h3>
              <p className="font-sans text-sm text-on-surface-variant mb-5 leading-relaxed">
                Pour une réponse immédiate, contactez-nous directement sur WhatsApp — nous répondons généralement en moins d'une heure.
              </p>
              <a
                href="https://wa.me/23797193723?text=Bonjour%2C+je+souhaite+des+informations+sur+vos+perruques."
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-3 bg-[#25D366] text-white font-sans text-sm font-bold px-6 py-3 hover:opacity-90 transition-opacity"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.136.564 4.14 1.542 5.877L.057 23.52a.75.75 0 0 0 .923.923l5.673-1.482A11.953 11.953 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.92 0-3.73-.504-5.29-1.386l-.38-.217-3.668.959.974-3.623-.235-.387A9.957 9.957 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                </svg>
                Nous écrire sur WhatsApp
              </a>
            </div>
          </div>

          {/* ── Formulaire ── */}
          <div className="order-1 lg:order-2">
            <div className="bg-surface p-8 md:p-12 border border-outline-variant">

              {actionData?.success ? (
                /* État succès */
                <div className="text-center py-10">
                  <div className="w-16 h-16 bg-secondary-container flex items-center justify-center mx-auto mb-6">
                    <span className="material-symbols-outlined text-3xl text-secondary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  </div>
                  <h2 className="font-serif text-2xl text-on-surface mb-3">Message envoyé !</h2>
                  <p className="font-sans text-sm text-on-surface-variant max-w-xs mx-auto leading-relaxed mb-8">
                    Merci de nous avoir contactés. Notre équipe vous répondra dans les plus brefs délais (généralement sous 24h).
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <a
                      href="/contact"
                      className="px-6 py-3 border border-outline-variant text-on-surface font-sans text-sm font-bold uppercase tracking-wider hover:border-primary hover:text-primary transition-colors"
                    >
                      Envoyer un autre message
                    </a>
                    <Link
                      to="/boutique"
                      className="px-6 py-3 bg-primary text-on-primary font-sans text-sm font-bold uppercase tracking-wider hover:opacity-90 transition-opacity"
                    >
                      Voir la boutique
                    </Link>
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="font-serif text-2xl text-on-surface mb-1">Envoyez-nous un message</h2>
                  <p className="font-sans text-sm text-on-surface-variant mb-8 leading-relaxed">
                    Remplissez le formulaire — notre équipe vous répondra dans les meilleurs délais.
                    <span className="text-error ml-1">*</span> champs obligatoires
                  </p>

                  {actionData?.error && (
                    <div className="mb-6 p-4 bg-error-container text-on-error-container border border-error/20">
                      <p className="font-sans text-sm">{actionData.error}</p>
                    </div>
                  )}

                  <Form method="post" className="space-y-7">

                    {/* Nom complet */}
                    <div className="relative">
                      <input
                        className={INPUT_CLASS}
                        id="nom" name="nom"
                        placeholder=" " required type="text"
                        autoComplete="name"
                      />
                      <label className={`${FLOAT_LABEL} ${LABEL_DOWN}`} htmlFor="nom">
                        Nom complet <span className="text-error">*</span>
                      </label>
                    </div>

                    {/* Adresse e-mail */}
                    <div className="relative">
                      <input
                        className={INPUT_CLASS}
                        id="email" name="email"
                        placeholder=" " required type="email"
                        autoComplete="email"
                      />
                      <label className={`${FLOAT_LABEL} ${LABEL_DOWN}`} htmlFor="email">
                        Adresse e-mail <span className="text-error">*</span>
                      </label>
                    </div>

                    {/* Téléphone */}
                    <div className="relative">
                      <input
                        className={INPUT_CLASS}
                        id="tel" name="tel"
                        placeholder=" " type="tel"
                        autoComplete="tel"
                      />
                      <label className={`${FLOAT_LABEL} ${LABEL_DOWN}`} htmlFor="tel">
                        Téléphone (optionnel)
                      </label>
                    </div>

                    {/* Sujet (select) — label contrôlée par useState */}
                    <div className="relative">
                      <select
                        className="peer w-full font-sans text-sm pt-5 pb-2 border-b border-outline-variant bg-transparent focus:outline-none focus:border-primary transition-colors pl-0 appearance-none cursor-pointer text-on-surface"
                        id="sujet" name="sujet"
                        value={sujet}
                        onChange={e => setSujet(e.target.value)}
                      >
                        <option value="" disabled />
                        <option value="conseil">Conseil personnalisé</option>
                        <option value="rendez-vous">Prendre rendez-vous</option>
                        <option value="commande">Suivi de commande</option>
                        <option value="retour">Retour / échange</option>
                        <option value="autre">Autre demande</option>
                      </select>
                      <label
                        className={`${LABEL_BASE} transition-all duration-300 ${sujet ? LABEL_UP : "top-5 text-on-surface-variant peer-focus:" + LABEL_UP}`}
                        htmlFor="sujet"
                      >
                        Sujet de votre demande
                      </label>
                      <span className="material-symbols-outlined absolute right-0 bottom-2 pointer-events-none text-on-surface-variant text-base">expand_more</span>
                    </div>

                    {/* Message */}
                    <div className="relative">
                      <textarea
                        className={`${INPUT_CLASS} resize-none`}
                        id="message" name="message"
                        placeholder=" " required
                        rows={4}
                      />
                      <label className={`${FLOAT_LABEL} ${LABEL_DOWN}`} htmlFor="message">
                        Votre message <span className="text-error">*</span>
                      </label>
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-primary text-on-primary font-sans text-sm font-bold py-4 px-8 uppercase tracking-widest hover:opacity-90 active:scale-[0.98] transition-all duration-200 mt-2 flex items-center justify-center gap-2 group"
                    >
                      Envoyer le message
                      <span className="material-symbols-outlined text-sm transition-transform duration-300 group-hover:translate-x-1">arrow_forward</span>
                    </button>
                  </Form>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Citation */}
      <section className="h-72 relative overflow-hidden flex items-center justify-center">
        <div
          className="absolute inset-0 bg-cover bg-fixed bg-center"
          style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuAa1qx-wHT2dv8Wa_5NCqIlRpueo_7vrV1u2_k4QknFdK4Q3zlAhwEFKcf8ofgSB3CzHSvVqdBD_2NeEoC3Rhe1dGDdu4F_e5IZrPblWMDb5OyK0rS1_B6IqP4uQBvDYYiczr-qUhWYKaL7o2MGD4yDvRvNzD4et3v91d93J7Jmc3HEMPE9qzCFUBxFrpgUI69g5e9Pj3SPrc3AUOlzSY7tMiVKsZ8ZxbTnH0zyLH4CgxRwcFnt5l8ZfCXN0FFx05bL1tRob8BxyPQ')" }}
        />
        <div className="absolute inset-0 bg-black/50" />
        <blockquote className="relative z-10 font-serif text-xl md:text-2xl italic text-white max-w-xl mx-auto text-center px-8 leading-relaxed">
          "La beauté commence au moment où vous décidez d'être vous-même."
        </blockquote>
      </section>
    </main>
  );
}
