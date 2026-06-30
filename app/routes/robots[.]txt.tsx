export async function loader() {
  const content = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /api/",
    "Disallow: /compte/",
    "",
    "Sitemap: https://ddm-wigs.pages.dev/sitemap.xml",
  ].join("\n");

  return new Response(content, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
