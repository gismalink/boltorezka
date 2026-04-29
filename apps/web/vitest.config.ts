import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    // По умолчанию тесты идут в node-окружении (быстрее и безопаснее).
    // Тесты, которым нужен DOM, должны помечаться `// @vitest-environment jsdom`
    // в первой строке файла либо лежать с суффиксом `.dom.test.ts(x)`.
    environment: "node",
    environmentMatchGlobs: [
      ["src/**/*.dom.test.ts", "jsdom"],
      ["src/**/*.dom.test.tsx", "jsdom"]
    ],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["src/test-setup.ts"]
  }
});
