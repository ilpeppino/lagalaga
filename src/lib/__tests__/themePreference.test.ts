import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeThemePreference } from '../themePreference';

test('normalizeThemePreference: known values are preserved', () => {
  assert.equal(normalizeThemePreference('light'), 'light');
  assert.equal(normalizeThemePreference('dark'), 'dark');
  assert.equal(normalizeThemePreference('system'), 'system');
});

test('normalizeThemePreference: null defaults to system', () => {
  assert.equal(normalizeThemePreference(null), 'system');
});

test('normalizeThemePreference: unknown string defaults to system', () => {
  assert.equal(normalizeThemePreference('auto'), 'system');
  assert.equal(normalizeThemePreference(''), 'system');
  assert.equal(normalizeThemePreference('LIGHT'), 'system');
});
