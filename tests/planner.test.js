import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parse, stringify } from 'lossless-json';
import { parsePlannerUrl, normalizePlannerBuild, fetchPlannerBuild, summarizeBuild, applyPlannerBuild } from '../web/src/core/planner.js';
import { decodeSavedItem, encodeItemData, EQUIPMENT_CONTAINERS, BLESSING_CONTAINERS } from '../web/src/core/items.js';
import { parseSave, serializeSave } from '../web/src/core/save.js';

// Public user-provided example, retrieved from the LET public build API.
// Source: https://www.lastepochtools.com/planner/zh/om6w3Ypq
// This fixture contains no private character save data.
const publicBuild = JSON.parse(readFileSync(new URL('./fixtures/planner-om6w3Ypq.json', import.meta.url), 'utf8'));

const noItems = { equipment: false, idols: false, blessings: false };
const passivesOnly = { ...noItems, skills: false, skillBar: false };

function build() {
  return { data_version: 'Version 1.5.0', data: {
    bio: { level: 100, characterClass: 3, chosenMastery: 1 },
    equipment: {}, idols: [], blessings: {},
    charTree: { treeID: '', version: 3, selected: { 1: 8 } },
    skillTrees: [{ treeID: 'ss37kl', slotNumber: 0, version: 2, level: 20, selected: { 0: 0, 2: 5 } }],
    hud: ['ss37kl', '', '', '', ''],
  } };
}

function save() {
  return parse('{"characterName":"Synthetic","characterClass":3,"chosenMastery":1,"originalMastery":1,"level":91,"currentExp":123,"savedItems":[],"savedCharacterTree":{"treeID":"","version":4,"nodeIDs":[1],"nodePoints":[8],"unspentPoints":96,"nodesTaken":null},"savedSkillTrees":[{"treeID":"ss37kl","slotNumber":1,"xp":5700000,"version":2,"nodeIDs":[2],"nodePoints":[2],"unspentPoints":18,"nodesTaken":null,"abilityXP":0,"futureField":7}],"abilityBar":["","ss37kl","","",""],"characterTreeNodeProgression":[],"sceneProgresses":[{"scene":"Synthetic","savedProgress":18446744073709551615}],"untouched":{"gold":123}}');
}

test('parses Chinese, English, bare codes and strips irrelevant URL parameters', () => {
  assert.equal(parsePlannerUrl(' https://www.lastepochtools.com/planner/zh/om6w3Ypq?utm_source=test#x ').id, 'om6w3Ypq');
  assert.equal(parsePlannerUrl('https://lastepochtools.com/planner/om6w3Ypq').language, 'en');
  assert.equal(parsePlannerUrl('om6w3Ypq').apiUrl, 'https://www.lastepochtools.com/api/public/build_data/om6w3Ypq');
  assert.equal(parsePlannerUrl('lastepochtools.com/planner/en/om6w3Ypq').url, 'https://www.lastepochtools.com/planner/om6w3Ypq');
});

test('rejects arbitrary hosts, credentials, alternate ports and non-planner paths', () => {
  for (const url of ['https://lastepochtools.com.evil.test/planner/om6w3Ypq', 'https://user@lastepochtools.com/planner/om6w3Ypq', 'https://lastepochtools.com:444/planner/om6w3Ypq', 'https://lastepochtools.com/profile/om6w3Ypq', 'https://lastepochtools.com/planner/xx/om6w3Ypq', 'javascript:alert(1)', 'om6w3Yp']) {
    assert.throws(() => parsePlannerUrl(url), { code: 'INVALID_URL' });
  }
});

test('normalization accepts an API envelope and does not retain mutable input references', () => {
  const raw = build();
  const normalized = normalizePlannerBuild(raw, { id: 'om6w3Ypq' });
  raw.data.bio.level = 1;
  assert.equal(normalized.data.bio.level, 100);
  assert.equal(normalized.id, 'om6w3Ypq');
  assert.equal(summarizeBuild(normalized).passivePoints, 8);
});

