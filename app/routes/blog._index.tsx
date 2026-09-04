import { json, type LoaderFunctionArgs, type MetaFunction } from "@remix-run/cloudflare";
import { Link, useLoaderData, useSearchParams } from "@remix-run/react";
import { getPublishedPosts } from "~/lib/blog.server";
import { CATEGORIES, categoryLabel, type BlogPost } from "~/lib/blog";
import { cfImage } from "~/lib/images";

const BASE = "https://ddmwigs.com";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const category = new URL(request.url).searchParams.get("categorie") ?? undefined;
  const posts = await getPublishedPosts(context.cloudflare.env.DB, { category });
  return json({ posts, category: category ?? "" });
}

export const meta: MetaFunction<typeof loader> = () => [
  { title: "Le Journal — DDM Wigs & More" },
  {
    name: "description",
    content:
      "Entretien, pose, textures : nos conseils pour tirer le meilleur de vos perruques en cheveux humains, par l'équipe DDM à Montréal.",
  },
  { tagName: "link", rel: "canonical", href: `${BASE}/blog` },
  { property: "og:type", content: "website" },
  { property: "og:title", content: "Le Journal — DDM Wigs & More" },
  { property: "og:url", content: `${BASE}/blog` },
  { property: "og:site_name", content: "DDM Wigs & More" },
  { property: "og:locale", content: "fr_CA" },
];

function formatDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso.replace(" ", "T") + "Z").toLocaleDateString("fr-CA", {
    day: "numeric", month: "long", year: "numeric",
  });
}

function Une({ post }: { post: BlogPost }) {
  return (
    <Link to={`/blog/${post.slug}`} className="group block mb-16 md:mb-24">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-grid-gutter items-center">
        <div className="lg:col-span-7 relative aspect-[4/3] overflow-hidden bg-surface-container">
          {post.cover_image_key && (
            <img
              src={cfImage(post.cover_image_key, "public") ?? post.cover_image_key}
              alt={post.cover_alt ?? ""}
              loading="eager"
              className="absolute inset-0 w-full h-full object-cover ddm-zoom"
            />
          )}
        </div>
        <div className="lg:col-span-5">
          <div className="ddm-rule mb-4" />
          <p className="ddm-eyebrow mb-3">
            {categoryLabel(post.category) ?? "À la une"}
          </p>
          <h2 className="font-serif text-3xl md:text-4xl xl:text-5xl leading-[1.05] tracking-[-0.01em] text-on-surface group-hover:text-primary transition-colors">
            {post.title}
          </h2>
          {post.excerpt && (
            <p className="font-sans text-base text-on-surface-variant leading-relaxed mt-4">{post.excerpt}</p>
          )}
          <p className="font-sans text-xs uppercase tracking-[0.2em] text-on-surface-variant/60 mt-5">
            {formatDate(post.published_at)} · {post.reading_minutes} min de lecture
          </p>
        </div>
      </div>
    </Link>
  );
}

function Carte({ post, folio }: { post: BlogPost; folio: number }) {
  return (
    <Link to={`/blog/${post.slug}`} className="group block">
      <div className="relative aspect-[3/2] overflow-hidden bg-surface-container mb-4">
        {post.cover_image_key && (
          <img
            src={cfImage(post.cover_image_key, "card") ?? post.cover_image_key}
            alt={post.cover_alt ?? ""}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover ddm-zoom"
          />
        )}
      </div>
      <div className="flex items-center gap-3 mb-2">
        <span className="ddm-folio">{String(folio).padStart(2, "0")}</span>
        <span className="ddm-rule flex-1" />
        {post.category && (
          <span className="font-sans text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
            {categoryLabel(post.category)}
          </span>
        )}
      </div>
      <h3 className="font-serif text-xl md:text-2xl leading-snug text-on-surface group-hover:text-primary transition-colors">
        {post.title}
      </h3>
      {post.excerpt && (
        <p className="font-sans text-sm text-on-surface-variant leading-relaxed mt-2 line-clamp-3">{post.excerpt}</p>
      )}
      <p className="font-sans text-xs uppercase tracking-[0.2em] text-on-surface-variant/50 mt-3">
        {formatDate(post.published_at)} · {post.reading_minutes} min
      </p>
    </Link>
  );
}

export default function Journal() {
  const { posts, category } = useLoaderData<typeof loader>();
  const [, setParams] = useSearchParams();

  const [une, ...reste] = category ? [null as BlogPost | null, ...posts] : posts;

  return (
    <main className="max-w-container-max-width mx-auto px-grid-margin-desktop py-12 md:py-20">
      <header className="mb-12 md:mb-16">
        <div className="ddm-rule mb-6" />
        <h1 className="font-serif text-[3.25rem] sm:text-7xl xl:text-[6.5rem] leading-[0.92] tracking-[-0.02em] text-on-surface">
          <span className="block">Le</span>
          <span className="block italic text-primary">Journal</span>
        </h1>
        <p className="font-sans text-base text-on-surface-variant max-w-xl mt-6">
          Entretien, pose, textures. Ce qu'on explique en boutique, écrit noir sur blanc.
        </p>
        <div className="ddm-rule mt-8" />
      </header>

      <div className="flex flex-wrap items-center gap-2 mb-12">
        <button
          onClick={() => setParams({}, { preventScrollReset: true })}
          className={`px-4 py-2 text-sm border transition-colors ${
            !category
              ? "border-primary text-primary"
              : "border-outline-variant/60 text-on-surface-variant hover:border-primary hover:text-primary"
          }`}
        >
          Tout
        </button>
        {CATEGORIES.map(c => (
          <button
            key={c.slug}
            onClick={() => setParams({ categorie: c.slug }, { preventScrollReset: true })}
            className={`px-4 py-2 text-sm border transition-colors ${
              category === c.slug
                ? "border-primary text-primary"
                : "border-outline-variant/60 text-on-surface-variant hover:border-primary hover:text-primary"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {posts.length === 0 ? (
        <div className="py-24 text-center">
          <p className="font-serif text-2xl text-on-surface mb-2">Le premier article arrive bientôt.</p>
          <p className="font-sans text-sm text-on-surface-variant">
            En attendant, <Link to="/boutique" className="text-primary underline underline-offset-2">la collection vous attend</Link>.
          </p>
        </div>
      ) : (
        <>
          {une && <Une post={une} />}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 md:gap-x-grid-gutter gap-y-12 md:gap-y-16">
            {reste.filter(Boolean).map((post, i) => (
              <Carte key={post!.id} post={post!} folio={i + (une ? 2 : 1)} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}
