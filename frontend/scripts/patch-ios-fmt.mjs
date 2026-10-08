import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// fmt 11.0.2 bundled with React Native fails Apple Clang's consteval checks on Xcode 26.
// Remove this workaround when React Native ships a compatible fmt release.
// https://github.com/expo/expo/issues/44229
const header = join('ios', 'Pods', 'fmt', 'include', 'fmt', 'base.h');
const original = readFileSync(header, 'utf8');
const patched = original.replace(
  /(^\s*#\s*define\s+FMT_USE_CONSTEVAL\s+)1(?=\s*(?:\/\/.*)?$)/gm,
  (_match, prefix) => `${prefix}0`,
);

if (!original.includes('FMT_USE_CONSTEVAL')) {
  throw new Error(`fmt consteval setting not found in ${header}`);
}
if (patched !== original) {
  chmodSync(header, 0o644);
  writeFileSync(header, patched);
  console.log('Disabled fmt consteval checks for Xcode 26');
} else {
  console.log('fmt consteval workaround is no longer needed');
}