test('normalization rejects prototype keys and missing version', () => {
  const raw = build();
  delete raw.data_version;
  assert.throws(() => normalizePlannerBuild(raw), { code: 'MISSING_BUILD_VERSION' });
  const poisoned = JSON.parse(JSON.stringify(build()).replace('"equipment":{}', '"equipment":{"__proto__":{}}'));
  assert.throws(() => normalizePlannerBuild(poisoned), { code: 'INVALID_BUILD' });
});

test('fetch uses only the public API with omitted credentials and accepts JSON', async t => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://www.lastepochtools.com/api/public/build_data/om6w3Ypq');
    assert.equal(options.credentials, 'omit');
    return new Response(JSON.stringify(build()), { headers: { 'content-type': 'application/json' } });
  });
  const result = await fetchPlannerBuild('om6w3Ypq');
  assert.equal(result.dataVersion, 'Version 1.5.0');
});

test('fetch reports challenge pages and missing builds instead of parsing them as success', async t => {
  const mock = t.mock.method(globalThis, 'fetch', async () => new Response('<html>challenge</html>'));
  await assert.rejects(fetchPlannerBuild('om6w3Ypq'), { code: 'BUILD_FETCH_FAILED' });
  mock.mock.mockImplementation(async () => new Response('', { status: 404 }));
  await assert.rejects(fetchPlannerBuild('om6w3Ypq'), { code: 'BUILD_NOT_FOUND' });
});

test('fetch combines user cancellation with a twenty-second deadline and reports network errors', async t => {
  const timeoutSignal = new AbortController().signal;
  t.mock.method(AbortSignal, 'timeout', milliseconds => {
    assert.equal(milliseconds, 20000);
    return timeoutSignal;
  });
  const user = new AbortController();
  const mock = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.ok(options.signal instanceof AbortSignal);
    user.abort();
    options.signal.throwIfAborted();
  });
  await assert.rejects(fetchPlannerBuild('om6w3Ypq', { signal: user.signal }), { name: 'AbortError' });
  mock.mock.mockImplementation(async () => { throw new TypeError('network unavailable'); });
  await assert.rejects(fetchPlannerBuild('om6w3Ypq'), { code: 'BUILD_FETCH_FAILED' });
});

test('fetch reports its deadline separately from user cancellation', async t => {
  const deadline = new AbortController();
  t.mock.method(AbortSignal, 'timeout', () => deadline.signal);
  t.mock.method(globalThis, 'fetch', async () => {
    deadline.abort();
    deadline.signal.throwIfAborted();
  });
  await assert.rejects(fetchPlannerBuild('om6w3Ypq'), { code: 'BUILD_FETCH_TIMEOUT' });
});

test('validates old tree nodes then writes current version without losing large save integers', () => {
  const original = save();
  const before = stringify(original);
  const result = applyPlannerBuild(original, build(), { ...noItems, level: true });
  assert.equal(stringify(original), before);
  assert.equal(result.data.savedCharacterTree.version, 4);
  assert.equal(result.data.savedCharacterTree.unspentPoints, 105);
  assert.deepEqual(result.data.savedCharacterTree.nodeIDs, [1]);
  assert.equal(Number(result.data.level), 100);
  assert.equal(result.data.currentExp, 0);
  assert.equal(result.data.sceneProgresses[0].savedProgress.toString(), '18446744073709551615');
  assert.equal(result.data.savedSkillTrees[0].futureField.toString(), '7');
  assert.equal(result.data.savedSkillTrees[0].xp, 5700000);
  assert.equal(result.data.savedSkillTrees[0].slotNumber, 0);
  assert.equal(result.data.untouched.gold.toString(), '123');
  assert.ok(result.warnings.some(warning => warning.includes('3 → 4')));
});

