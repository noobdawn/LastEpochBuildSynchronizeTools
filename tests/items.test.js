import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import LZString from 'lz-string';
import { parse, stringify } from 'lossless-json';
import { decodeSavedItem, encodeItemData, encodePlannerItem, applyPlannerItems, resolvePlannerItemId } from '../web/src/core/items.js';

const baseId = (base, subtype) => `I${LZString.compressToBase64(`1${String(base).padStart(3, '0')}${String(subtype).padStart(3, '0')}000`).replace(/=+$/, '')}`;
const affixId = id => `A${LZString.compressToBase64(String(id)).replace(/=+$/, '')}`;

test('decodes LET identifiers independently of minified website code or lookup tables', () => {
  assert.deepEqual(resolvePlannerItemId('UAwRgrALA7CQ'), { baseTypeId: 0, subTypeId: 15, uniqueId: 471 });
  assert.deepEqual(resolvePlannerItemId('UAzCMIDiA'), { baseTypeId: 1, subTypeId: 1, uniqueId: 8 });
  assert.deepEqual(resolvePlannerItemId('IIwBgzALATMDsIKA'), { baseTypeId: 34, subTypeId: 217 });
  assert.deepEqual(resolvePlannerItemId(baseId(41, 3)), { baseTypeId: 41, subTypeId: 3 });
  assert.throws(() => resolvePlannerItemId('Ibroken'), { code: 'UNKNOWN_PLANNER_ITEM' });
  assert.throws(() => resolvePlannerItemId(baseId(41, 250)), { code: 'UNKNOWN_GAME_ITEM' });
});

test('golden v6 legendary layout uses four-byte identity, eight unique rolls and packed affix tier', () => {
  // Synthetic values laid out according to ItemData.RebuildID, game 1.5.2.1.
  const golden = [6, 1, 2, 3, 4, 0, 15, 9, 128, 0, 128, 255, 1, 215, 1, 2, 3, 4, 5, 6, 7, 8, 1, 97, 152, 255];
  const decoded = decodeSavedItem(golden);
  assert.equal(decoded.individualId, 0x01020304);
  assert.equal(decoded.uniqueId, 471);
  assert.deepEqual(decoded.affixes, [{ affixId: 408, tier: 7, roll: 255 }]);
  assert.deepEqual(encodeItemData(decoded), golden);
  const saved = encodePlannerItem({ id: 'UAwRgrALA7CQ', affixes: [{ id: 'ACwBgHEA', tier: 7, r: 255 }], ir: [0, 128, 255], ur: [1, 2, 3, 4, 5, 6, 7, 8] }, { containerID: 2, individualId: 0x01020304 });
  assert.deepEqual(saved.data, golden);
});

test('normal v6 sealed and corrupted affix flags preserve their ordered blocks', () => {
  const item = encodePlannerItem({ id: baseId(2, 2), affixes: [{ id: affixId(26), tier: 6, r: 0 }],
    sealedAffix: { id: affixId(32), tier: 3, r: 100 }, corruptedAffix: { id: affixId(86), tier: 4, r: 250 } },
  { containerID: 7, individualId: 16 });
  assert.equal(item.data[8], 144);
  assert.equal(item.data[13], 195);
  assert.deepEqual(decodeSavedItem(item).affixes.map(x => x.affixId), [32, 86, 26]);
  assert.deepEqual(encodeItemData(decodeSavedItem(item)), item.data);
});

test('Weaver legendary remainder uses high five bits; primordial uniques use the ordinary unique layout', () => {
  const weaver = encodePlannerItem({ id: 'UAwRgTAzMxA', affixes: [{ id: affixId(26), tier: 5 }], ww: 13 }, { containerID: 12, individualId: 17 });
  assert.equal(weaver.data[7], 9);
  assert.equal(weaver.data[22], 13 * 8 + 1);
  const primordial = encodePlannerItem({ id: 'UAwRgzALBDsQ', affixes: [{ id: affixId(26), tier: 7 }] }, { containerID: 5, individualId: 18 });
  assert.equal(decodeSavedItem(primordial).uniqueId, 447);
  assert.equal(primordial.data[7], 9);
});

test('default rolls are midpoint and invalid new features cannot silently disappear', () => {
  const item = encodePlannerItem({ id: 'IIwBhCY0sg', affixes: [{ id: affixId(26), tier: 6 }] }, { containerID: 7, individualId: 20 });
  assert.deepEqual(item.data.slice(9, 12), [128, 128, 128]);
  assert.equal(item.data.at(-1), 128);
  assert.equal(item.data[12], 0);
  assert.throws(() => encodePlannerItem({ id: 'IIwBhCY0sg', unknownFutureSystem: 1 }, { containerID: 7 }), { code: 'UNSUPPORTED_ITEM_FEATURE' });
  assert.throws(() => encodePlannerItem({ id: 'IIwBhCY0sg', ir: [300] }, { containerID: 7 }), { code: 'INVALID_ROLL' });
  assert.throws(() => encodePlannerItem({ id: 'UAwRgrALA7CQ', corrupted: true }, { containerID: 2 }), { code: 'UNSUPPORTED_ITEM_FEATURE' });
});

