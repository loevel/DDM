import { Link } from "@remix-run/react";
import { useState } from "react";

function FooterNewsletter() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@") || state === "loading") return;
    setState("loading");
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="max-w-[90rem] mx-auto px-10 lg:px-20 py-10 border-b border-[#d4c4b7]/50">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div>
          <h4 className="font-serif text-xl text-on-surface mb-1">Rejoignez le Cercle Privé</h4>
          <p className="font-sans text-sm text-on-surface-variant">
            Nouveautés, conseils capillaires et offres exclusives — directement dans votre boîte courriel.
          </p>
        </div>
        {state === "done" ? (
          <p className="flex items-center gap-2 font-sans text-sm text-secondary font-semibold">
            <span className="material-symbols-outlined text-lg">check_circle</span>
            Merci pour votre inscription !
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 md:min-w-[24rem]">
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="votre@courriel.com"
              aria-label="Adresse courriel"
              className="flex-grow bg-transparent border-0 border-b border-outline focus:ring-0 focus:border-primary font-sans text-sm placeholder:text-on-surface-variant/50 px-0 py-2 text-on-surface"
            />
            <button
              type="submit"
              disabled={state === "loading"}
              className="shrink-0 px-6 py-2.5 bg-primary text-on-primary font-sans text-xs font-bold uppercase tracking-widest hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {state === "loading" ? "Envoi…" : "S'inscrire"}
            </button>
          </form>
        )}
      </div>
      {state === "error" && (
        <p className="font-sans text-xs text-error mt-2">Une erreur est survenue. Veuillez réessayer.</p>
      )}
    </div>
  );
}

function VisaLogo() {
  return (
    <svg width="46" height="30" viewBox="0 0 46 30" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Visa">
      <rect width="46" height="30" rx="5" fill="#1A1F71"/>
      <text x="23" y="21" textAnchor="middle" fill="white" fontSize="16" fontWeight="800" fontStyle="italic" fontFamily="Arial, Helvetica, sans-serif" letterSpacing="1">VISA</text>
    </svg>
  );
}

function MastercardLogo() {
  return (
    <svg width="46" height="30" viewBox="0 0 46 30" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Mastercard">
      <rect width="46" height="30" rx="5" fill="#252525"/>
      <circle cx="18" cy="15" r="9" fill="#EB001B"/>
      <circle cx="28" cy="15" r="9" fill="#F79E1B"/>
      {/* Lens-shaped overlap */}
      <path d="M23 7.5a9 9 0 0 1 0 15a9 9 0 0 1 0-15z" fill="#FF5F00"/>
    </svg>
  );
}

function AmexLogo() {
  return (
    <svg width="46" height="30" viewBox="0 0 46 30" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="American Express">
      <rect width="46" height="30" rx="5" fill="#016FD0"/>
      <text x="23" y="13" textAnchor="middle" fill="white" fontSize="8" fontWeight="600" fontFamily="Arial, Helvetica, sans-serif" letterSpacing="1">AMERICAN</text>
      <text x="23" y="23" textAnchor="middle" fill="white" fontSize="8" fontWeight="600" fontFamily="Arial, Helvetica, sans-serif" letterSpacing="1">EXPRESS</text>
    </svg>
  );
}

function ApplePayLogo() {
  return (
    <svg width="58" height="30" viewBox="0 0 58 30" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Apple Pay">
      <rect width="58" height="30" rx="5" fill="#000000"/>
      {/* Apple logo path */}
      <path d="M15.5 10.2c.7-.9.65-1.75.63-2.07-.62.04-1.36.44-1.8.94-.4.46-.72 1.17-.62 1.86.67.05 1.36-.34 1.79-.73zm.48 1.1c-.99-.06-1.83.56-2.3.56-.47 0-1.18-.53-1.95-.52-1 .01-1.94.58-2.44 1.5-.71 1.21-.18 3.01.5 4 .34.5.74 1.04 1.27 1.02.5-.02.7-.32 1.3-.32.6 0 .78.32 1.31.31.55-.01.89-.5 1.23-.99.38-.56.54-1.1.55-1.13-.01 0-1.07-.41-1.08-1.63-.01-.99.81-1.47.85-1.5-.47-.68-1.2-.76-1.24-.76l-.06.06.06-.06z" fill="white"/>
      <text x="37" y="20" textAnchor="middle" fill="white" fontSize="12" fontWeight="500" fontFamily="-apple-system, Arial, Helvetica, sans-serif" letterSpacing="-0.3">Pay</text>
    </svg>
  );
}

