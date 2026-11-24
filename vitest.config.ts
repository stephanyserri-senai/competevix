import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/db/**/*.test.ts"],
    environment: "node",
    // Testes de banco usam fixtures isoladas, mas rodam em série para evitar disputa por locks
    fileParallelism: false,
    testTimeout: 20000,
  },
});
