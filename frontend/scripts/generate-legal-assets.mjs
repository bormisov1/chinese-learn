import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "public", "legal");
await mkdir(output, { recursive: true });

const copies = [
  ["third-party/CC-CEDICT-NOTICE", "CC-CEDICT-NOTICE.txt"],
  ["third-party/HSK-Vocab-LICENSE", "HSK-Vocab-MIT.txt"],
  ["third-party/hanzi-lookup/LICENSE", "HanziLookup-LGPL-3.0.txt"],
  ["third-party/hanzi-lookup/LICENSE-APL", "Arphic-Public-License.txt"],
  ["node_modules/tesseract.js/LICENSE.md", "TesseractJS-Apache-2.0.txt"],
  ["node_modules/react-native-purchases/LICENSE", "RevenueCat-MIT.txt"],
];
for (const [source, name] of copies) {
  await writeFile(path.join(output, name), await readFile(path.join(root, source), "utf8"));
}
const opencc = [
  await readFile(path.join(root, "node_modules/opencc-js/LICENSE"), "utf8"),
  await readFile(path.join(root, "node_modules/opencc-js/LICENSES/Apache-2.0.txt"), "utf8"),
].join("\n\n--- OpenCC dictionary data ---\n\n");
await writeFile(path.join(output, "OpenCC-licenses.txt"), opencc);
const icons = [
  await readFile(path.join(root, "node_modules/@expo/vector-icons/LICENSE"), "utf8"),
  await readFile(path.join(root, "node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/LICENSE"), "utf8"),
  await readFile(path.join(root, "third-party/Ionicons-LICENSE"), "utf8"),
].join("\n\n--- Component license ---\n\n");
await writeFile(path.join(output, "Expo-Vector-Icons-MIT.txt"), icons);

const lock = JSON.parse(await readFile(path.join(root, "package-lock.json"), "utf8"));
const sections = [];
for (const [packagePath, metadata] of Object.entries(lock.packages)) {
  if (!packagePath.includes("node_modules/") || metadata.dev || metadata.link) continue;
  const directory = path.join(root, packagePath);
  let manifest;
  try { manifest = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8")); }
  catch { continue; }
  const candidates = ["LICENSE", "LICENSE.md", "LICENSE.txt", "LICENCE", "COPYING"];
  let licenseText = "No local license file found; see the source URL and package metadata.";
  for (const candidate of candidates) {
    try { licenseText = await readFile(path.join(directory, candidate), "utf8"); break; }
    catch {}
  }
  const repository = typeof manifest.repository === "string" ? manifest.repository : manifest.repository?.url;
  const legacyLicenses = Array.isArray(manifest.licenses)
    ? manifest.licenses.map(item => typeof item === "string" ? item : item.type).filter(Boolean).join(" OR ")
    : typeof manifest.licenses === "string" ? manifest.licenses : undefined;
  sections.push([
    `${manifest.name}@${manifest.version}`,
    `License metadata: ${manifest.license ?? legacyLicenses ?? metadata.license ?? "not declared"}`,
    `Source: ${repository ?? manifest.homepage ?? "not declared"}`,
    "",
    licenseText.trim(),
  ].join("\n"));
}
await writeFile(path.join(output, "third-party-software.txt"), [
  "Hanzi Deck installed non-development dependency license inventory",
  "Generated from package-lock.json and installed package license files. This intentionally over-includes transitive build/CLI tools that ship inside runtime package dependencies.",
  "",
  ...sections.sort((a, b) => a.localeCompare(b)),
].join("\n\n============================================================\n\n"));

const provenance = JSON.parse(await readFile(path.join(root, "third-party/provenance.json"), "utf8"));
for (const item of provenance.artifacts) {
  const bytes = await readFile(path.join(root, item.path));
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== item.sha256) throw new Error(`Hash mismatch: ${item.path}`);
}
await writeFile(path.join(output, "provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`);
