import { Link } from "@remix-run/react";

export default function Location() {
  return (
    <main className="pt-20 min-h-screen flex items-center justify-center">
      <div className="text-center px-4">
        <span className="material-symbols-outlined text-5xl text-outline-variant mb-4 block">calendar_month</span>
        <h1 className="font-serif text-3xl text-on-surface mb-3">Service de location</h1>
        <p className="font-sans text-base text-on-surface-variant mb-8 max-w-sm mx-auto">
          Ce service sera bientôt disponible. Revenez nous voir prochainement.
        </p>
        <Link to="/boutique" className="px-8 py-3 bg-primary text-on-primary font-sans text-sm font-bold uppercase tracking-widest hover:opacity-90 transition-opacity">
          Voir la boutique
        </Link>
      </div>
    </main>
  );
}
