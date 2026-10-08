import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// Search expression for Russian/English mixtures, before product-name filtering:
// /(?=.*\p{Script=Cyrillic})(?=.*\p{Script=Latin})/u
const translations = JSON.parse(fs.readFileSync(new URL('../src/data/ui-translations.json', import.meta.url), 'utf8'));
const i18nPath = new URL('../src/i18n.tsx', import.meta.url);
const i18nSource = ts.createSourceFile('i18n.tsx', fs.readFileSync(i18nPath, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const contextual = { ru: {}, th: {} };
const normalize = value => value.replace(/\s+/g, ' ').trim();
const productTerms = /\b(?:DeepSeek|API|SRS|HSK|JSON|AI|V4|Flash|Telegram|Google|Gmail|TestFlight|iPhone|iOS|Hanzi Deck|HanziLookup|Rust\/WASM|LGPL|Arphic Public License)\b/gi;
const unchanged = new Set(['L', 'sk-…', 'DEEPSEEK', 'HSK-']);

function walk(node, visit) {
  visit(node);
  ts.forEachChild(node, child => walk(child, visit));
}

walk(i18nSource, node => {
  if (!ts.isVariableDeclaration(node) || node.name.getText(i18nSource) !== 'contextualTranslations') return;
  for (const locale of node.initializer.properties) {
    const code = locale.name.getText(i18nSource);
    if (!(code in contextual)) continue;
    for (const entry of locale.initializer.properties) {
      if (ts.isStringLiteral(entry.name) && ts.isStringLiteral(entry.initializer)) {
        contextual[code][entry.name.text] = entry.initializer.text;
      }
    }
  }
});

function sourceFiles(inputs) {
  const result = [];
  for (const input of inputs) {
    const absolute = path.resolve(input);
    if (fs.statSync(absolute).isDirectory()) {
      result.push(...sourceFiles(fs.readdirSync(absolute).map(name => path.join(absolute, name))));
    } else if (/\.(ts|tsx)$/.test(absolute) && !/\.test\.(ts|tsx)$/.test(absolute) && !absolute.endsWith('i18n.tsx')) {
      result.push(absolute);
    }
  }
  return result;
}

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const inputs = args.filter(arg => arg !== '--strict');
const files = sourceFiles(inputs.length ? inputs : ['app', 'src']);
const candidates = new Map();
for (const file of files) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const add = (node, value) => {
    const text = normalize(value);
    if (!text || unchanged.has(text) || !/\p{Script=Latin}/u.test(text)) return;
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    candidates.set(`${file}:${line}:${text}`, { file: path.relative(process.cwd(), file), line, text });
  };
  walk(source, node => {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === 'Text') {
      for (const child of node.children) {
        if (ts.isJsxText(child)) add(child, child.getText(source));
        else if (ts.isJsxExpression(child) && child.expression && (ts.isStringLiteral(child.expression) || ts.isNoSubstitutionTemplateLiteral(child.expression))) add(child, child.expression.text);
      }
    }
    if (ts.isJsxAttribute(node) && /^(label|title|subtitle|eyebrow|placeholder)$/.test(node.name.text) && node.initializer && ts.isStringLiteral(node.initializer)) add(node, node.initializer.text);
    if (ts.isCallExpression(node) && node.arguments.length && /^(t|translate)$/.test(node.expression.getText(source))) {
      const argument = node.expression.getText(source) === 'translate' ? node.arguments[1] : node.arguments[0];
      if (argument && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))) add(argument, argument.text);
    }
  });
}

function lookup(locale, source) {
  const entries = { ...translations[locale], ...contextual[locale] };
  return entries[source] ?? Object.entries(entries).find(([key]) => normalize(key) === normalize(source))?.[1];
}

function mixedText(locale, value) {
  const withoutNames = value.replace(productTerms, '');
  const localScript = locale === 'ru' ? /\p{Script=Cyrillic}/u : /\p{Script=Thai}/u;
  return localScript.test(withoutNames) && /\p{Script=Latin}/u.test(withoutNames);
}

let findings = 0;
for (const { file, line, text } of candidates.values()) {
  for (const locale of ['ru', 'th']) {
    const translated = lookup(locale, text);
    if (!translated) {
      console.log(`${file}:${line} [${locale}] missing full translation: ${JSON.stringify(text)}`);
      findings++;
    } else if (mixedText(locale, translated)) {
      console.log(`${file}:${line} [${locale}] mixed scripts: ${JSON.stringify(translated)}`);
      findings++;
    }
  }
}
console.log(`Checked ${candidates.size} UI strings in ${files.length} files; ${findings} finding(s).`);
if (strict && findings) process.exitCode = 1;
