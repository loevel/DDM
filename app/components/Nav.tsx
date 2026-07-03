import { Form, Link, useLocation, useNavigate } from "@remix-run/react";
import { useEffect, useRef, useState } from "react";

interface Collection { id: number; name: string; slug: string; }

interface DropdownItem { to: string; label: string; icon?: string; }

const BOUTIQUE_ITEMS: DropdownItem[] = [
  { to: "/boutique", label: "Toutes les perruques", icon: "styler" },
  { to: "/accessoires", label: "Accessoires", icon: "checkroom" },
  { to: "/cartes-cadeaux", label: "Cartes cadeaux", icon: "card_giftcard" },
];

const APROPOS_ITEMS: DropdownItem[] = [
  { to: "/notre-histoire", label: "Notre Histoire", icon: "auto_stories" },
  { to: "/guide-entretien", label: "Guide d'Entretien", icon: "spa" },
  { to: "/livraison", label: "Livraison & Retours", icon: "local_shipping" },
  { to: "/faq", label: "FAQ", icon: "help" },
  { to: "/contact", label: "Contact", icon: "mail" },
];

// ─── Dropdown générique (survol avec délai de fermeture) ─────────────────────

function useHoverMenu() {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEnter = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const handleLeave = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  return { open, setOpen, handleEnter, handleLeave };
}

const triggerClass = (active: boolean) =>
  `font-sans text-sm font-semibold tracking-widest uppercase transition-colors duration-300 flex items-center gap-1 ${
    active
      ? "text-primary border-b-2 border-primary pb-1"
      : "text-on-surface-variant hover:text-primary"
  }`;

function DropdownPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-60 bg-surface shadow-lg border border-outline-variant rounded z-50 overflow-hidden">
      <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-surface border-l border-t border-outline-variant rotate-45" />
      <div className="relative py-1">{children}</div>
    </div>
  );
}

function DropdownLink({ item, onClick }: { item: DropdownItem; onClick: () => void }) {
  return (
    <Link
      to={item.to}
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-2.5 text-sm text-on-surface-variant hover:bg-surface-container hover:text-primary transition-colors"
    >
      {item.icon && <span className="material-symbols-outlined text-base text-primary/60">{item.icon}</span>}
      {item.label}
    </Link>
  );
}

