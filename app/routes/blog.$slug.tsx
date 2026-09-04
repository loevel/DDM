import { json, type LoaderFunctionArgs, type MetaFunction } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { getPublishedPost, getPostProducts, getRelatedPosts } from "~/lib/blog.server";
import { categoryLabel } from "~/lib/blog";
import { renderMarkdown } from "~/lib/markdown";
import { cfImage } from "~/lib/images";
import { ProductTile } from "~/components/ProductTile";

const BASE = "https://ddmwigs.com";

/**
 * Open Graph et schema.org exigent des URLs absolues : une couverture servie
 * depuis /images/ ne serait résolue par aucun réseau social.
 */
function absolu(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  return url.startsWith("http") ? url : `${BASE}${url.startsWith("/") ? "" : "/"}${url}`;
}

/** `datetime('now')` de SQLite → ISO 8601, seul format lu par les agrégateurs. */
function iso(sqlite: string | null): string | undefined {
  return sqlite ? `${sqlite.replace(" ", "T")}Z` : undefined;
}

export async function loader({ params, context }: LoaderFunctionArgs) {
  const db = context.cloudflare.env.DB;
  const post = await getPublishedPost(db, params.slug!);
  if (!post) throw new Response("Article introuvable", { status: 404 });

  const [produits, voisins] = await Promise.all([
    getPostProducts(db, post.id),
    getRelatedPosts(db, post),
  ]);

  // Compteur de vues : hors du chemin critique, une erreur ne doit jamais
  // empêcher l'affichage de l'article.
  context.cloudflare.ctx.waitUntil(
    db.prepare("UPDATE blog_posts SET views = views + 1 WHERE id = ?").bind(post.id).run().catch(() => {})
  );

  return json(
    { post, produits, voisins, html: renderMarkdown(post.body) },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=300" } }
  );
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  if (!data?.post) return [{ title: "Article — DDM Wigs & More" }];
  const p = data.post;
  const url = `${BASE}/blog/${p.slug}`;
  const titre = p.seo_title || p.title;
  const description = p.seo_description || p.excerpt || `${p.title} — Le Journal de DDM Wigs & More.`;
  const image = absolu(p.cover_image_key ? cfImage(p.cover_image_key, "public") ?? p.cover_image_key : null);

  return [
    { title: `${titre} — DDM Wigs & More` },
    { name: "description", content: description },
    { tagName: "link", rel: "canonical", href: url },
    { property: "og:type", content: "article" },
    { property: "og:title", content: titre },
    { property: "og:description", content: description },
    { property: "og:url", content: url },
    { property: "og:site_name", content: "DDM Wigs & More" },
    { property: "og:locale", content: "fr_CA" },
    ...(image ? [{ property: "og:image", content: image }] : []),
    ...(iso(p.published_at) ? [{ property: "article:published_time", content: iso(p.published_at)! }] : []),
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: titre },
    { name: "twitter:description", content: description },
  ];
};

function formatDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso.replace(" ", "T") + "Z").toLocaleDateString("fr-CA", {
    day: "numeric", month: "long", year: "numeric",
  });
}

