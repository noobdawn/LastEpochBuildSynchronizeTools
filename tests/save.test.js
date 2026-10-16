import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import {
  parseSave, serializeSave, applySaveEdits, getEditableFields, diffSave,
  createSaveArchive, cloneSaveData, hasSaveChanges, summarizeSave,
} from '../web/src/core/save.js';

const CHARACTER = '1CHARACTERSLOT_BETA_9';
// Synthetic fixture: no player names, identifiers, or real save records are committed.
const characterText = `EPOCH{
  "characterName": "Test character", "level": 42, "currentExp": 101,
  "characterClass": 3, "chosenMastery": 1, "originalMastery": 1,
  "savedItems": [{"data":[6,20,30,40,50,60,70],"quantity":1,"containerID":2,"formatVersion":2}],
  "savedCharacterTree": {"version":4,"nodeIDs":[1],"nodePoints":[2],"unspentPoints":0},
  "savedSkillTrees": [{"treeID":"test","slotNumber":0,"version":2,"nodeIDs":[1],"nodePoints":[1],"unspentPoints":0,"xp":5700000,"abilityXP":0}],
  "sceneProgresses": [{"savedProgress":18417327739619360001,"unknownFloat":1.234567890123456789012345}],
  "monolithRuns": [{"timelineID":9,"difficultyIndex":1,"stability":30,"savedEchoWeb":{"corruption":150,"islands":[{"opaque":9007199254740993}]}}],
  "dungeonCompletion": [{"dungeonID":0,"tiersCompleted":[0,1]}], "arenaTiersCompleted":[],
  "factions":{"0":{"rank":4,"reputation":456,"favor":789,"factionSpecific":{"unchanged":true}}},
  "futureVersionData":{"bigCounter":9223372036854775807,"signed":-9007199254740993,"decimal":1.0000,"scientific":9.876543210987654321e40,"nested":[null,true,"keep"]}
}\r\n`;
const stashText = 'EPOCH{"tabsv2":["STASH_CYCLE_8_0_TAB_0"],"gold":100,"ancientBones":12,"savedShards":[{"shardType":502,"quantity":2}],"materialsList":[{"data":[6,120,153,33,123,102,0],"quantity":5,"formatVersion":2}],"keysList":[{"data":[6,107,171,62,221,104,23],"quantity":1,"formatVersion":2}],"factions":{"0":{"rank":4,"reputation":456,"favor":789}},"unknown":18446744073709551615}';

test('an untouched save round-trips byte-for-byte and retains arbitrary-precision numbers', () => {
  const doc = parseSave(characterText, CHARACTER);
  assert.equal(serializeSave(doc), characterText);
  assert.equal(String(doc.data.sceneProgresses[0].savedProgress), '18417327739619360001');
  assert.equal(String(doc.data.futureVersionData.decimal), '1.0000');
  assert.equal(hasSaveChanges(doc), false);
});

test('single-field edit preserves all inventory and unknown data without changing original', () => {
  const original = parseSave(characterText, CHARACTER);
  const updated = applySaveEdits(original, [{ path: ['level'], value: '43' }]);
  const serialized = serializeSave(updated);
  const reread = parseSave(serialized, CHARACTER);
  assert.equal(String(original.data.level), '42');
  assert.equal(String(reread.data.level), '43');
  assert.deepEqual(reread.data.savedItems, original.data.savedItems);
  assert.deepEqual(reread.data.sceneProgresses, original.data.sceneProgresses);
  assert.deepEqual(reread.data.futureVersionData, original.data.futureVersionData);
  assert.deepEqual(diffSave(original, updated), [{ path: ['level'], before: '42', after: '43', type: 'changed' }]);
  assert.equal(updated.originalText, characterText);
  assert.equal(hasSaveChanges(updated), true);
});

test('editing to the existing value preserves the exact original file', () => {
  const doc = parseSave(characterText, CHARACTER);
  const updated = applySaveEdits(doc, [{ path: ['level'], value: '42' }]);
  assert.equal(serializeSave(updated), characterText);
  assert.deepEqual(diffSave(doc, updated), []);
});

test('large integer edits are exact and unsafe JavaScript numeric edits are rejected', () => {
  const doc = parseSave(characterText, CHARACTER);
  const updated = applySaveEdits(doc, [{ path: ['currentExp'], value: '9007199254740993' }]);
  assert.match(serializeSave(updated), /"currentExp":9007199254740993/);
  assert.throws(() => applySaveEdits(doc, [{ path: ['currentExp'], value: 9007199254740993 }]), { code: 'INVALID_INTEGER' });
  assert.throws(() => applySaveEdits(doc, [{ path: ['currentExp'], value: '9223372036854775808' }]), { code: 'OUT_OF_RANGE' });
});

