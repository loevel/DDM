import { Link } from "@remix-run/react";

export function Footer() {
  return (
    <footer className="w-full mt-28 bg-[#f6f3f2] border-t border-[#d4c4b7]">
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

            ["/accessoires", "Accessoires"],
            ["/cartes-cadeaux", "Cartes Cadeaux"],
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
        <div className="flex flex-wrap justify-center gap-2 mb-4">
          {[
            { label: "VISA", bg: "#1a1f71", color: "#fff", wide: true },
            { label: "MC", bg: "#eb001b", color: "#fff", accent: "#f79e1b" },
            { label: "AMEX", bg: "#007bc1", color: "#fff" },
            { label: "Interac", bg: "#ffd100", color: "#000" },
            { label: "PayPal", bg: "#003087", color: "#fff" },
            { label: "Apple Pay", bg: "#000", color: "#fff" },
            { label: "Google Pay", bg: "#fff", color: "#3c4043", border: true },
          ].map(({ label, bg, color, border }) => (
            <span
              key={label}
              className={`inline-flex items-center justify-center px-3 h-7 rounded text-[11px] font-bold tracking-tight select-none ${border ? "border border-[#dadce0]" : ""}`}
              style={{ backgroundColor: bg, color }}
            >
              {label}
            </span>
          ))}
        </div>
        <div className="flex flex-col md:flex-row justify-between items-center gap-2">
          <p className="text-on-surface-variant font-sans text-sm">© 2024 DDM Wigs &amp; More. Tous les prix sont en CAD.</p>
          <p className="font-sans text-xs text-on-surface-variant/60">Paiements sécurisés · Cryptage SSL</p>
        </div>
      </div>
    </footer>
  );
}
