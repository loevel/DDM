import type { MetaFunction } from "@remix-run/react";
import { Link } from "@remix-run/react";

export const meta: MetaFunction = () => [{ title: "Mes locations — DDM Wigs & More" }];

export default function Locations() {
  return (
    <div className="bg-surface border border-outline-variant/30 px-6 py-16 text-center">
      <span className="material-symbols-outlined text-5xl text-outline-variant mb-4 block">calendar_month</span>
      <h1 className="font-serif text-2xl text-on-surface mb-2">Service de location</h1>
      <p className="font-sans text-sm text-on-surface-variant mb-6">Ce service sera bientôt disponible.</p>
      <Link to="/boutique" className="font-sans text-sm text-primary border-b border-primary hover:opacity-70 transition-opacity">
        Voir la boutique →
      </Link>
    </div>
  );
}