test('rejects unknown nodes and newer tree versions', () => {
  const raw = build();
  raw.data.charTree.selected = { 255: 1 };
  assert.throws(() => applyPlannerBuild(save(), raw, passivesOnly), { code: 'INCOMPATIBLE_TREE' });
  raw.data.charTree.selected = { 1: 8 };
  raw.data.charTree.version = 99;
  assert.throws(() => applyPlannerBuild(save(), raw, passivesOnly), { code: 'FUTURE_TREE_VERSION' });
});

test('rejects points beyond node caps and unmet mastery requirements', () => {
  const raw = build();
  raw.data.charTree.selected = { 1: 9 };
  assert.throws(() => applyPlannerBuild(save(), raw, passivesOnly), { code: 'INCOMPATIBLE_TREE' });
  raw.data.charTree.selected = { 11: 5 };
  assert.throws(() => applyPlannerBuild(save(), raw, passivesOnly), { code: 'INVALID_TREE_REQUIREMENTS' });
});

test('does not create passive quest rewards or silently grant missing passive points', () => {
  const original = save();
  original.savedCharacterTree.unspentPoints = 0;
  const raw = build();
  raw.data.charTree.selected = { 1: 8, 4: 8 };
  assert.throws(() => applyPlannerBuild(original, raw, passivesOnly), { code: 'INSUFFICIENT_PASSIVE_POINTS' });
  assert.equal(Number(original.level), 91);
});

test('requires deliberate class import and complete tree replacement on class change', () => {
  const original = save();
  original.characterClass = 1;
  assert.throws(() => applyPlannerBuild(original, build(), noItems), { code: 'CLASS_MISMATCH' });
  assert.throws(() => applyPlannerBuild(original, build(), { ...passivesOnly, class: true }), { code: 'CLASS_REQUIRES_TREES' });
});

test('uses the extracted skill XP table for a new skill and removes zero-point root markers', () => {
  const original = save();
  original.savedSkillTrees = [];
  const raw = build();
  raw.data.skillTrees[0].level = 5;
  const result = applyPlannerBuild(original, raw, noItems);
  assert.equal(result.data.savedSkillTrees[0].xp, 20000);
  assert.deepEqual(result.data.savedSkillTrees[0].nodeIDs, [2]);
  assert.deepEqual(result.data.savedSkillTrees[0].nodePoints, [5]);
});

test('rejects duplicate specialization slots and locked slots', () => {
  const raw = build();
  raw.data.skillTrees.push({ ...raw.data.skillTrees[0] });
  assert.throws(() => applyPlannerBuild(save(), raw, noItems), { code: 'DUPLICATE_SKILL' });
  raw.data.skillTrees.pop();
  const original = save();
  original.level = 3;
  assert.throws(() => applyPlannerBuild(original, raw, { ...noItems, passives: false }), { code: 'LOCKED_SKILL_SLOT' });
});

test('rejects cross-class skills and skills locked behind missing mastery points', () => {
  const raw = build();
  raw.data.skillTrees[0] = { treeID: 'fi9', slotNumber: 0, version: 1, level: 20, selected: {} };
  assert.throws(() => applyPlannerBuild(save(), raw, noItems), { code: 'SKILL_CLASS_MISMATCH' });
  raw.data.skillTrees[0] = { treeID: 'ds4d3', slotNumber: 0, version: 5, level: 20, selected: {} };
  assert.throws(() => applyPlannerBuild(save(), raw, noItems), { code: 'LOCKED_SKILL' });
});

test('validates the skill bar while allowing the current class move and evade actions', () => {
  const raw = build();
  raw.data.hud = ['na28', 'evade1', 'ss37kl', 'ba1', ''];
  assert.deepEqual(applyPlannerBuild(save(), raw, noItems).data.abilityBar, raw.data.hud);
  raw.data.hud[0] = 'fi9';
  assert.throws(() => applyPlannerBuild(save(), raw, noItems), { code: 'SKILL_CLASS_MISMATCH' });
});

