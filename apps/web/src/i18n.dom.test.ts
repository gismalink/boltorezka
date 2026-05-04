import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { LANGUAGE_OPTIONS, LOCALE_BY_LANG, TEXT, detectInitialLang } from "./i18n";

describe("i18n constants", () => {
  it("LOCALE_BY_LANG maps ru/en to BCP-47 locales", () => {
    expect(LOCALE_BY_LANG.ru).toBe("ru-RU");
    expect(LOCALE_BY_LANG.en).toBe("en-US");
  });

  it("LANGUAGE_OPTIONS lists ru and en", () => {
    expect(LANGUAGE_OPTIONS.map((o) => o.value)).toEqual(["ru", "en"]);
  });

  it("TEXT.ru and TEXT.en cover the same set of keys", () => {
    const ruKeys = Object.keys(TEXT.ru).sort();
    const enKeys = Object.keys(TEXT.en).sort();
    expect(enKeys).toEqual(ruKeys);
  });

  it("TEXT entries are non-empty strings", () => {
    for (const key of Object.keys(TEXT.ru)) {
      expect(typeof TEXT.ru[key]).toBe("string");
      expect(typeof TEXT.en[key]).toBe("string");
    }
  });
});

describe("detectInitialLang", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("returns saved 'ru' when stored", () => {
    localStorage.setItem("datowave_lang", "ru");
    expect(detectInitialLang()).toBe("ru");
  });

  it("returns saved 'en' when stored", () => {
    localStorage.setItem("datowave_lang", "en");
    expect(detectInitialLang()).toBe("en");
  });

  it("ignores unknown stored value and falls back to navigator.language", () => {
    localStorage.setItem("datowave_lang", "fr");
    vi.spyOn(navigator, "language", "get").mockReturnValue("RU-ru");
    expect(detectInitialLang()).toBe("ru");
  });

  it("falls back to 'ru' when browser language starts with 'ru'", () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("ru-RU");
    expect(detectInitialLang()).toBe("ru");
  });

  it("falls back to 'en' otherwise", () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("de-DE");
    expect(detectInitialLang()).toBe("en");
  });
});
