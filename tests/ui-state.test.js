import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as saves from '../web/src/core/save.js';
import { getEquipment, applyEquipmentEdit } from '../web/src/core/equipment.js';
import { encodePlannerItem, decodeSavedItem } from '../web/src/core/items.js';
import { applyPlannerBuild } from '../web/src/core/planner.js';
import { saveToPlannerBuild } from '../web/src/core/reverse-planner.js';
import { createValueFilterDraft as createFilterDraft } from '../web/src/core/value-filter.js';
import { messages, classes, masteries } from '../web/src/i18n.js';

const CHARACTER = '1CHARACTERSLOT_BETA_9';
const STASH = 'STASH_CYCLE_8_0';
const characterText = 'EPOCH{"characterName":"Synthetic","level":50,"savedItems":[],"factions":{"0":{"favor":80}}}';
const stashText = 'EPOCH{"gold":100,"tabsv2":[],"factions":{"0":{"favor":50}}}';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

/**
 * Execute the real UI state transitions while replacing presentation and I/O.
 * These regressions concern pending promises and the destination of edits, not
 * DOM layout. No production transition logic is copied into this harness.
 */
function uiState(overrides = {}) {
  const source = readFileSync(new URL('../web/src/main.js', import.meta.url), 'utf8')
    .replace(/^import[^\n]*\r?\n/gm, '')
    .replace(/render\(\);\s*$/, '');
  const context = vm.createContext({
    ...saves, getEquipment, applyEquipmentEdit, applyPlannerBuild, saveToPlannerBuild, createFilterDraft, messages, classes, masteries, AbortController,
    document: { querySelector: () => ({}) },
    window: { addEventListener() {} },
    localStorage: { getItem: () => null },
    notices: [],
    ...overrides,
  });
  vm.runInContext(source + `
    render = () => {};
    notify = (message, error) => notices.push({ message, error });
    globalThis.probe = { state, importBuild, applyBuild, loadFiles, saveDrafts, switchFile, bindEquipment };
  `, context, { filename: 'main.js' });
  return context.probe;
}

function addSave(ui, name, text) {
  const entry = { original: saves.parseSave(text, name), doc: saves.parseSave(text, name) };
  ui.state.files.set(name, entry);
  ui.state.active = name;
  return entry;
}

test('starting another build request prevents applying the previously loaded build', async () => {
  const response = deferred();
  const failedResponse = deferred();
  const requests = [response, failedResponse];
  const appliedBuilds = [];
  const ui = uiState({
    fetchPlannerBuild: () => requests.shift().promise,
    applyPlannerBuild(data, build) {
      appliedBuilds.push(build.id);
      return { data: { ...data, characterName: build.id }, warnings: [] };
    },
  });
  const entry = addSave(ui, CHARACTER, characterText);
  ui.state.build = { id: 'previous-build' };

  const reading = ui.importBuild('https://www.lastepochtools.com/planner/BBBBBBBB');
  ui.applyBuild();
  assert.deepEqual(appliedBuilds, [], 'the old build must not reach the converter while the replacement request is pending');
  assert.equal(saves.serializeSave(entry.doc), characterText);

  response.resolve({ id: 'replacement-build' });
  await reading;
  ui.applyBuild();
  assert.deepEqual(appliedBuilds, ['replacement-build']);
  assert.equal(entry.doc.data.characterName, 'replacement-build');
  assert.equal(saves.serializeSave(entry.original), characterText);

  const failedReading = ui.importBuild('https://www.lastepochtools.com/planner/CCCCCCCC');
  failedResponse.reject(new Error('Synthetic network failure'));
  await failedReading;
  ui.applyBuild();
  assert.deepEqual(appliedBuilds, ['replacement-build'], 'a failed replacement must not reactivate the older build for another apply');
});