export default function Article() {
  const { post, produits, voisins, html } = useLoaderData<typeof loader>();
  const url = `${BASE}/blog/${post.slug}`;
  const image = post.cover_image_key ? cfImage(post.cover_image_key, "public") ?? post.cover_image_key : undefined;
  const imageAbsolue = absolu(image);

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.seo_description || post.excerpt || undefined,
    image: imageAbsolue ? [imageAbsolue] : undefined,
    datePublished: iso(post.published_at),
    dateModified: iso(post.updated_at),
    author: { "@type": "Organization", name: "DDM Wigs & More" },
    publisher: {
      "@type": "Organization",
      name: "DDM Wigs & More",
      logo: { "@type": "ImageObject", url: `${BASE}/images/ddm-logo.svg` },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    wordCount: post.body.split(/\s+/).filter(Boolean).length,
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Accueil", item: BASE },
      { "@type": "ListItem", position: 2, name: "Le Journal", item: `${BASE}/blog` },
      { "@type": "ListItem", position: 3, name: post.title, item: url },
    ],
  };

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      <article className="max-w-container-max-width mx-auto px-grid-margin-desktop py-10 md:py-16">
        <nav className="font-sans text-xs uppercase tracking-[0.2em] text-on-surface-variant/60 mb-8">
          <Link to="/blog" className="hover:text-primary">Le Journal</Link>
          {post.category && <> · <span className="text-primary">{categoryLabel(post.category)}</span></>}
        </nav>

        <header className="max-w-3xl mb-10 md:mb-14">
          <div className="ddm-rule mb-6" />
          <h1 className="font-serif text-[2.5rem] md:text-5xl xl:text-6xl leading-[1.02] tracking-[-0.02em] text-on-surface">
            {post.title}
          </h1>
          {post.excerpt && (
            <p className="font-sans text-lg text-on-surface-variant leading-relaxed mt-6">{post.excerpt}</p>
          )}
          <p className="font-sans text-xs uppercase tracking-[0.2em] text-on-surface-variant/60 mt-6">
            {formatDate(post.published_at)} · {post.reading_minutes} min de lecture
          </p>
        </header>

        {image && (
          <figure className="mb-12 md:mb-16">
            <img
              src={image} alt={post.cover_alt ?? ""} loading="eager"
              className="w-full aspect-[16/9] object-cover"
            />
            {post.cover_alt && (
              <figcaption className="font-sans text-xs text-on-surface-variant/60 mt-2">{post.cover_alt}</figcaption>
            )}
          </figure>
        )}

        {/* Le HTML vient de renderMarkdown, qui échappe la saisie avant de baliser :
            aucune balise saisie par la rédactrice ne peut arriver jusqu'ici. */}
        <div className="max-w-3xl" dangerouslySetInnerHTML={{ __html: html }} />

        {post.tags && (
          <div className="max-w-3xl flex flex-wrap gap-2 mt-12 pt-8 border-t border-outline-variant/40">
            {post.tags.split(",").map(t => t.trim()).filter(Boolean).map(t => (
              <span key={t} className="font-sans text-xs px-3 py-1.5 border border-outline-variant/60 text-on-surface-variant">
                {t}
              </span>
            ))}
          </div>
        )}
      </article>

      {produits.length > 0 && (
        <section className="max-w-container-max-width mx-auto px-grid-margin-desktop pb-16 md:pb-24">
          <div className="ddm-rule mb-6" />
          <p className="ddm-eyebrow mb-3">Dans cet article</p>
          <h2 className="font-serif text-3xl md:text-4xl leading-tight text-on-surface mb-10">
            <span className="block">Les perruques</span>
            <span className="block italic text-primary">mentionnées</span>
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-4 md:gap-x-6 gap-y-10">
            {produits.map((p, i) => <ProductTile key={p.id} product={p} folio={i + 1} />)}
          </div>
        </section>
      )}

      {voisins.length > 0 && (
        <section className="bg-surface-container-low py-16 md:py-24">
          <div className="max-w-container-max-width mx-auto px-grid-margin-desktop">
            <div className="ddm-rule mb-6" />
            <p className="ddm-eyebrow mb-3">Poursuivre</p>
            <h2 className="font-serif text-3xl md:text-4xl leading-tight text-on-surface mb-10">
              <span className="block">À lire</span>
              <span className="block italic text-primary">ensuite</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-10">
              {voisins.map((v, i) => (
                <Link key={v.id} to={`/blog/${v.slug}`} className="group block">
                  <div className="relative aspect-[3/2] overflow-hidden bg-surface-container mb-4">
                    {v.cover_image_key && (
                      <img
                        src={cfImage(v.cover_image_key, "card") ?? v.cover_image_key}
                        alt={v.cover_alt ?? ""} loading="lazy"
                        className="absolute inset-0 w-full h-full object-cover ddm-zoom"
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="ddm-folio">{String(i + 1).padStart(2, "0")}</span>
                    <span className="ddm-rule flex-1" />
                  </div>
                  <h3 className="font-serif text-xl leading-snug text-on-surface group-hover:text-primary transition-colors">
                    {v.title}
                  </h3>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
