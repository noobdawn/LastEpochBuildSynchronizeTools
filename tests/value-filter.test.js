import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createValueFilterDraft, generateValueFilter, evaluateValueItem,
  EQUIPMENT_FILTER_GROUPS, FILTER_IDOL_BASES, getOtherClassIdolKeys,
} from '../web/src/core/value-filter.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/planner-om6w3Ypq.json', import.meta.url), 'utf8'));
function draft() {
  const d = createValueFilterDraft(fixture);
  // All four IDs can appear on a relic: two prefixes and two suffixes.
  d.highAffixIds = [26]; d.mediumAffixIds = [73, 25, 22];
  return d;
}
const item = (affixes, overrides = {}) => ({ baseTypeId: 22, subTypeId: 0, rarity: 'EXALTED', affixes: affixes.map(([id, tier]) => ({ id, tier })), ...overrides });

test('four fixed global templates generate once each, without a scoring configuration', () => {
  const d = draft(), before = JSON.stringify(d), result = generateValueFilter(d);
  assert.equal('scoring' in d, false);
  assert.equal('equipmentGroups' in d, false);
  assert.equal(EQUIPMENT_FILTER_GROUPS.length, 4);
  for (const group of EQUIPMENT_FILTER_GROUPS) {
    const rules = result.rules.filter(rule => rule.groupId === group.id);
    assert.equal(rules.length, 1);
    assert.deepEqual(rules[0].conditions.find(c => c.type === 'subtype').baseTypeIds, Array.from({ length: 25 }, (_, i) => i));
  }
  assert.equal(result.diagnostics.equipmentRuleCount, 4);
  assert.equal(result.diagnostics.approximate, false);
  assert.equal(JSON.stringify(d), before);
});

test('tier boundaries, useful counts and first-match precedence follow the four fixed categories', () => {
  const d = draft();
  const cases = [
    [[[26, 7]], 'equipment_core'],
    [[[26, 6]], 'equipment_core'],
    [[[26, 8]], 'equipment_core'],
    [[[73, 6], [25, 2], [22, 1]], 'equipment_useful'],
    [[[73, 6], [25, 2]], 'equipment_other'],
    [[[26, 5], [25, 5]], 'equipment_crafting'],
    [[[26, 5], [25, 4]], 'equipment_other'],
    [[[26, 4], [25, 3], [73, 2]], 'equipment_leveling'],
    [[[26, 5], [25, 4], [73, 2]], 'equipment_leveling'],
    [[[26, 1], [25, 1], [73, 1]], 'equipment_leveling'],
    [[[26, 4], [25, 3]], 'equipment_other'],
    [[[73, 5], [25, 5], [22, 5]], 'equipment_other'],
    [[[26, 6], [25, 6], [73, 6]], 'equipment_core'],
  ];
  for (const [affixes, expected] of cases) assert.equal(evaluateValueItem(d, item(affixes)).groupId, expected, JSON.stringify(affixes));
  assert.equal(evaluateValueItem(d, item([[26, 6]], { rarity: 'RARE' })).groupId, 'equipment_other');
  assert.equal(evaluateValueItem(d, item([[26, 5], [25, 5]], { rarity: 'RARE' })).groupId, 'equipment_crafting');
  assert.equal(evaluateValueItem(d, item([[26, 6], [502, 1], [501, 1], [1, 7]])).groupId, 'equipment_core', 'unselected affixes do not subtract value');
  assert.equal(evaluateValueItem(d, item([[501, 7], [502, 7]])).outcome, 'HIDE', 'unselected T7 affixes do not count as useful');
});

test('H is included in U once and additional affix fields participate', () => {
  const d = draft(); d.mediumAffixIds.push(26);
  const output = generateValueFilter(d);
  const useful = output.rules.find(r => r.groupId === 'equipment_useful').conditions.filter(c => c.type === 'affix');
  assert.ok(useful.every(c => c.affixIds.filter(id => id === 26).length === 1));
  assert.equal(evaluateValueItem(d, item([[26, 4], [25, 3]], { sealedAffix: { id: 73, tier: 2 } })).groupId, 'equipment_leveling');
});

test('manual equipment exclusions win over core affixes, needed uniques, sets and other keep rules', () => {
  const d = draft(); d.exclusions.equipmentTypeIds = [22, 12, 13];
  const output = generateValueFilter(d);
  assert.equal(output.rules[0].groupId, 'excluded');
  assert.equal(output.rules.filter(r => r.id === 'excluded-types').length, 1);
  assert.equal(evaluateValueItem(d, item([[26, 7]])).outcome, 'HIDE');
  d.exclusions.equipmentTypeIds.push(0, 7);
  assert.equal(evaluateValueItem(d, { baseTypeId: 0, uniqueId: 471, rarity: 'UNIQUE' }).outcome, 'HIDE');
  assert.equal(evaluateValueItem(d, { baseTypeId: 7, uniqueId: 79, rarity: 'SET' }).outcome, 'HIDE');
  for (const resourceKind of ['glyph', 'rune', 'shard', 'key']) assert.equal(evaluateValueItem(d, { resourceKind }).outcome, 'SHOW');
  assert.equal(evaluateValueItem(d, { baseTypeId: 41 }).outcome, 'SHOW');
});

