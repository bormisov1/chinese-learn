import assert from "node:assert/strict";
import test from "node:test";
import { dictionaryAssetUrl } from "./dictionary-url";
import type { AppLanguage } from "./types";

test("web dictionaries remain same-origin", () => {
  assert.equal(dictionaryAssetUrl("en", "web"), "/dictionaries/hsk-en.json");
  assert.equal(dictionaryAssetUrl("ru", "web"), "/dictionaries/hsk-ru.json");
});

test("native dictionaries use the deployed HTTPS origin", () => {
  assert.equal(dictionaryAssetUrl("en", "ios"), "https://zh.x.bormisov.com/dictionaries/hsk-en.json");
  assert.equal(dictionaryAssetUrl("ru", "android"), "https://zh.x.bormisov.com/dictionaries/hsk-ru.json");
});

test("unsupported languages never become a relative native path", () => {
  assert.throws(() => dictionaryAssetUrl("ja" as AppLanguage, "ios"), /Unsupported dictionary language/);
});