test('drafts entered while reading a character file remain attached to the previously selected stash', async () => {
  for (const draft of ['123', 'not-a-number']) {
    const fileRead = deferred();
    const ui = uiState();
    const stash = addSave(ui, STASH, stashText);
    const reading = ui.loadFiles([{ name: CHARACTER, size: characterText.length, text: () => fileRead.promise }]);

    // This path exists in both documents. Before the fix, automatic selection
    // moved this stash edit onto the newly loaded character without an error.
    ui.state.fieldDrafts.set(JSON.stringify(['factions', '0', 'favor']), draft);
    fileRead.resolve(characterText);
    await reading;
    ui.saveDrafts();

    const character = ui.state.files.get(CHARACTER);
    assert.ok(character, 'the newly read character should still be available');
    assert.equal(String(character.doc.data.factions[0].favor), '80', 'a stash draft must never modify the character');
    assert.equal(saves.serializeSave(character.doc), characterText);
    if (draft === '123') {
      assert.equal(String(stash.doc.data.factions[0].favor), '123');
      assert.equal(ui.state.active, CHARACTER);
      assert.equal(ui.state.fieldDrafts.size, 0);
    } else {
      assert.equal(saves.serializeSave(stash.doc), stashText);
      assert.equal(ui.state.active, STASH, 'an invalid draft must prevent automatic selection changes');
      assert.equal(ui.state.fieldDrafts.size, 1, 'the invalid draft must remain available for correction');
    }
  }
});

function equippedText() {
  const data = {
    characterName: 'Synthetic', level: 50, characterClass: 3, chosenMastery: 1,
    savedCharacterTree: { treeID: '', version: 4, nodeIDs: [], nodePoints: [], unspentPoints: 10 },
    savedSkillTrees: [], abilityBar: ['', '', '', '', ''],
    savedItems: [
      { containerID: 1, data: [99, 1, 2], futureUnknown: 'untouched' },
      encodePlannerItem({ id: 'UAwRgrALA7CQ', ir: [100, 101, 102] }, { containerID: 2, individualId: 100 }),
      encodePlannerItem({ id: 'UAwRgrALA7CQ', ir: [200, 201, 202] }, { containerID: 1, individualId: 101 }),
    ],
  };
  return `EPOCH${JSON.stringify(data).replace('"futureUnknown":"untouched"', '"futureUnknown":18446744073709551615')}`;
}

test('item drafts commit atomically with scalar edits and retain the absolute saved-item index when switching files', () => {
  const ui = uiState();
  const original = equippedText();
  const first = addSave(ui, CHARACTER, original);
  const second = addSave(ui, '1CHARACTERSLOT_BETA_8', original);
  ui.state.active = CHARACTER;
  ui.state.selectedEquipment = 1; // Index 0 is an unknown inventory item, not the first visible equipment card.
  ui.state.fieldDrafts.set(JSON.stringify(['characterName']), 'Changed');
  ui.state.equipmentDrafts.set(JSON.stringify(['implicitRolls', 0]), '256');
  ui.switchFile(second.doc.name);
  assert.equal(ui.state.active, CHARACTER, 'invalid item values must prevent leaving the current file');
  assert.equal(saves.serializeSave(first.doc), original, 'a valid scalar edit must also remain unapplied when the item edit fails');
  assert.equal(ui.state.fieldDrafts.size, 1);
  assert.equal(ui.state.equipmentDrafts.size, 1);

  ui.state.equipmentDrafts.set(JSON.stringify(['implicitRolls', 0]), '255');
  ui.switchFile(second.doc.name);
  assert.equal(ui.state.active, second.doc.name);
  assert.equal(first.doc.data.characterName, 'Changed');
  assert.equal(decodeSavedItem(first.doc.data.savedItems[1]).implicitRolls[0], 255);
  assert.equal(decodeSavedItem(first.doc.data.savedItems[2]).implicitRolls[0], 200, 'filtering the equipment list must not change the absolute destination index');
  assert.equal(first.doc.data.savedItems[0].futureUnknown.toString(), '18446744073709551615');
  assert.equal(saves.serializeSave(second.doc), original, 'pending item edits must not follow selection to another character');
  assert.equal(saves.serializeSave(first.original), original);
  assert.equal(ui.state.equipmentDrafts.size, 0);
  assert.equal(ui.state.fieldDrafts.size, 0);
});