test('only observed editable fields are accepted and a rejected batch is atomic', () => {
  const doc = parseSave(characterText, CHARACTER);
  for (const path of [['savedItems'], ['savedQuests'], ['characterClass'], ['chosenMastery'], ['savedCharacterTree', 'version'], ['missing']]) {
    assert.throws(() => applySaveEdits(doc, [{ path, value: [] }]), { code: 'UNSUPPORTED_FIELD' });
  }
  assert.throws(() => applySaveEdits(doc, [{ path: ['level'], value: '60' }, { path: ['level'], value: '101' }]), { code: 'OUT_OF_RANGE' });
  assert.equal(serializeSave(doc), characterText);
});

test('timeline, skill and dungeon edits preserve unrelated progress and never create a run', () => {
  const doc = parseSave(characterText, CHARACTER);
  const updated = applySaveEdits(doc, [
    { path: ['monolithRuns', 0, 'savedEchoWeb', 'corruption'], value: '200' },
    { path: ['savedSkillTrees', 0, 'unspentPoints'], value: '2' },
    { path: ['dungeonCompletion', 0, 'tiersCompleted'], value: '0,1,2,3' },
  ]);
  assert.deepEqual(updated.data.monolithRuns[0].savedEchoWeb.islands, doc.data.monolithRuns[0].savedEchoWeb.islands);
  assert.equal(String(updated.data.monolithRuns[0].stability), '30');
  assert.deepEqual(updated.data.savedSkillTrees[0].nodeIDs, doc.data.savedSkillTrees[0].nodeIDs);
  assert.throws(() => applySaveEdits(doc, [{ path: ['monolithRuns', 1, 'stability'], value: '100' }]), { code: 'UNSUPPORTED_FIELD' });
  assert.throws(() => applySaveEdits(doc, [{ path: ['arenaTiersCompleted'], value: [0, 0] }]), { code: 'INVALID_LIST' });
  assert.throws(() => applySaveEdits(doc, [{ path: ['arenaTiersCompleted'], value: [4] }]), { code: 'OUT_OF_RANGE' });
});

test('stash resource edits preserve encoded items, shards identities and other factions', () => {
  const doc = parseSave(stashText, 'STASH_CYCLE_8_0');
  const updated = applySaveEdits(doc, [
    { path: ['gold'], value: '2147483647' },
    { path: ['ancientBones'], value: '1000' },
    { path: ['savedShards', 0, 'quantity'], value: '99' },
    { path: ['keysList', 0, 'quantity'], value: '22' },
    { path: ['factions', '0', 'favor'], value: '999' },
  ]);
  assert.equal(String(updated.data.savedShards[0].shardType), '502');
  assert.deepEqual(updated.data.keysList[0].data, doc.data.keysList[0].data);
  assert.equal(String(updated.data.factions[0].rank), '4');
  assert.equal(String(parseSave(serializeSave(updated), doc.name).data.unknown), '18446744073709551615');
  assert.throws(() => applySaveEdits(doc, [{ path: ['gold'], value: '2147483648' }]), { code: 'OUT_OF_RANGE' });
});

test('current game C# field widths and faction asset limits are enforced', () => {
  const doc = parseSave(characterText, CHARACTER);
  assert.throws(() => applySaveEdits(doc, [{ path: ['savedSkillTrees', 0, 'xp'], value: '2147483648' }]), { code: 'OUT_OF_RANGE' });
  assert.throws(() => applySaveEdits(doc, [{ path: ['factions', '0', 'rank'], value: '13' }]), { code: 'OUT_OF_RANGE' });
  const updated = applySaveEdits(doc, [{ path: ['savedSkillTrees', 0, 'abilityXP'], value: '1.25' }]);
  assert.equal(String(updated.data.savedSkillTrees[0].abilityXP), '1.25');
  assert.throws(() => applySaveEdits(doc, [{ path: ['savedSkillTrees', 0, 'abilityXP'], value: '1e39' }]), { code: 'OUT_OF_RANGE' });
  assert.throws(() => applySaveEdits(doc, [{ path: ['savedSkillTrees', 0, 'abilityXP'], value: '1e-50' }]), { code: 'OUT_OF_RANGE' });
  assert.throws(() => applySaveEdits(doc, [{ path: ['savedSkillTrees', 0, 'abilityXP'], value: '1e-999' }]), { code: 'OUT_OF_RANGE' });
});

test('English save errors preserve exact bounds and field details', () => {
  const doc = parseSave(characterText, CHARACTER);
  assert.throws(() => applySaveEdits(doc, [{ path: ['currentExp'], value: '9223372036854775808' }]), error => {
    assert.equal(error.code, 'OUT_OF_RANGE');
    assert.match(error.messageEn, /between 0 and 9223372036854775807/);
    return true;
  });
  assert.throws(() => applySaveEdits(doc, [{ path: ['missingField'], value: '1' }]), error => {
    assert.match(error.messageEn, /not been verified.*missingField/);
    return true;
  });
});

