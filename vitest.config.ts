import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "server-only": fileURLToPath(new URL("./tests/server-only-stub.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: [
      "src/**/*.test.ts",
      "scripts/**/*.test.ts",
      "tests/**/*.test.ts",
    ],
    exclude: ["apps/**", "packages/**", "node_modules/**", ".next/**"],
    environment: "node",
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      reporter: ["text", "json", "html"],
      include: ["src/server/**/*.ts"],
      exclude: ["src/server/**/*.test.ts"],
    },
  },
});
