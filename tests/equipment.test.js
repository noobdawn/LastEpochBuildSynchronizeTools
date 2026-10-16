import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { parse, stringify } from 'lossless-json';
import { getEquipment, applyEquipmentEdit } from '../web/src/core/equipment.js';
import { decodeSavedItem, encodeItemData } from '../web/src/core/items.js';

const affix = (tier = 3, roll = 91) => ({ affixId: 26, tier, roll });
function savedItem(overrides = {}, wrapper = {}) {
  const descriptor = { baseTypeId: 2, subTypeId: 2, individualId: 12345, duplicated: true,
    rarity: 1, flags: 133, implicitRolls: [32, 64, 96], affixes: [affix()],
    potentialByte: 133, sealedFlags: 0, giftingTargets: [[1, 2, 3, 4, 5, 6, 7, 8]], ...overrides };
  return { itemData: null, data: encodeItemData(descriptor), containerID: 7,
    inventoryPosition: { x: 3, y: 2 }, quantity: 1, formatVersion: 2, futureWrapper: 'retain', ...wrapper };
}
function uniqueItem(overrides = {}, wrapper = {}) {
  return savedItem({ baseTypeId: 0, subTypeId: 15, uniqueId: 471, rarity: 7, affixes: [],
    uniqueRolls: [1, 2, 3, 4, 5, 6, 7, 8], extraFlags: 1, ...overrides }, { containerID: 2, ...wrapper });
}
const edit = (path, value) => ({ path, value });
const field = (record, path) => record.fields.find(value => JSON.stringify(value.path) === JSON.stringify(path));
const bytes = item => item.data.map(Number);

test('lists names, locations and only meaningful fields; unknown formats stay read-only', () => {
  const data = { savedItems: [uniqueItem(), savedItem({}, { containerID: 1 }),
    savedItem({ baseTypeId: 25, subTypeId: 0, affixes: [] }, { containerID: 29 }),
    savedItem({ baseTypeId: 34, subTypeId: 217, affixes: [] }, { containerID: 33 }),
    { containerID: 3, data: [99, 1, 2], formatVersion: 2 }] };
  const records = getEquipment(data);
  assert.deepEqual(records.map(value => value.group), ['equipment', 'inventory', 'idols', 'blessings', 'equipment']);
  assert.equal(records[0].name.en, 'Unbroken Legion');
  assert.equal(records[0].descriptor.individualId, 12345);
  assert.equal(field(records[0], ['uniqueRolls', 0]).type, 'roll');
  assert.equal(field(records[0], ['uniqueRolls', 4]), undefined); // Unused byte, no corresponding modifier.
  assert.equal(field(records[2], ['forgingPotential']), undefined);
  assert.equal(field(records[3], ['forgingPotential']), undefined);
  assert.equal(records[4].readOnly, true);
  assert.equal(records[4].reasonCode, 'UNKNOWN_VERSION');
  assert.throws(() => applyEquipmentEdit(data, 4, [edit(['implicitRolls', 0], 255)]), { code: 'READ_ONLY_EQUIPMENT' });
});

test('single-item edits preserve identity, ownership, wrapper, other items and uint64 values exactly', () => {
  const input = { savedItems: [savedItem(), uniqueItem(), { containerID: 90, data: [7, 8, 9], unknown: 'untouched' }],
    sceneProgresses: [{ savedProgress: '18446744073709551615' }] };
  const source = parse(JSON.stringify(input).replace('"18446744073709551615"', '18446744073709551615'));
  const before = stringify(source);
  const result = applyEquipmentEdit(source, 0, [edit(['implicitRolls', 0], 255), edit(['affixes', 0, 'tier'], 7), edit(['affixes', 0, 'roll'], 0), edit(['forgingPotential'], 63)]);
  assert.equal(stringify(source), before);
  assert.equal(stringify(result.data.savedItems.slice(1)), stringify(source.savedItems.slice(1)));
  assert.equal(stringify(result.data.sceneProgresses), stringify(source.sceneProgresses));
  const oldWrapper = { ...source.savedItems[0] }, newWrapper = { ...result.data.savedItems[0] };
  delete oldWrapper.data; delete newWrapper.data;
  assert.equal(stringify(oldWrapper), stringify(newWrapper));
  const original = bytes(source.savedItems[0]), changed = bytes(result.data.savedItems[0]);
  assert.deepEqual(changed.flatMap((value, i) => value !== original[i] ? [i] : []), [9, 12, 14, 16]);
  assert.equal(changed[12], 128 | 63); // Ice potential type retained.
  const decoded = decodeSavedItem(result.data.savedItems[0]);
  assert.equal(decoded.individualId, 12345);
  assert.equal(decoded.duplicated, true);
  assert.equal(decoded.flags, 133);
  assert.deepEqual(decoded.giftingTargets, [[1, 2, 3, 4, 5, 6, 7, 8]]);
  assert.equal(decoded.affixes[0].tier, 7);
  assert.equal(result.changes.length, 4);
});