test('opaque items and untouched uint64 progress survive application without mutation', () => {
  const original = parse('{"savedItems":[{"containerID":1,"data":[99,1,2],"futureFlag":9007199254740993},{"containerID":93,"data":[6,1,2,3,4,109,8]}],"sceneProgresses":[{"savedProgress":18446744073709551615}]}');
  const before = stringify(original);
  const result = applyPlannerItems(original, { equipment: { head: { id: 'UAwRgrALA7CQ' } } }, { idols: false, blessings: false });
  assert.equal(stringify(original), before);
  assert.equal(stringify(result.data.savedItems.slice(0, 2)), stringify(original.savedItems));
  assert.equal(result.data.sceneProgresses[0].savedProgress.toString(), '18446744073709551615');
  assert.equal(decodeSavedItem(original.savedItems[0]).supported, false);
});

test('planner position transform and overlap checks use actual current game idol dimensions', () => {
  const first = { id: baseId(30, 13), x: 2, y: 1, affixes: [] };
  const result = applyPlannerItems({ savedItems: [] }, { idols: [first] }, { equipment: false, blessings: false });
  assert.deepEqual(result.data.savedItems[0].inventoryPosition, { x: 1, y: 2 });
  assert.throws(() => applyPlannerItems({ savedItems: [] }, { idols: [first, first] }, { equipment: false, blessings: false }), { code: 'OVERLAPPING_IDOLS' });
  assert.throws(() => applyPlannerItems({ savedItems: [] }, { equipment: { head: { id: baseId(21, 7) } } }, { idols: false, blessings: false }), { code: 'INVALID_EQUIPMENT_SLOT' });
});

test('selected sections must exist; only explicit empty sections clear equipped items', () => {
  const original = { savedItems: [encodePlannerItem({ id: baseId(34, 217) }, { containerID: 33, individualId: 21 })] };
  const before = stringify(original);
  assert.throws(() => applyPlannerItems(original, {}, { equipment: false, idols: false }), { code: 'MISSING_PLANNER_SECTION' });
  assert.throws(() => applyPlannerItems(original, { blessings: null }, { equipment: false, idols: false }), { code: 'INVALID_PLANNER_SECTION' });
  assert.throws(() => applyPlannerItems(original, {}, { idols: false, blessings: false }), { code: 'MISSING_PLANNER_SECTION' });
  assert.throws(() => applyPlannerItems(original, {}, { equipment: false, blessings: false }), { code: 'MISSING_PLANNER_SECTION' });
  assert.equal(stringify(original), before);
  assert.equal(applyPlannerItems(original, { blessings: {} }, { equipment: false, idols: false }).data.savedItems.length, 0);
  assert.equal(applyPlannerItems(original, {}, { equipment: false, idols: false, blessings: false }).data.savedItems.length, 1);
});

test('idol placement respects the final equipped altar even when only one section is selected', () => {
  const cornerIdol = { id: baseId(25, 0), x: 1, y: 1 };
  const altar = encodePlannerItem({ id: baseId(41, 3) }, { containerID: 123, individualId: 22 });
  const selected = { equipment: false, blessings: false };
  // Altar 3 opens the upper-left cell; the default layout blocks it.
  assert.throws(() => applyPlannerItems({ savedItems: [] }, { idols: [cornerIdol] }, selected), { code: 'BLOCKED_IDOL_CELL' });
  const equipped = applyPlannerItems({ savedItems: [altar] }, { idols: [cornerIdol] }, selected).data;
  assert.equal(equipped.savedItems.length, 2);
  // A build's unselected altar must not be used to validate the save's idols.
  assert.throws(() => applyPlannerItems({ savedItems: [] }, { equipment: { idol_altar: { id: baseId(41, 3) } }, idols: [cornerIdol] }, selected), { code: 'BLOCKED_IDOL_CELL' });
  // Removing only the altar must not leave an existing idol in a blocked cell.
  assert.throws(() => applyPlannerItems(equipped, { equipment: { idol_altar: null } }, { idols: false, blessings: false }), { code: 'BLOCKED_IDOL_CELL' });
  const together = applyPlannerItems({ savedItems: [] }, { equipment: { idol_altar: { id: baseId(41, 3) } }, idols: [cornerIdol] }, { blessings: false });
  assert.equal(together.data.savedItems.length, 2);
});

test('verified local backup items round-trip byte for byte; private files are optional and never committed', { skip: !existsSync('.local/fixtures/1CHARACTERSLOT_BETA_5') }, () => {
  let verified = 0;
  for (const filename of readdirSync('.local/fixtures')) {
    let data;
    try { const text = readFileSync(`.local/fixtures/${filename}`, 'utf8'); if (!text.startsWith('EPOCH')) continue; data = parse(text.slice(5)); }
    catch { continue; }
    for (const item of data.savedItems ?? []) {
      const decoded = decodeSavedItem(item);
      if (!decoded.supported) continue;
      assert.deepEqual(encodeItemData(decoded), item.data.map(Number));
      verified++;
    }
  }
  assert.ok(verified >= 101, `Expected current fixtures, verified ${verified} items`);
});
