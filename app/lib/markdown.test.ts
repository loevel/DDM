import { describe, it, expect } from "vitest";
import { renderMarkdown, stripMarkdown, readingMinutes, slugify } from "./markdown";

describe("renderMarkdown — innocuité", () => {
  it("neutralise le HTML saisi dans le corps", () => {
    const html = renderMarkdown('<script>alert("xss")</script>');
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;");
  });

  it("neutralise le HTML glissé dans un titre", () => {
    expect(renderMarkdown("## <img src=x onerror=alert(1)>")).not.toContain("<img src=x");
  });

  it("refuse un lien javascript: et ne garde que le libellé", () => {
    const html = renderMarkdown("[cliquez](javascript:alert(1))");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<a ");
    expect(html).toContain("cliquez");
  });

  it("refuse une image en data: URI", () => {
    const html = renderMarkdown("![x](data:text/html;base64,PHNjcmlwdD4=)");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("data:");
  });

  it("échappe les guillemets, pour qu'un libellé ne puisse pas sortir d'un attribut", () => {
    const html = renderMarkdown('[a" onmouseover="alert(1)](https://exemple.ca)');
    expect(html).not.toContain('onmouseover="');
    expect(html).toContain("&quot;");
  });

  it("accepte les liens http, internes et les ancres", () => {
    expect(renderMarkdown("[a](https://ddmwigs.com)")).toContain('href="https://ddmwigs.com"');
    expect(renderMarkdown("[a](/boutique)")).toContain('href="/boutique"');
    expect(renderMarkdown("[a](#avis)")).toContain('href="#avis"');
  });

  it("ouvre les liens externes dans un nouvel onglet, pas les liens internes", () => {
    expect(renderMarkdown("[a](https://exemple.ca)")).toContain('rel="noopener noreferrer"');
    expect(renderMarkdown("[a](/boutique)")).not.toContain("noopener");
  });
});

describe("renderMarkdown — rendu", () => {
  it("rend ## en h2 et ### en h3", () => {
    expect(renderMarkdown("## Titre")).toContain("<h2");
    expect(renderMarkdown("### Titre")).toContain("<h3");
  });

  it("remonte un # isolé en h2 : la page a déjà son h1", () => {
    const html = renderMarkdown("# Titre");
    expect(html).toContain("<h2");
    expect(html).not.toContain("<h1");
  });

  it("regroupe les puces consécutives dans une seule liste", () => {
    const html = renderMarkdown("- un\n- deux\n- trois");
    expect(html.match(/<ul/g)).toHaveLength(1);
    expect(html.match(/<li>/g)).toHaveLength(3);
  });

  it("distingue liste à puces et liste numérotée", () => {
    const html = renderMarkdown("- a\n\n1. b");
    expect(html).toContain("<ul");
    expect(html).toContain("<ol");
  });

  it("ferme la liste avant le paragraphe suivant", () => {
    const html = renderMarkdown("- a\n\nUn paragraphe.");
    expect(html.indexOf("</ul>")).toBeLessThan(html.indexOf("Un paragraphe."));
  });

  it("rend le gras et l'italique", () => {
    expect(renderMarkdown("**gras**")).toContain("<strong>gras</strong>");
    expect(renderMarkdown("*penché*")).toContain("<em>penché</em>");
  });

  it("ne confond pas l'italique avec le gras", () => {
    const html = renderMarkdown("**gras** et *penché*");
    expect(html).toContain("<strong>gras</strong>");
    expect(html).toContain("<em>penché</em>");
  });

  it("reconnaît une citation malgré l'échappement préalable du chevron", () => {
    expect(renderMarkdown("> une citation")).toContain("<blockquote");
  });

  it("regroupe les lignes consécutives en un seul paragraphe", () => {
    const html = renderMarkdown("ligne un\nligne deux\n\nautre bloc");
    expect(html.match(/<p /g)).toHaveLength(2);
  });

  it("rend une chaîne vide sans planter", () => {
    expect(renderMarkdown("")).toBe("");
  });
});

describe("stripMarkdown / readingMinutes / slugify", () => {
  it("retire les marques sans perdre le texte", () => {
    expect(stripMarkdown("## Titre\n\n**gras** et [lien](https://a.ca)")).toBe("Titre gras et lien");
  });

  it("compte au moins une minute de lecture", () => {
    expect(readingMinutes("trois mots ici")).toBe(1);
  });

  it("compte environ une minute par tranche de 200 mots", () => {
    expect(readingMinutes(Array(600).fill("mot").join(" "))).toBe(3);
  });

  it("translittère les accents et nettoie les bords", () => {
    expect(slugify("Perruque Bouclée — l'été !")).toBe("perruque-bouclee-l-ete");
  });
});
