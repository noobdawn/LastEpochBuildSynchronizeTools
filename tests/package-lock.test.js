import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));

test('committed registry dependencies have complete versions and verified official tarballs', () => {
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (!path || entry.link) continue;
    // A versionless optional-platform stub can pass an existing local install
    // and still make a fresh npm ci fail with "Invalid Version:".
    assert.equal(typeof entry.version, 'string', `${path} is missing its locked version`);
    assert.match(entry.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/, path);
    assert.equal(new URL(entry.resolved).origin, 'https://registry.npmjs.org', path);
    assert.match(entry.integrity, /^sha(?:256|384|512)-\S+$/, path);
  }
});

test('Rolldown locks every optional native platform binding at the required version', () => {
  const parentPath = 'node_modules/rolldown';
  const parent = lock.packages[parentPath];
  for (const [name, version] of Object.entries(parent.optionalDependencies)) {
    const entry = lock.packages[`${parentPath}/node_modules/${name}`] ?? lock.packages[`node_modules/${name}`];
    assert.ok(entry, `${name} is missing from the lockfile`);
    assert.equal(entry.version, version, name);
    assert.equal(entry.optional, true, name);
    assert.ok(entry.os?.length && entry.cpu?.length, `${name} needs platform constraints`);
  }
});
