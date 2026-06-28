import { build } from "esbuild";
import { writeFileSync } from "fs";

await build({
  entryPoints: ["server.ts"],
  bundle: true,
  outfile: "build/client/_worker.js",
  format: "esm",
  platform: "browser",
  conditions: ["worker", "browser"],
  external: ["__STATIC_CONTENT_MANIFEST", "cloudflare:email"],
  minify: false,
  sourcemap: false,
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  loader: { ".ts": "ts", ".tsx": "tsx" },
});

console.log("✓ Worker bundlé → build/client/_worker.js");
