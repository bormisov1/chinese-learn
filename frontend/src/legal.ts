export type LegalCredit = {
  name: string;
  license: string;
  use: string;
  source?: string;
  fullText?: string;
  notice?: string;
  adaptedData?: string;
};

export const LEGAL_CREDITS: LegalCredit[] = [
  {
    name: "CC-CEDICT English dictionary",
    license: "CC BY-SA 4.0",
    use: "English dictionary data. Hanzi Deck filters, normalizes, and combines the source data; the adapted dictionary remains available under CC BY-SA 4.0.",
    source: "https://cc-cedict.org/editor/editor.php?handler=Download",
    fullText: "https://creativecommons.org/licenses/by-sa/4.0/legalcode",
    notice: "/legal/CC-CEDICT-NOTICE.txt",
    adaptedData: "/dictionaries/hsk-en.json",
  },
  {
    name: "complete-hsk-vocabulary",
    license: "MIT",
    use: "HSK levels, forms, readings, and metadata. Pinned to commit 7ac65bf1a6387d35f1ade478906172a19311c7f9.",
    source: "https://github.com/drkameleon/complete-hsk-vocabulary/tree/7ac65bf1a6387d35f1ade478906172a19311c7f9",
    fullText: "/legal/HSK-Vocab-MIT.txt",
  },
  {
    name: "HanziLookup (web handwriting)",
    license: "LGPL-3.0",
    use: "Unmodified Rust/WASM web recognizer build. Corresponding source is pinned to commit 01f90c3ab99a8fadf0696c28e5eb097223c500db.",
    source: "https://github.com/gugray/hanzi_lookup/tree/01f90c3ab99a8fadf0696c28e5eb097223c500db",
    fullText: "/legal/HanziLookup-LGPL-3.0.txt",
  },
  {
    name: "Make Me a Hanzi stroke data",
    license: "Arphic Public License",
    use: "Character stroke data used by the web handwriting recognizer.",
    source: "https://github.com/skishore/makemeahanzi",
    fullText: "/legal/Arphic-Public-License.txt",
  },
  {
    name: "Google ML Kit",
    license: "Google APIs and ML Kit Terms",
    use: "On-device native handwriting and Chinese photo-text recognition. Production/commercial use is subject to Google's terms.",
    source: "https://developers.google.com/ml-kit",
    fullText: "https://developers.google.com/ml-kit/terms",
  },
  {
    name: "Tesseract.js and traineddata",
    license: "Apache-2.0",
    use: "Web photo-text recognition; language data is pinned to the 4.0.0_best_int release family.",
    source: "https://github.com/naptha/tesseract.js/tree/v7.0.0",
    fullText: "/legal/TesseractJS-Apache-2.0.txt",
  },
  {
    name: "OpenCC-js / OpenCC data",
    license: "MIT / Apache-2.0",
    use: "Traditional–simplified Chinese conversion.",
    source: "https://github.com/nk2028/opencc-js/tree/v1.4.2",
    fullText: "/legal/OpenCC-licenses.txt",
  },
  {
    name: "Ionicons via Expo Vector Icons",
    license: "MIT",
    use: "Interface icons.",
    source: "https://github.com/expo/vector-icons/tree/v15.1.1",
    fullText: "/legal/Expo-Vector-Icons-MIT.txt",
  },
  {
    name: "RevenueCat React Native SDK",
    license: "MIT",
    use: "Subscriptions and entitlement status.",
    source: "https://github.com/RevenueCat/react-native-purchases/releases/tag/11.0.0",
    fullText: "/legal/RevenueCat-MIT.txt",
  },
  {
    name: "Noto Sans CJK",
    license: "SIL Open Font License 1.1",
    use: "Rasterized text in generated store artwork only; the font is not bundled in the app.",
    source: "https://github.com/notofonts/noto-cjk",
    fullText: "https://openfontlicense.org/open-font-license-official-text/",
  },
];

export const LEGAL_ASSET_ORIGIN = "https://zh.x.bormisov.com";

export function legalUrl(url: string, platform: string): string {
  if (!url.startsWith("/")) return url;
  return platform === "web" ? url : `${LEGAL_ASSET_ORIGIN}${url}`;
}
