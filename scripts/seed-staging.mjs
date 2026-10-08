#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Peuple la base de STAGING avec les produits de démonstration.
//
// Pourquoi ce script existe : la base de staging était vide de produits, alors
// que la boutique en affichait six. Le repli `DEMO_PRODUCTS` masquait le vide
// dans les loaders, mais `POST /api/cart` n'a pas ce repli et répondait
// « Produit introuvable » — aucun panier ne pouvait être constitué, donc aucun
// parcours de commande n'était exerçable sur une preview.
//
// La source de vérité reste `app/lib/demo-products.ts` : on l'importe plutôt
// que de recopier les produits ici, pour que les deux ne puissent pas diverger.
//
// Usage :
//   node scripts/seed-staging.mjs            applique à la base de staging
//   node scripts/seed-staging.mjs --sql      affiche le SQL sans rien écrire
// ─────────────────────────────────────────────────────────────────────────────

import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Jamais un paramètre, délibérément.
 *
 * La base de production (`ddm-wigs-db`) porte les vraies commandes et les
 * vraies clientes. Un script de peuplement qui accepterait un nom de base
 * n'attendrait qu'une faute de frappe pour y injecter des produits fictifs.
 * Pour viser une autre base, il faut modifier cette ligne — c'est-à-dire
 * passer par une relecture.
 */
const BASE = "ddm-wigs-db-staging";

const COLONNES = [
  "id", "slug", "name", "description", "price_cad", "compare_at_price_cad",
  "category", "famille", "stock", "image_key", "featured", "type_lace",
  "texture", "longueur_po", "densite", "couleur", "hd_lace", "glueless",
  "pret_a_porter", "quantite_meches",
];

/** Littéral SQL : les apostrophes sont doublées (`l'été` → `l''été`). */
function litteral(valeur) {
  if (valeur === null || valeur === undefined) return "NULL";
  if (typeof valeur === "number") return String(valeur);
  return "'" + String(valeur).split("'").join("''") + "'";
}

async function chargerProduits() {
  try {
    // Node ≥ 22 sait lire ce module TypeScript directement : son unique import
    // est un `import type`, retiré au passage, donc l'alias `~` n'a jamais à
    // être résolu.
    const module = await import("../app/lib/demo-products.ts");
    return module.DEMO_PRODUCTS;
  } catch (erreur) {
    console.error(
      "Impossible de lire app/lib/demo-products.ts.\n" +
        "Ce script a besoin de Node 22 ou plus récent pour importer un module " +
        "TypeScript sans transpilation.\n" +
        `Node détecté : ${process.version}\n`
    );
    throw erreur;
  }
}

function construireSql(produits) {
  const lignes = produits
    .map(p => "  (" + COLONNES.map(c => litteral(p[c])).join(", ") + ")")
    .join(",\n");

  return [
    `-- Produits de démonstration — base ${BASE}.`,
    "-- Généré par scripts/seed-staging.mjs depuis app/lib/demo-products.ts.",
    "-- OR IGNORE : rejouable sans écraser un stock déjà ajusté à la main.",
    "",
    "INSERT OR IGNORE INTO products",
    "  (" + COLONNES.join(", ") + ")",
    "VALUES",
    lignes + ";",
    "",
  ].join("\n");
}

const produits = await chargerProduits();
const sql = construireSql(produits);

if (process.argv.includes("--sql")) {
  process.stdout.write(sql);
  process.exit(0);
}

const fichier = join(mkdtempSync(join(tmpdir(), "ddm-seed-")), "produits.sql");
writeFileSync(fichier, sql, "utf8");

console.log(`${produits.length} produits → ${BASE}`);
const resultat = spawnSync(
  "npx",
  ["wrangler", "d1", "execute", BASE, "--remote", "-y", `--file=${fichier}`],
  { stdio: "inherit" }
);
process.exit(resultat.status ?? 1);