test('other-class idol selection uses item class bits and preserves Mage and general bases', () => {
  const keys = getOtherClassIdolKeys(1);
  assert.ok(keys.includes('30:4'), 'Rogue large idol');
  assert.ok(keys.includes('30:9'), 'Rogue heretical large idol');
  assert.ok(keys.includes('30:14'), 'Rogue omen large idol');
  assert.ok(!keys.includes('30:1'), 'Mage large idol');
  assert.ok(!keys.includes('30:6'), 'Mage heretical large idol');
  assert.ok(!keys.includes('25:0'), 'general idol');
  assert.ok(FILTER_IDOL_BASES.filter(b => keys.includes(b.key)).every(b => b.classRequirement && !(b.classRequirement & 2)));
  assert.deepEqual(getOtherClassIdolKeys(null), []);
  const d = draft(); d.groups.idol_other.show = true; d.exclusions.idolBaseKeys = keys;
  for (const subTypeId of [4, 9, 14]) assert.equal(evaluateValueItem(d, { baseTypeId: 30, subTypeId, rarity: 'RARE' }).outcome, 'HIDE');
  for (const subTypeId of [1, 6, 11]) assert.equal(evaluateValueItem(d, { baseTypeId: 30, subTypeId, rarity: 'RARE' }).outcome, 'SHOW');
  const hides = generateValueFilter(d).rules.filter(r => r.groupId === 'excluded');
  assert.equal(hides.length, 5, 'all selected class bases share one rule per idol shape');
  for (const rule of hides) assert.equal(rule.conditions[0].baseTypeIds.length, 1);
  d.exclusions.idolTypeIds = [30];
  const output = generateValueFilter(d);
  assert.ok(!output.rules.some(r => r.id === 'excluded-idols-30'), 'whole-shape exclusion subsumes its selected bases');
  assert.equal(evaluateValueItem(d, { baseTypeId: 30, subTypeId: 1, rarity: 'RARE' }).outcome, 'HIDE');
});

test('XML preserves native order, multi-type scope, exact idol subtypes and four fixed names', () => {
  const d = draft(); d.exclusions.equipmentTypeIds = [12, 13]; d.exclusions.idolBaseKeys = ['30:4', '30:9', '30:14'];
  const output = generateValueFilter(d);
  const xmlRules = [...output.xml.matchAll(/<Rule>([\s\S]*?)<\/Rule>/g)].map(match => match[1]).reverse();
  assert.equal(xmlRules.length, output.rules.length);
  assert.match(xmlRules[0], /<type>HIDE<\/type>/);
  assert.match(xmlRules[0], /<EquipmentType>TWO_HANDED_AXE<\/EquipmentType><EquipmentType>TWO_HANDED_MACE<\/EquipmentType>/);
  assert.match(xmlRules[1], /<EquipmentType>IDOL_1x3<\/EquipmentType>/);
  assert.match(xmlRules[1], /<subTypes><int>4<\/int><int>9<\/int><int>14<\/int><\/subTypes>/);
  assert.equal((xmlRules[1].match(/<EquipmentType>/g) ?? []).length, 1);
  for (const name of ['核心词缀崇高装备', '有效词缀崇高装备', '考虑打造装备', '开荒过渡装备']) assert.equal(xmlRules.filter(rule => rule.includes(`<nameOverride>${name}</nameOverride>`)).length, 1);
  assert.doesNotMatch(output.xml, /评分|近似|equipment_score|__equipment_fallback__/);
  assert.equal(output.rules.length <= 200, true);
});

test('empty pools cannot export wildcard affixes and invalid exclusions are rejected', () => {
  const d = draft(); d.highAffixIds = []; d.mediumAffixIds = [];
  const output = generateValueFilter(d);
  assert.equal(output.diagnostics.equipmentRuleCount, 0);
  assert.ok(!output.rules.some(r => r.conditions.some(c => c.type === 'affix' && !c.affixIds.length)));
  d.exclusions.idolBaseKeys = ['30:999'];
  assert.throws(() => generateValueFilter(d), { code: 'INVALID_FILTER_EXCLUSIONS' });
  d.exclusions.idolBaseKeys = []; d.exclusions.equipmentTypeIds = [41];
  assert.throws(() => generateValueFilter(d), { code: 'INVALID_FILTER_EXCLUSIONS' });
});