test('reports unsupported build versions and never mutates on failure', () => {
  const original = save();
  const before = stringify(original);
  const raw = build();
  raw.data_version = 'Version 1.4.0';
  assert.throws(() => applyPlannerBuild(original, raw, noItems), { code: 'UNSUPPORTED_BUILD_VERSION' });
  assert.equal(stringify(original), before);
});

test('never silently claims to synchronize the unverified Weaver tree', () => {
  assert.throws(() => applyPlannerBuild(save(), build(), { ...noItems, weaverTree: true }), { code: 'UNSUPPORTED_WEAVER_TREE' });
});

test('imports the public example into a synthetic current character with all supported sections', () => {
  const original = save();
  // An unrelated inventory record must remain byte-for-byte intact.
  original.savedItems.push({ containerID: 1, data: [99, 1, 2, 3], inventoryPosition: { x: 0, y: 0 }, quantity: 1 });
  const before = stringify(original);
  const result = applyPlannerBuild(original, publicBuild, { level: true });
  assert.equal(stringify(original), before);
  assert.equal(Number(result.data.level), 100);
  assert.equal(Number(result.data.characterClass), 3);
  assert.equal(Number(result.data.savedCharacterTree.version), 4);
  assert.equal(result.data.savedCharacterTree.nodePoints.reduce((a, b) => a + Number(b), 0), 112);
  assert.equal(Number(result.data.savedCharacterTree.unspentPoints), 1);
  assert.equal(result.data.savedSkillTrees.length, 5);
  assert.deepEqual(result.data.savedSkillTrees.map(t => t.treeID), publicBuild.data.skillTrees.map(t => t.treeID));
  assert.deepEqual(result.data.abilityBar, publicBuild.data.hud);
  for (const slot of Object.values(EQUIPMENT_CONTAINERS)) assert.equal(result.data.savedItems.filter(item => Number(item.containerID) === slot).length, 1);
  for (const slot of BLESSING_CONTAINERS) assert.equal(result.data.savedItems.filter(item => Number(item.containerID) === slot).length, 1);
  assert.equal(result.data.savedItems.filter(item => Number(item.containerID) === 29).length, 11);
  const generated = result.data.savedItems.filter(item => Number(item.containerID) !== 1);
  assert.equal(generated.length, 33);
  const ids = new Set();
  for (const item of generated) {
    const decoded = decodeSavedItem(item);
    assert.equal(decoded.supported, true);
    assert.equal(decoded.version, 6);
    assert.deepEqual(encodeItemData(decoded), item.data);
    assert.ok(!ids.has(decoded.individualId));
    ids.add(decoded.individualId);
  }
  assert.equal(stringify(result.data.savedItems[0]), stringify(original.savedItems[0]));
  assert.equal(result.data.sceneProgresses[0].savedProgress.toString(), '18446744073709551615');
  assert.ok(result.warnings.some(w => w.includes('27')));
});

test('optionally imports into a local backed-up character without touching its file', {
  skip: !process.env.LE_LOCAL_CHARACTER_FIXTURE,
}, () => {
  const path = process.env.LE_LOCAL_CHARACTER_FIXTURE;
  const text = readFileSync(path, 'utf8');
  const doc = parseSave(text, basename(path));
  const result = applyPlannerBuild(doc.data, publicBuild, { level: true });
  const output = serializeSave({ ...doc, data: result.data });
  const reparsed = parseSave(output, basename(path));
  const changed = new Set(['savedItems', 'level', 'currentExp', 'savedCharacterTree', 'characterTreeNodeProgression', 'savedSkillTrees', 'abilityBar']);
  for (const key of Object.keys(doc.data)) {
    if (!changed.has(key)) assert.equal(stringify(reparsed.data[key]), stringify(doc.data[key]), `unrelated field ${key}`);
  }
  assert.equal(reparsed.data.savedSkillTrees.length, 5);
  assert.equal(Number(reparsed.data.level), 100);
  assert.equal(Number(reparsed.data.savedCharacterTree.unspentPoints), 1);
  assert.equal(readFileSync(path, 'utf8'), text);
});
