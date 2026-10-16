import test from 'node:test';
import assert from 'node:assert/strict';
import LZString from 'lz-string';
import { parse, stringify } from 'lossless-json';
import { saveToPlannerBuild } from '../web/src/core/reverse-planner.js';
import { normalizePlannerBuild, applyPlannerBuild } from '../web/src/core/planner.js';
import { decodeSavedItem, encodeItemData, encodePlannerItem, resolvePlannerItemId } from '../web/src/core/items.js';

const baseId = (base, subtype) => `I${LZString.compressToBase64(`1${String(base).padStart(3, '0')}${String(subtype).padStart(3, '0')}000`)}`;
const affixId = id => `A${LZString.compressToBase64(String(id))}`;
const affix = (id, tier = 5, r = 128) => ({ id: affixId(id), tier, r });
const wrapped = (record, containerID, individualId, position = { x: 0, y: 0 }) => encodePlannerItem(record, { containerID, individualId, inventoryPosition: position });

function character() {
  return parse('{"characterName":"Synthetic","characterClass":3,"chosenMastery":1,"level":91,"savedItems":[],"savedCharacterTree":{"treeID":"","version":4,"nodeIDs":[1,4],"nodePoints":[8,5],"unspentPoints":96,"nodesTaken":null},"savedSkillTrees":[{"treeID":"ss37kl","slotNumber":1,"xp":5700000,"version":2,"nodeIDs":[2],"nodePoints":[2],"unspentPoints":20,"abilityXP":0}],"abilityBar":["","ss37kl","","",""],"sceneProgresses":[{"savedProgress":18446744073709551615}],"future":{"decimal":1.00000000000000000001,"counter":9007199254740993}}');
}

test('local overview preserves save precision and source objects, and is explicitly blocked from reapply', () => {
  const save = character();
  const before = stringify(save);
  const { build, warnings } = saveToPlannerBuild(save);
  assert.equal(stringify(save), before);
  assert.equal(build.data.workshopReadOnly, true);
  assert.equal(build.dataVersion, 'Version 1.5.2.1');
  assert.equal(build.sourceUrl, null);
  assert.deepEqual(normalizePlannerBuild(build).data, build.data);
  assert.ok(warnings.some(warning => warning.code === 'READ_ONLY_SAVE_OVERVIEW' && warning.zh && warning.en));
  assert.throws(() => applyPlannerBuild(save, build), { code: 'DISPLAY_ONLY_BUILD' });
  assert.throws(() => applyPlannerBuild(save, build, { equipment: false, passives: false }), { code: 'DISPLAY_ONLY_BUILD' });
  build.data.charTree.selected[1] = 99;
  build.data.hud[1] = 'changed';
  assert.equal(stringify(save), before, 'overview fields must not retain source references');
});

test('verified gear, sealed and corrupted affixes, Weaver rolls and potential survive the reverse mapping', () => {
  const save = character();
  save.savedItems = [
    wrapped({ id: 'UAwRgrALA7CQ', lp: 3, ir: [0, 128, 255], ur: [1, 2, 3, 4, 5, 6, 7, 8] }, 2, 100),
    wrapped({ id: baseId(2, 2), affixes: [affix(26, 6, 0)], sealedAffix: affix(32, 3, 100), corruptedAffix: affix(86, 4, 250) }, 7, 101),
    wrapped({ id: 'UAwRgTAzMxA', affixes: [affix(26, 5, 90)], ww: 13 }, 12, 102),
  ];
  const before = stringify(save);
  const { build, warnings } = saveToPlannerBuild(save);
  assert.equal(warnings.filter(warning => warning.slot).length, 0);
  for (const [index, slot] of ['head', 'waist', 'relic'].entries()) {
    const source = save.savedItems[index];
    const returned = wrapped(build.data.equipment[slot], source.containerID, 100 + index);
    assert.deepEqual(returned.data, source.data, `verified expressible bytes must match for ${slot}`);
  }
  assert.equal(build.data.equipment.head.lp, 3);
  assert.equal(build.data.equipment.waist.corrupted, true);
  assert.equal(build.data.equipment.relic.ww, 13);
  assert.equal(stringify(save), before);
});

