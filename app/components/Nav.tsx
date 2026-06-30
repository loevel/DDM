import { Form, Link, useLocation, useNavigate } from "@remix-run/react";
import { useEffect, useRef, useState } from "react";

interface Collection { id: number; name: string; slug: string; }

const links = [
  { to: "/boutique", label: "Boutique" },
  { to: "/ventes-flash", label: "⚡ Ventes Flash", flash: true },
  { to: "/promotions", label: "Promotions", highlight: true },
  { to: "/accessoires", label: "Accessoires" },
  { to: "/notre-histoire", label: "Notre Histoire" },
  { to: "/guide-entretien", label: "Guide d'Entretien" },
];

function CollectionsDropdown({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loaded, setLoaded] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isActive = pathname.startsWith("/collections");

  const handleEnter = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
    if (!loaded) {
      fetch("/api/collections")
        .then(r => r.json())
        .then((d: any) => { setCollections(d.collections ?? []); setLoaded(true); })
        .catch(() => setLoaded(true));
    }
  };

  const handleLeave = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  return (
    <div className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <Link
        to="/collections"
        className={`font-sans text-sm font-semibold tracking-widest uppercase transition-colors duration-300 flex items-center gap-1 ${
          isActive
            ? "text-primary border-b-2 border-primary pb-1"
            : "text-on-surface-variant hover:text-primary"
        }`}
      >
        Collections
        <span
          className={`material-symbols-outlined text-sm leading-none transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          expand_more
        </span>
      </Link>

      {open && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-56 bg-surface shadow-lg border border-outline-variant rounded z-50 overflow-hidden">
          {/* Petite flèche */}
          <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-surface border-l border-t border-outline-variant rotate-45" />

          <div className="relative py-1">
            <Link
              to="/collections"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-on-surface hover:bg-surface-container hover:text-primary transition-colors"
            >
              <span className="material-symbols-outlined text-base text-primary">collections_bookmark</span>
              Toutes les collections
            </Link>

            {collections.length > 0 && (
              <div className="border-t border-outline-variant my-1" />
            )}

            {!loaded && (
              <p className="px-4 py-2 text-xs text-on-surface-variant">Chargement…</p>
            )}

            {loaded && collections.map(col => (
              <Link
                key={col.id}
                to={`/collections/${col.slug}`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-4 py-2 text-sm text-on-surface-variant hover:bg-surface-container hover:text-primary transition-colors"
              >
                <span className="material-symbols-outlined text-sm text-outline-variant">chevron_right</span>
                {col.name}
              </Link>
            ))}

            {loaded && collections.length === 0 && (
              <p className="px-4 py-2 text-xs text-on-surface-variant">Aucune collection</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SearchBar() {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  function handleOpen() {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = inputRef.current?.value.trim();
    if (q) {
      navigate(`/recherche?q=${encodeURIComponent(q)}`);
      setOpen(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") setOpen(false);
  }

  return (
    <div className="relative flex items-center">
      {open ? (
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            onKeyDown={handleKeyDown}
            placeholder="Rechercher…"
            className="w-48 md:w-64 border-b border-outline bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant/50 py-1 px-0 focus:outline-none focus:border-primary transition-all"
          />
          <button type="submit" className="material-symbols-outlined text-on-surface-variant hover:text-primary text-xl">
            search
          </button>
          <button type="button" onClick={() => setOpen(false)} className="material-symbols-outlined text-on-surface-variant hover:text-primary text-xl">
            close
          </button>
        </form>
      ) : (
        <button onClick={handleOpen} aria-label="Rechercher" className="material-symbols-outlined text-on-surface-variant hover:text-primary cursor-pointer">
          search
        </button>
      )}
    </div>
  );
}

export function Nav() {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="w-full top-0 sticky bg-surface/95 backdrop-blur-md shadow-sm z-50 transition-all duration-300">
      <div className="flex justify-between items-center px-10 lg:px-20 h-20 max-w-[90rem] mx-auto">
        <Link to="/" className="flex items-center gap-3">
          <span className="font-serif text-2xl text-on-surface tracking-tight">DDM Wigs &amp; More</span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {links.map(({ to, label, highlight, flash }) => (
            <Link
              key={to}
              to={to}
              className={`font-sans text-sm font-semibold tracking-widest uppercase transition-colors duration-300 ${
                pathname === to
                  ? "text-primary border-b-2 border-primary pb-1"
                  : flash
                  ? "text-error hover:text-error/80"
                  : highlight
                  ? "text-error hover:text-error/80"
                  : "text-on-surface-variant hover:text-primary"
              }`}
            >
              {label}
            </Link>
          ))}
          <CollectionsDropdown pathname={pathname} />
        </div>

        <div className="flex items-center gap-5">
          <SearchBar />
          <Link to="/compte" aria-label="Mon espace client">
            <span className="material-symbols-outlined text-on-surface-variant hover:text-primary cursor-pointer">person</span>
          </Link>
          <Link to="/panier" aria-label="Mon panier" className="relative">
            <span className="material-symbols-outlined text-on-surface-variant hover:text-primary cursor-pointer">shopping_bag</span>
            <span id="cart-badge" className="absolute -top-1 -right-1 bg-primary text-white text-[10px] rounded-full w-4 h-4 items-center justify-center font-bold hidden">0</span>
          </Link>
          <button className="md:hidden material-symbols-outlined text-on-surface-variant" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? "close" : "menu"}
          </button>
        </div>
      </div>

      {/* Menu mobile */}
      {menuOpen && (
        <div className="md:hidden bg-surface border-t border-outline-variant px-6 py-4 flex flex-col gap-4">
          {/* Barre de recherche mobile */}
          <Form action="/recherche" method="get" className="flex items-center gap-2 border-b border-outline pb-4 mb-1">
            <span className="material-symbols-outlined text-on-surface-variant text-xl">search</span>
            <input
              name="q"
              type="text"
              placeholder="Rechercher un produit…"
              className="flex-1 bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none"
              onFocus={() => {}}
            />
          </Form>
          {links.map(({ to, label, flash, highlight }) => (
            <Link key={to} to={to}
              className={`font-sans text-sm uppercase tracking-widest ${flash || highlight ? "text-error font-bold" : "text-on-surface-variant"}`}
              onClick={() => setMenuOpen(false)}>
              {label}
            </Link>
          ))}
          <Link to="/collections" className="font-sans text-sm text-on-surface-variant uppercase tracking-widest" onClick={() => setMenuOpen(false)}>
            Collections
          </Link>
          <Link to="/compte" className="font-sans text-sm text-primary uppercase tracking-widest" onClick={() => setMenuOpen(false)}>
            Mon compte
          </Link>
        </div>
      )}
    </nav>
  );
}