test('rolls are explicit relative bytes, with meaningful percentage display and no guessed stat range', () => {
  const original = { savedItems: [uniqueItem()] };
  const result = applyEquipmentEdit(original, 0, [edit(['uniqueRolls', 0], 255), edit(['implicitRolls', 0], 0)]);
  const record = getEquipment(result.data)[0];
  assert.equal(field(record, ['uniqueRolls', 0]).percentage, 100);
  assert.equal(field(record, ['implicitRolls', 0]).percentage, 0);
  assert.equal(field(record, ['uniqueRolls', 0]).actualValue, undefined);
  assert.equal(result.warnings.length, 1);
  assert.deepEqual(bytes(result.data.savedItems[0]).slice(15, 22), bytes(original.savedItems[0]).slice(15, 22));
});

test('LP applies only to eligible unconverted uniques and preserves gifting count', () => {
  const data = { savedItems: [uniqueItem()] };
  const result = applyEquipmentEdit(data, 0, [edit(['legendaryPotential'], 4)]);
  assert.equal(decodeSavedItem(result.data.savedItems[0]).extraFlags, 4);
  assert.deepEqual(bytes(result.data.savedItems[0]).slice(0, 22), bytes(data.savedItems[0]).slice(0, 22));
  assert.deepEqual(bytes(result.data.savedItems[0]).slice(23), bytes(data.savedItems[0]).slice(23));
  const legendary = { savedItems: [uniqueItem({ rarity: 9, extraFlags: 0, affixes: [affix()] })] };
  assert.equal(field(getEquipment(legendary)[0], ['legendaryPotential']), undefined);
  assert.throws(() => applyEquipmentEdit(legendary, 0, [edit(['legendaryPotential'], 4)]), { code: 'UNSUPPORTED_EQUIPMENT_FIELD' });
});

test('Weaver edits preserve affix-count bits and check final tier sum plus remaining will', () => {
  const data = { savedItems: [uniqueItem({ baseTypeId: 22, subTypeId: 12, uniqueId: 300,
    rarity: 9, affixes: [affix(5)], extraFlags: 10 << 3 }, { containerID: 12 })] };
  const result = applyEquipmentEdit(data, 0, [edit(['weaversWill'], 22), edit(['affixes', 0, 'tier'], 6)]);
  assert.equal(Number(result.data.savedItems[0].data[22]), 22 * 8 + 1);
  assert.equal(decodeSavedItem(result.data.savedItems[0]).affixes[0].tier, 6);
  assert.throws(() => applyEquipmentEdit(data, 0, [edit(['weaversWill'], 24)]), { code: 'WEAVERS_WILL_LIMIT' });
  assert.equal(Number(data.savedItems[0].data[22]), 10 * 8 + 1);
  assert.equal(field(getEquipment(data)[0], ['legendaryPotential']), undefined);
});

test('sealed status and primordial tier semantics are preserved', () => {
  const normal = { savedItems: [savedItem({ flags: 144, sealedFlags: 192,
    affixes: [affix(4), { affixId: 32, tier: 3, roll: 40 }, { affixId: 86, tier: 2, roll: 90 }] })] };
  const changed = applyEquipmentEdit(normal, 0, [edit(['affixes', 0, 'tier'], 7), edit(['affixes', 1, 'roll'], 255)]).data;
  assert.equal(Number(changed.savedItems[0].data[13]), Number(normal.savedItems[0].data[13]));
  assert.equal(Number(changed.savedItems[0].data[8]), 144);
  const primordial = { savedItems: [savedItem({ affixes: [affix(8)] })] };
  assert.equal(field(getEquipment(primordial)[0], ['affixes', 0, 'tier']), undefined);
  assert.ok(field(getEquipment(primordial)[0], ['affixes', 0, 'roll']));
  assert.throws(() => applyEquipmentEdit(primordial, 0, [edit(['affixes', 0, 'tier'], 7)]), { code: 'UNSUPPORTED_EQUIPMENT_FIELD' });
});