function GooglePayLogo() {
  return (
    <svg width="58" height="30" viewBox="0 0 58 30" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Google Pay">
      <rect width="58" height="30" rx="5" fill="white" stroke="#e5e7eb" strokeWidth="1"/>
      {/* Google G */}
      <path d="M20.5 15c0-.37-.03-.73-.09-1.08H14v2.04h3.65a3.12 3.12 0 0 1-1.35 2.04v1.7h2.18c1.28-1.18 2.02-2.91 2.02-4.7z" fill="#4285F4"/>
      <path d="M14 21c1.83 0 3.36-.6 4.48-1.64l-2.18-1.69c-.6.41-1.38.65-2.3.65-1.77 0-3.27-1.19-3.8-2.8H7.95v1.75A6.75 6.75 0 0 0 14 21z" fill="#34A853"/>
      <path d="M10.2 15.52A4.07 4.07 0 0 1 10 14c0-.53.09-1.04.2-1.52v-1.75H7.95A6.75 6.75 0 0 0 7.25 14c0 1.09.26 2.12.7 3.04l2.25-1.52z" fill="#FBBC04"/>
      <path d="M14 10.68c1 0 1.89.34 2.6 1.01l1.94-1.94C17.36 8.67 15.83 8 14 8a6.75 6.75 0 0 0-6.05 3.73l2.25 1.75c.53-1.61 2.03-2.8 3.8-2.8z" fill="#EA4335"/>
      <text x="41" y="20" textAnchor="middle" fill="#3c4043" fontSize="12" fontWeight="500" fontFamily="Arial, Helvetica, sans-serif">Pay</text>
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="w-full mt-28 bg-[#f6f3f2] border-t border-[#d4c4b7]">
      <FooterNewsletter />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 px-10 lg:px-20 py-16 max-w-[90rem] mx-auto">
        <div className="space-y-5">
          <span className="font-serif text-2xl text-on-surface tracking-tight block">DDM Wigs &amp; More</span>
          <p className="font-sans text-base text-on-surface-variant leading-relaxed">
            Offrir la confiance grâce à des solutions capillaires premium depuis 2024.
          </p>
        </div>

        <div className="flex flex-col space-y-3">
          <h4 className="font-sans text-sm font-semibold text-on-surface uppercase tracking-widest mb-2">Explorer</h4>
          {[
            ["/boutique", "Boutique Perruques"],
            ["/quiz", "Quiz — Trouver ma perruque"],
            ["/accessoires", "Accessoires"],
            ["/cartes-cadeaux", "Cartes Cadeaux"],
            ["/ambassadrices", "Devenir ambassadrice"],
          ].map(([to, label]) => (
            <Link key={to} to={to} className="text-on-surface-variant hover:text-on-surface transition-colors font-sans text-base">{label}</Link>
          ))}
        </div>

        <div className="flex flex-col space-y-3">
          <h4 className="font-sans text-sm font-semibold text-on-surface uppercase tracking-widest mb-2">Support</h4>
          {[
            ["/livraison", "Livraison & Retours"],
            ["/faq", "FAQ"],
            ["/contact", "Nous Contacter"],
            ["/confidentialite", "Politique de Confidentialité"],
            ["/conditions", "Conditions générales"],
          ].map(([to, label]) => (
            <Link key={to} to={to} className="text-on-surface-variant hover:text-on-surface transition-colors font-sans text-base">{label}</Link>
          ))}
        </div>

        <div className="flex flex-col space-y-3">
          <h4 className="font-sans text-sm font-semibold text-on-surface uppercase tracking-widest mb-2">Contact</h4>
          <p className="text-on-surface-variant font-sans text-base">contact@ddmwigs.ca</p>
          <p className="text-on-surface-variant font-sans text-base">Montréal, Québec, Canada</p>
          <p className="text-primary font-sans text-base italic mt-2">Sur rendez-vous uniquement.</p>
        </div>
      </div>

      <div className="max-w-[90rem] mx-auto px-10 lg:px-20 py-5 border-t border-[#d4c4b7]/30">
        <div className="flex flex-wrap justify-center items-center gap-3 mb-4">
          <VisaLogo />
          <MastercardLogo />
          <AmexLogo />
          <ApplePayLogo />
          <GooglePayLogo />
        </div>
        <div className="flex flex-col md:flex-row justify-between items-center gap-2">
          <p className="text-on-surface-variant font-sans text-sm">© 2024 DDM Wigs &amp; More. Tous les prix sont en CAD.</p>
          <p className="font-sans text-xs text-on-surface-variant/60">Paiements sécurisés · Cryptage SSL</p>
        </div>
      </div>
    </footer>
  );
}