test('a local read-only overview cancels a pending remote build and cannot overwrite the character', async () => {
  const response = deferred();
  const controls = new Map();
  const button = { addEventListener(type, callback) { this[type] = callback; } };
  controls.set('#read-save-build', button);
  const ui = uiState({
    fetchPlannerBuild: () => response.promise,
    document: { querySelector: selector => controls.get(selector) ?? null, querySelectorAll: () => [] },
  });
  const original = equippedText();
  const entry = addSave(ui, CHARACTER, original);
  const loading = ui.importBuild('https://www.lastepochtools.com/planner/BBBBBBBB');
  ui.bindEquipment();
  button.click();
  assert.equal(ui.state.build.data.workshopReadOnly, true);
  assert.equal(ui.state.loading, false);
  response.resolve({ id: 'stale-remote-response' });
  await loading;
  assert.equal(ui.state.build.data.workshopReadOnly, true, 'late remote results must not replace the chosen save overview');
  ui.applyBuild();
  assert.equal(saves.serializeSave(entry.doc), original, 'even a direct call must not reapply the lossy overview');
  assert.ok(ui.state.warnings.some(warning => warning.includes('read-only')));
});


test('filter creation needs no save, preserves edits across route switches and fetches a changed URL', async () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/planner-om6w3Ypq.json', import.meta.url), 'utf8'));
  let fetches = 0;
  const ui = uiState({ fetchPlannerBuild: async () => { fetches++; return fixture; } });
  const firstUrl = 'https://www.lastepochtools.com/planner/om6w3Ypq';
  await ui.importBuild(firstUrl, 'filter');
  assert.equal(ui.state.files.size, 0);
  assert.equal(ui.state.tab, 'filterTab');
  assert.equal(ui.state.filterDraft.analysis.summary.uniqueCount, 8);
  assert.equal(ui.state.filterDraft.analysis.summary.setCount, 1);
  ui.state.filterDraft.name = 'Custom filter';
  ui.state.filterDraft.exclusions.equipmentTypeIds = [12, 13];
  await ui.importBuild(firstUrl, 'sync');
  assert.equal(ui.state.tab, 'buildTab');
  await ui.importBuild(firstUrl, 'filter');
  assert.equal(fetches, 1);
  assert.equal(ui.state.filterDraft.name, 'Custom filter');
  assert.deepEqual([...ui.state.filterDraft.exclusions.equipmentTypeIds], [12, 13]);

  const secondUrl = 'https://www.lastepochtools.com/planner/ABCDEFGH';
  ui.state.buildUrl = secondUrl; // The URL input's real oninput behavior.
  await ui.importBuild(secondUrl, 'filter');
  assert.equal(fetches, 2, 'editing the input must not reuse the previous loaded build');
  assert.notEqual(ui.state.filterDraft.name, 'Custom filter');
});

test('a superseded filter request cannot replace a later sync request or modify a save', async () => {
  const first = deferred(), second = deferred();
  const requests = [first, second];
  const ui = uiState({fetchPlannerBuild: () => requests.shift().promise});
  const entry = addSave(ui, CHARACTER, characterText);
  const filterRequest = ui.importBuild('https://www.lastepochtools.com/planner/AAAAAAAA', 'filter');
  const syncRequest = ui.importBuild('https://www.lastepochtools.com/planner/BBBBBBBB', 'sync');
  second.resolve({id:'second'});
  await syncRequest;
  first.resolve({id:'first'});
  await filterRequest;
  assert.equal(ui.state.tab, 'buildTab');
  assert.equal(ui.state.build.id, 'second');
  assert.equal(ui.state.filterDraft, null);
  assert.equal(saves.serializeSave(entry.doc), characterText);
});