test('invalid values and unrequested structural changes fail atomically', () => {
  const data = { savedItems: [savedItem()] };
  const before = stringify(data);
  for (const value of [-1, 256, 1.5, '', ' ', false, null, NaN, Infinity, {}, []]) {
    assert.throws(() => applyEquipmentEdit(data, 0, [edit(['implicitRolls', 0], value)]), { code: 'INVALID_EQUIPMENT_VALUE' });
  }
  for (const path of [['individualId'], ['quantity'], ['flags'], ['containerID'], ['affixes', 0, 'affixId'], ['implicitRolls', 99], ['__proto__']]) {
    assert.throws(() => applyEquipmentEdit(data, 0, [edit(path, 1)]), { code: 'UNSUPPORTED_EQUIPMENT_FIELD' });
  }
  assert.throws(() => applyEquipmentEdit(data, 0, [edit(['affixes', 0, 'tier'], 0)]), { code: 'INVALID_EQUIPMENT_VALUE' });
  assert.throws(() => applyEquipmentEdit(data, 0, [edit(['affixes', 0, 'tier'], 8)]), { code: 'INVALID_EQUIPMENT_VALUE' });
  assert.throws(() => applyEquipmentEdit(data, 0, [edit(['forgingPotential'], 64)]), { code: 'INVALID_EQUIPMENT_VALUE' });
  assert.throws(() => applyEquipmentEdit(data, 0, [edit(['forgingPotential'], 12), edit(['forgingPotential'], 13)]), { code: 'DUPLICATE_EQUIPMENT_EDIT' });
  assert.equal(stringify(data), before);
  assert.equal(stringify(applyEquipmentEdit(data, 0, []).data), before);
});

test('unknown base, affix, wrapper and non-equipment bytes are never reconstructed', () => {
  const unknownBase = savedItem(); unknownBase.data[6] = 250;
  const unknownAffix = savedItem({ affixes: [{ affixId: 4095, tier: 1, roll: 0 }] });
  const data = { savedItems: [unknownBase, unknownAffix, savedItem({}, { formatVersion: 3 }), { containerID: 1, data: [6, 1, 2, 3, 4, 109, 0], formatVersion: 2 }] };
  const before = stringify(data);
  assert.ok(getEquipment(data).every(item => item.readOnly));
  for (let i = 0; i < data.savedItems.length; i++) assert.throws(() => applyEquipmentEdit(data, i, []), { code: 'READ_ONLY_EQUIPMENT' });
  assert.equal(stringify(data), before);
});

test('local saved equipment supports byte-local edits without changing any other item', { skip: !existsSync('.local/fixtures/1CHARACTERSLOT_BETA_5') }, () => {
  const source = parse(readFileSync('.local/fixtures/1CHARACTERSLOT_BETA_5', 'utf8').slice(5));
  const before = stringify(source);
  let edited = 0;
  for (const record of getEquipment(source)) {
    const roll = record.fields.find(field => field.type === 'roll');
    if (record.readOnly || !roll) continue;
    const value = roll.value === 255 ? 0 : 255;
    const result = applyEquipmentEdit(source, record.index, [edit(roll.path, value)]);
    for (let i = 0; i < source.savedItems.length; i++) {
      if (i !== record.index) assert.equal(stringify(result.data.savedItems[i]), stringify(source.savedItems[i]));
    }
    assert.equal(bytes(source.savedItems[record.index]).filter((byte, i) => byte !== Number(result.data.savedItems[record.index].data[i])).length, 1);
    assert.equal(getEquipment(result.data)[record.index].descriptor.individualId, record.descriptor.individualId);
    edited++;
  }
  assert.ok(edited >= 30, `Expected many real equipment cases, edited ${edited}`);
  assert.equal(stringify(source), before);
});
