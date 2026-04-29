// Глобальный setup для vitest. В node-окружении `document` отсутствует,
// поэтому подключаем jest-dom матчеры только когда мы в jsdom.
if (typeof document !== "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  await import("@testing-library/jest-dom/vitest");
}