test('idol coordinates reverse the verified bottom-origin save transform, and altar and blessings retain slots', () => {
  const save = character();
  save.savedItems = [
    wrapped({ id: baseId(41, 3) }, 123, 103),
    wrapped({ id: baseId(30, 13), affixes: [], wt: 7 }, 29, 104, { x: 1, y: 2 }),
    wrapped({ id: baseId(34, 217), ir: [255, 4, 5] }, 45, 105),
  ];
  const { build, warnings } = saveToPlannerBuild(save);
  assert.equal(warnings.filter(warning => warning.slot).length, 0);
  assert.deepEqual(resolvePlannerItemId(build.data.equipment.idol_altar.id), { baseTypeId: 41, subTypeId: 3 });
  assert.deepEqual([build.data.idols[0].x, build.data.idols[0].y, build.data.idols[0].wt], [2, 1, 7]);
  assert.deepEqual(resolvePlannerItemId(build.data.blessings[10].id), { baseTypeId: 34, subTypeId: 217 });
  assert.equal(build.data.blessings[1], null);
});

test('unknown equipped layouts and modifiers remain explicit placeholders beside supported items', () => {
  const save = character();
  const futureRarity = wrapped({ id: baseId(2, 2) }, 7, 110);
  futureRarity.data[7] = 17;
  const unknownAffix = wrapped({ id: 'UAwRgrALA7CQ' }, 2, 111);
  const descriptor = decodeSavedItem(unknownAffix);
  descriptor.rarity = 9;
  descriptor.affixes = [{ affixId: 4095, tier: 1, roll: 128 }];
  unknownAffix.data = encodeItemData(descriptor);
  save.savedItems = [futureRarity, unknownAffix, wrapped({ id: 'UAwRgTAzMxA', ww: 10 }, 12, 112), { containerID: 1, data: [99, 1] }];
  const before = stringify(save);
  const { build, warnings } = saveToPlannerBuild(save);
  assert.equal(build.data.equipment.waist.id, null);
  assert.equal(build.data.equipment.waist.workshopUnsupported.detail, 'UNSUPPORTED_RARITY');
  assert.equal(build.data.equipment.head.workshopUnsupported.reason, 'UNKNOWN_SAVE_AFFIX');
  assert.equal(build.data.equipment.relic.ww, 10);
  assert.equal(warnings.filter(warning => warning.slot).length, 2);
  assert.ok(warnings.filter(warning => warning.slot).every(warning => warning.zh && warning.en));
  assert.equal(stringify(save), before);
});

test('saved passive nodes, skill allocation and action bar are copied; unknown skills are visible, not omitted', () => {
  const save = character();
  save.savedSkillTrees.push({ treeID: 'future-skill', version: 99, nodeIDs: [1], nodePoints: [4], slotNumber: 3, xp: 10, unspentPoints: 0 });
  const { build, warnings } = saveToPlannerBuild(save);
  assert.deepEqual(build.data.charTree, { treeID: '', version: 4, selected: { 1: 8, 4: 5 } });
  assert.deepEqual(build.data.skillTrees[0], { treeID: 'ss37kl', slotNumber: 1, version: 2, selected: { 2: 2 }, level: 22 });
  assert.equal(build.data.skillTrees.length, 2);
  assert.equal(build.data.skillTrees[1].treeID, 'future-skill');
  assert.equal(build.data.skillTrees[1].workshopUnsupported.reason, 'UNKNOWN_SAVED_SKILL');
  assert.deepEqual(build.data.hud, ['', 'ss37kl', '', '', '']);
  assert.ok(warnings.some(warning => warning.code === 'ESTIMATED_SKILL_LEVELS'));
  assert.ok(warnings.some(warning => warning.code === 'UNKNOWN_SAVED_SKILL'));
});

test('ambiguous duplicate slots reject instead of silently replacing a displayed item', () => {
  const save = character();
  save.savedItems = [wrapped({ id: 'UAwRgrALA7CQ' }, 2, 120), wrapped({ id: 'UAwRgrALA7CQ' }, 2, 121)];
  assert.throws(() => saveToPlannerBuild(save), { code: 'DUPLICATE_EQUIPPED_SLOT' });
  assert.throws(() => saveToPlannerBuild({ gold: 123 }), { code: 'NOT_CHARACTER_SAVE' });
});
