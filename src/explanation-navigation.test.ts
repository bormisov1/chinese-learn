import assert from 'node:assert/strict';
import test from 'node:test';
import { explanationReturnPath } from './explanation-navigation';

test('explanation returns to the page that opened it', () => {
  for (const path of ['/', '/cards', '/practice', '/listening', '/mix', '/settings']) {
    assert.equal(explanationReturnPath(path), path);
  }
});

test('direct links and invalid return paths safely return home', () => {
  for (const path of [undefined, '', '/explanation', '//example.com', 'https://example.com', '/cards?next=example.com']) {
    assert.equal(explanationReturnPath(path), '/');
  }
});
