import { defineConfig } from "vitest/config";

export default defineConfig({
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
