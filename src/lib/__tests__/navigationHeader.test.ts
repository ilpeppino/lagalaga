import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  APP_HEADER_TITLE_FONT_FAMILY,
  APP_HEADER_TITLE_MAX_WIDTH,
  APP_HEADER_TITLE_MINIMUM_FONT_SCALE,
} from '../navigationHeader';

test('navigation header constants are set for brand title rendering', () => {
  assert.equal(APP_HEADER_TITLE_FONT_FAMILY, 'BitcountSingle-Regular');
  assert.equal(APP_HEADER_TITLE_MAX_WIDTH, '72%');
  assert.equal(APP_HEADER_TITLE_MINIMUM_FONT_SCALE, 0.8);
});

test('AppHeaderTitle enforces single-line dynamic fitting and constrained width', () => {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), 'components/navigation/AppHeaderTitle.tsx'),
    'utf8'
  );

  assert.match(source, /numberOfLines=\{1\}/);
  assert.match(source, /adjustsFontSizeToFit/);
  assert.match(source, /minimumFontScale=\{APP_HEADER_TITLE_MINIMUM_FONT_SCALE\}/);
  assert.match(source, /maxWidth:\s*APP_HEADER_TITLE_MAX_WIDTH/);
  assert.match(source, /fontFamily:\s*APP_HEADER_TITLE_FONT_FAMILY/);
});

test('all main navigators use AppHeaderTitle', () => {
  const layoutPaths = [
    'app/_layout.tsx',
    'app/(tabs)/_layout.tsx',
    'app/sessions/_layout.tsx',
    'app/invite/_layout.tsx',
    'app/invites/_layout.tsx',
  ];

  for (const relativePath of layoutPaths) {
    const source = fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
    assert.match(source, /AppHeaderTitle/);
  }
});

test('sessions custom header title uses brand font with fit behavior', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'app/sessions/index-v2.tsx'), 'utf8');

  assert.match(source, /APP_HEADER_TITLE_FONT_FAMILY/);
  assert.match(source, /numberOfLines=\{1\}/);
  assert.match(source, /adjustsFontSizeToFit/);
  assert.match(source, /minimumFontScale=\{APP_HEADER_TITLE_MINIMUM_FONT_SCALE\}/);
  assert.match(source, /maxWidth:\s*APP_HEADER_TITLE_MAX_WIDTH/);
});

test('sessions dock buttons use action-reflective icons and labels', () => {
  const sessionsSource = fs.readFileSync(path.resolve(process.cwd(), 'app/sessions/index-v2.tsx'), 'utf8');
  const iconSource = fs.readFileSync(path.resolve(process.cwd(), 'components/ui/icon-symbol.tsx'), 'utf8');

  assert.match(sessionsSource, /name="bolt\.fill"/);
  assert.match(sessionsSource, /name="plus"/);
  assert.match(sessionsSource, /'Quick Play'/);
  assert.match(sessionsSource, />Create<\/Text>/);
  assert.doesNotMatch(sessionsSource, /questionmark|help\.circle|help-outline/);

  assert.match(iconSource, /'bolt\.fill':\s*'bolt'/);
  assert.match(iconSource, /plus:\s*'add'/);
});