function NavDropdown({
  label, to, items, pathname,
}: {
  label: string;
  to?: string;
  items: DropdownItem[];
  pathname: string;
}) {
  const { open, setOpen, handleEnter, handleLeave } = useHoverMenu();
  const isActive = items.some(i => pathname.startsWith(i.to));

  const trigger = (
    <>
      {label}
      <span className={`material-symbols-outlined text-sm leading-none transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
        expand_more
      </span>
    </>
  );

  return (
    <div className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      {to ? (
        <Link to={to} className={triggerClass(isActive)}>{trigger}</Link>
      ) : (
        <button type="button" className={triggerClass(isActive)} onClick={() => setOpen(!open)}>{trigger}</button>
      )}
      {open && (
        <DropdownPanel>
          {items.map(item => (
            <DropdownLink key={item.to} item={item} onClick={() => setOpen(false)} />
          ))}
        </DropdownPanel>
      )}
    </div>
  );
}

// ─── Collections (contenu dynamique) ─────────────────────────────────────────

function CollectionsDropdown({ pathname }: { pathname: string }) {
  const { open, setOpen, handleEnter, handleLeave } = useHoverMenu();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loaded, setLoaded] = useState(false);

  const isActive = pathname.startsWith("/collections");

  const onEnter = () => {
    handleEnter();
    if (!loaded) {
      fetch("/api/collections")
        .then(r => r.json())
        .then((d: any) => { setCollections(d.collections ?? []); setLoaded(true); })
        .catch(() => setLoaded(true));
    }
  };

  return (
    <div className="relative" onMouseEnter={onEnter} onMouseLeave={handleLeave}>
      <Link to="/collections" className={triggerClass(isActive)}>
        Collections
        <span className={`material-symbols-outlined text-sm leading-none transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
          expand_more
        </span>
      </Link>

      {open && (
        <DropdownPanel>
          <Link
            to="/collections"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-on-surface hover:bg-surface-container hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined text-base text-primary">collections_bookmark</span>
            Toutes les collections
          </Link>

          {collections.length > 0 && <div className="border-t border-outline-variant my-1" />}

          {!loaded && <p className="px-4 py-2 text-xs text-on-surface-variant">Chargement…</p>}

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
        </DropdownPanel>
      )}
    </div>
  );
}

// ─── Recherche ────────────────────────────────────────────────────────────────

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

// ─── Nav principale ───────────────────────────────────────────────────────────

export function Nav() {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const close = () => setMenuOpen(false);

  return (
    <nav className="w-full top-0 sticky bg-surface/95 backdrop-blur-md shadow-sm z-50 transition-all duration-300">
      <div className="flex justify-between items-center px-6 lg:px-12 xl:px-20 h-20 max-w-[90rem] mx-auto gap-6">
        <Link to="/" className="flex items-center gap-3 shrink-0">
          <span className="font-serif text-2xl text-on-surface tracking-tight">DDM Wigs &amp; More</span>
        </Link>

        {/* Navigation desktop — 5 entrées regroupées */}
        <div className="hidden lg:flex items-center gap-6 xl:gap-8">
          <NavDropdown label="Boutique" to="/boutique" items={BOUTIQUE_ITEMS} pathname={pathname} />
          <CollectionsDropdown pathname={pathname} />
          <Link
            to="/ventes-flash"
            className={`font-sans text-sm font-semibold tracking-widest uppercase transition-colors duration-300 whitespace-nowrap ${
              pathname === "/ventes-flash"
                ? "text-primary border-b-2 border-primary pb-1"
                : "text-error hover:text-error/80"
            }`}
          >
            ⚡ Ventes Flash
          </Link>
          <Link
            to="/promotions"
            className={`font-sans text-sm font-semibold tracking-widest uppercase transition-colors duration-300 ${
              pathname === "/promotions"
                ? "text-primary border-b-2 border-primary pb-1"
                : "text-on-surface-variant hover:text-primary"
            }`}
          >
            Promotions
          </Link>
          <NavDropdown label="À propos" items={APROPOS_ITEMS} pathname={pathname} />
        </div>

        <div className="flex items-center gap-5 shrink-0">
          {/* CTA Quiz — mis en avant comme bouton, pas comme lien noyé */}
          <Link
            to="/quiz"
            className="hidden md:inline-flex items-center gap-1.5 border border-primary text-primary px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-primary hover:text-on-primary transition-colors whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-base">auto_awesome</span>
            Trouver ma perruque
          </Link>
          <SearchBar />
          <Link to="/compte" aria-label="Mon espace client">
            <span className="material-symbols-outlined text-on-surface-variant hover:text-primary cursor-pointer">person</span>
          </Link>
          <Link to="/panier" aria-label="Mon panier" className="relative">
            <span className="material-symbols-outlined text-on-surface-variant hover:text-primary cursor-pointer">shopping_bag</span>
            <span id="cart-badge" className="absolute -top-1 -right-1 bg-primary text-white text-[10px] rounded-full w-4 h-4 items-center justify-center font-bold hidden">0</span>
          </Link>
          <button
            className="lg:hidden material-symbols-outlined text-on-surface-variant"
            aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? "close" : "menu"}
          </button>
        </div>
      </div>

      {/* Menu mobile — organisé par sections */}
      {menuOpen && (
        <div className="lg:hidden bg-surface border-t border-outline-variant px-6 py-5 flex flex-col gap-5 max-h-[calc(100vh-5rem)] overflow-y-auto">
          {/* Recherche */}
          <Form action="/recherche" method="get" className="flex items-center gap-2 border-b border-outline pb-4">
            <span className="material-symbols-outlined text-on-surface-variant text-xl">search</span>
            <input
              name="q"
              type="text"
              placeholder="Rechercher un produit…"
              className="flex-1 bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none"
            />
          </Form>

          {/* CTA Quiz */}
          <Link
            to="/quiz"
            onClick={close}
            className="flex items-center justify-center gap-2 bg-primary text-on-primary py-3.5 text-xs font-bold uppercase tracking-widest"
          >
            <span className="material-symbols-outlined text-base">auto_awesome</span>
            Trouver ma perruque
          </Link>

          {/* Boutique */}
          <div className="flex flex-col gap-3">
            <p className="font-sans text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-[0.2em]">Boutique</p>
            {[...BOUTIQUE_ITEMS, { to: "/collections", label: "Collections" }].map(({ to, label }) => (
              <Link key={to} to={to} onClick={close} className="font-sans text-sm text-on-surface-variant uppercase tracking-widest">
                {label}
              </Link>
            ))}
          </div>

          {/* Offres */}
          <div className="flex flex-col gap-3 border-t border-outline-variant/40 pt-4">
            <p className="font-sans text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-[0.2em]">Offres</p>
            <Link to="/ventes-flash" onClick={close} className="font-sans text-sm text-error font-bold uppercase tracking-widest">
              ⚡ Ventes Flash
            </Link>
            <Link to="/promotions" onClick={close} className="font-sans text-sm text-on-surface-variant uppercase tracking-widest">
              Promotions
            </Link>
          </div>

          {/* À propos */}
          <div className="flex flex-col gap-3 border-t border-outline-variant/40 pt-4">
            <p className="font-sans text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-[0.2em]">À propos</p>
            {APROPOS_ITEMS.map(({ to, label }) => (
              <Link key={to} to={to} onClick={close} className="font-sans text-sm text-on-surface-variant uppercase tracking-widest">
                {label}
              </Link>
            ))}
          </div>

          <Link
            to="/compte"
            onClick={close}
            className="font-sans text-sm text-primary font-bold uppercase tracking-widest border-t border-outline-variant/40 pt-4"
          >
            Mon compte
          </Link>
        </div>
      )}
    </nav>
  );
}
