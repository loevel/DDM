import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["app/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "~": resolve(__dirname, "app"),
    },
  },
});