test('resources use extracted item names and unknown formats retain explicit fallback labels', () => {
  const doc = parseSave(stashText, 'STASH_CYCLE_8_0');
  const fields = getEditableFields(doc);
  assert.equal(fields.find(field => field.path[0] === 'savedShards').label.en, 'Intelligence · Affix shard quantity');
  assert.equal(fields.find(field => field.path[0] === 'materialsList').label.en, 'Rune of Shattering · Material quantity');
  assert.equal(fields.find(field => field.path[0] === 'keysList').label.en, 'Timeglass Fragment · Key quantity');
  doc.data.wovenEchoesList = [{ data: [6, 1, 2, 3, 4, 107, 0, 16], quantity: 1, formatVersion: 2 }];
  assert.equal(getEditableFields(doc).find(field => field.path[0] === 'wovenEchoesList').label.en, 'Overgrown Graveyard · Woven echo quantity');
  doc.data.keysList[0].data[0] = 99;
  assert.equal(getEditableFields(doc).find(field => field.path[0] === 'keysList').label.en, 'Key #1 · Quantity');
});

test('identifies all supported file kinds and keeps native output names for backups', () => {
  assert.equal(parseSave(characterText, `${CHARACTER}.bak`).outputName, CHARACTER);
  assert.equal(parseSave(stashText, 'STASH_CYCLE_8_0.json').kind, 'stash');
  const tab = parseSave('EPOCH{"displayName":"Test tab","savedItems":[]}', 'STASH_CYCLE_8_0_TAB_0');
  assert.equal(tab.kind, 'stashTab');
  const global = parseSave('EPOCH{"stashes":["STASH_0"],"id":"global"}', 'Epoch_Local_Global_Data_Beta');
  assert.equal(global.kind, 'global');
  assert.deepEqual(getEditableFields(global), []);
  assert.equal(summarizeSave(tab).itemCount, 0);
});

test('rejects unknown formats, invalid JSON, mismatched types and unsafe filenames', () => {
  assert.throws(() => parseSave('{}', CHARACTER), { code: 'INVALID_PREFIX' });
  assert.throws(() => parseSave('EPOCH{', CHARACTER), { code: 'INVALID_JSON' });
  assert.throws(() => parseSave('EPOCH[]', CHARACTER), { code: 'INVALID_ROOT' });
  assert.throws(() => parseSave(stashText, CHARACTER), { code: 'KIND_MISMATCH' });
  for (const name of ['../STASH_0', 'C:\\STASH_0', 'STASH_0.exe', 'STASH_0.html', 'STASH_0_temp', 'STASH_0.bak.exe', 'STASH_0 ', 'unrelated.json']) {
    assert.throws(() => parseSave(stashText, name));
  }
});

test('rejects duplicate keys and prototype keys instead of silently losing fields', () => {
  assert.throws(() => parseSave(characterText.replace('"level": 42', '"level":42,"level":43'), CHARACTER), { code: 'INVALID_JSON' });
  assert.throws(() => parseSave(characterText.replace('"level": 42', '"level":42,"__proto__":{"polluted":true}'), CHARACTER), { code: 'UNSAFE_KEY' });
  assert.throws(() => parseSave(characterText.replace('"level": 42', '"level":42,"\\u005f_proto__":{"polluted":true}'), CHARACTER), { code: 'UNSAFE_KEY' });
  assert.equal({}.polluted, undefined);
  assert.throws(() => parseSave(characterText.replace('"level": 42', '"level":42,"futureMarker":{"isLosslessNumber":true,"value":"123","extra":"keep"}'), CHARACTER), { code: 'INVALID_DATA' });
});

test('browser-safe clone preserves all unknown numerical values and rejects lossy numeric data', () => {
  const doc = parseSave(characterText, CHARACTER);
  assert.deepEqual(cloneSaveData(doc.data), doc.data);
  assert.throws(() => cloneSaveData({ unsafe: 18417327739619360001 }), { code: 'UNSAFE_NUMBER' });
  assert.throws(() => serializeSave({ unsafe: NaN }), { code: 'UNSAFE_NUMBER' });
});

test('ZIP contains only modified game files plus exact original backups', () => {
  const character = parseSave(characterText, CHARACTER);
  const stash = parseSave(stashText, 'STASH_CYCLE_8_0');
  const updated = applySaveEdits(character, [{ path: ['characterName'], value: 'Updated test' }]);
  const files = unzipSync(createSaveArchive([updated, stash]));
  assert.deepEqual(Object.keys(files).sort(), [`modified/${CHARACTER}`, `originals/${CHARACTER}`, 'originals/STASH_CYCLE_8_0'].sort());
  assert.equal(strFromU8(files[`originals/${CHARACTER}`]), characterText);
  assert.equal(strFromU8(files['originals/STASH_CYCLE_8_0']), stashText);
  assert.equal(parseSave(strFromU8(files[`modified/${CHARACTER}`]), CHARACTER).data.characterName, 'Updated test');
  assert.throws(() => createSaveArchive([character]), { code: 'NO_CHANGES' });
  assert.throws(() => createSaveArchive([updated, parseSave(characterText, `${CHARACTER}.bak`)]), { code: 'DUPLICATE_FILENAME' });
});
