import test from 'node:test';
import assert from 'node:assert/strict';
import palette from '../web/src/data/filter-palette.json' with { type: 'json' };
import { createFilterRow, generateFilter, DEFAULT_STYLES } from '../web/src/core/loot-filter.js';

// This checks the external game's XML contract, independently of the preview matcher.
// Field and enum spellings come from the 1.5.2.1 ItemFiltering schema and a game export.
function draft(rows, overrides = {}) {
  return {
    name: '骷髅过滤器', language: 'zh', rows,
    options: { showRareUniques: false, showRareAffixes: false },
    styles: structuredClone(DEFAULT_STYLES), ...overrides,
  };
}
const unique = (overrides = {}) => createFilterRow('unique', { uniqueIds: [79, 171], ...overrides });
const blocks = xml => [...xml.matchAll(/<Rule>([\s\S]*?)<\/Rule>/g)].map(match => match[1]);
const value = (xml, tag) => xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\/${tag}>`))?.[1];

test('XML v9 stores rules in reverse UI order with matching Order values', () => {
  const input = draft([
    createFilterRow('affix', { id: 'gear', name: '合成头盔', purpose: 'donor', baseTypeIds: [0], affixIds: [408], minTier: 7, priority: 'core' }),
    unique({ id: 'set', name: '配装套装' }),
    createFilterRow('idol', { id: 'idol', name: '厚实神像', baseTypeIds: [28], subTypeIds: [0], affixIds: [107, 117], minCount: 2 }),
  ], { options: { showRareUniques: false, showRareAffixes: false, hideUnmatched: true } });
  const result = generateFilter(input), serialized = blocks(result.xml);
  assert.match(result.xml, /^<ItemFilter xmlns:i="http:\/\/www\.w3\.org\/2001\/XMLSchema-instance">/);
  assert.equal(value(result.xml, 'lootFilterVersion'), '9');
  assert.equal(serialized.length, result.rules.length);
  assert.deepEqual(serialized.map(rule => Number(value(rule, 'Order'))), [3, 2, 1, 0]);
  assert.deepEqual(serialized.map(rule => value(rule, 'nameOverride')), result.rules.toReversed().map(rule => typeof rule.name === 'string' ? rule.name : rule.name.zh));
  assert.equal(value(serialized[0], 'type'), 'HIDE', 'fallback is first in XML and last in game priority');
  assert.match(serialized[0], /<EquipmentType>IDOL_ALTAR<\/EquipmentType>/);
  assert.doesNotMatch(serialized[0], /<EquipmentType>(?:RUNE|GLYPH|KEY)/);
  assert.equal(value(serialized[0], 'recolor'), 'false');
});

test('unique, subtype, affix and corruption nodes use actual game serializer names', () => {
  const result = generateFilter(draft([
    unique(),
    createFilterRow('affix', { baseTypeIds: [0], subTypeIds: [36], affixIds: [408], minTier: 6, minTotalTier: 6 }),
  ]));
  assert.match(result.xml, /<Condition i:type="UniqueModifiersCondition"><Uniques><UniqueId>79<\/UniqueId><Rolls \/><\/Uniques><Uniques><UniqueId>171<\/UniqueId><Rolls \/><\/Uniques><\/Condition>/);
  assert.match(result.xml, /<Condition i:type="SubTypeCondition"><type><EquipmentType>HELMET<\/EquipmentType><\/type><subTypes><int>36<\/int><\/subTypes><\/Condition>/);
  assert.match(result.xml, /<Condition i:type="CorruptionCondition"><Corruption>OnlyUncorrupted<\/Corruption><\/Condition>/);
  assert.match(result.xml, /<affixes><int>408<\/int><\/affixes>/);
  assert.equal(value(result.xml, 'comparsion'), 'MORE_OR_EQUAL');
  assert.equal(value(result.xml, 'comparsionValue'), '6');
  assert.equal(value(result.xml, 'minOnTheSameItem'), '1');
  assert.equal(value(result.xml, 'combinedComparsion'), 'MORE_OR_EQUAL');
  assert.equal(value(result.xml, 'combinedComparsionValue'), '6');
  assert.equal(value(result.xml, 'advanced'), 'true');
  assert.doesNotMatch(result.xml, /OnlyNonCorrupted|<comparison>|<UniquesCondition|<BeamId>/);
});

test('names preserve Chinese and escape XML characters without injecting rules', () => {
  const text = '骨骼 & <Rule> "红色" \'甲\'';
  const result = generateFilter(draft([unique({ name: text })], { name: text }));
  const escaped = '骨骼 &amp; &lt;Rule&gt; &quot;红色&quot; &apos;甲&apos;';
  assert.equal(value(result.xml, 'name'), escaped);
  assert.equal(value(result.xml, 'nameOverride'), escaped);
  assert.equal(blocks(result.xml).length, 1);
  for (const illegal of ['\u0000', '\u0001', '\u000B', '\u001F']) {
    assert.throws(() => generateFilter(draft([unique()], { name: `名称${illegal}` })), /./, 'XML 1.0 control characters must not reach an export');
    assert.throws(() => generateFilter(draft([unique({ name: `规则${illegal}` })])), /./);
  }
});

test('all 18 real palette IDs and independent emphasis settings serialize correctly', () => {
  assert.deepEqual(palette.colors.map(color => color.id), Array.from({ length: 18 }, (_, id) => id));
  assert.equal(palette.colors[10].hex, '#BC47FF', 'use current RGB rather than the stale asset hexCode');
  for (const color of palette.colors) {
    assert.match(color.hex, /^#[0-9A-F]{6}$/);
    assert.ok(color.name.zh && color.name.en);
    for (const emphasized of [true, false]) {
      const input = draft([unique()]);
      input.styles.target = { color: color.id, emphasized };
      const xml = generateFilter(input).xml;
      assert.equal(value(xml, 'color'), String(color.id));
      assert.equal(value(xml, 'recolor'), 'true');
      assert.equal(value(xml, 'emphasized'), String(emphasized));
      assert.equal(value(xml, 'SoundId'), '0');
      assert.equal(value(xml, 'MapIconId'), '0');
      assert.equal(value(xml, 'BeamOverride'), 'false');
      assert.equal(value(xml, 'BeamSizeOverride'), 'NONE');
    }
  }
  for (const color of [-1, 18, 1.5, NaN, true]) {
    const input = draft([unique()]);
    input.styles.target.color = color;
    assert.throws(() => generateFilter(input));
  }
});

test('a priority style affects only its own rules and disabled rows produce no empty conditions', () => {
  const input = draft([
    unique({ name: '核心暗金' }),
    createFilterRow('affix', { name: '制作装备', affixIds: [26], baseTypeIds: [2], priority: 'crafting' }),
    createFilterRow('affix', { name: '未完成目标', enabled: false }),
  ]);
  input.styles.target = { color: 0, emphasized: false };
  input.styles.crafting = { color: 17, emphasized: true };
  const output = generateFilter(input), xmlRules = blocks(output.xml);
  assert.equal(xmlRules.length, 2);
  const crafting = xmlRules.find(rule => value(rule, 'nameOverride') === '制作装备');
  const target = xmlRules.find(rule => value(rule, 'nameOverride') === '核心暗金');
  assert.equal(value(crafting, 'color'), '17');
  assert.equal(value(crafting, 'emphasized'), 'true');
  assert.equal(value(target, 'color'), '0');
  assert.equal(value(target, 'emphasized'), 'false');
  assert.doesNotMatch(output.xml, /未完成目标|<affixes\s*\/>|<affixes>\s*<\/affixes>/);
});

test('specific subtypes cannot be combined across different equipment types', () => {
  const row = createFilterRow('affix', { baseTypeIds: [2, 4], subTypeIds: [0], affixIds: [26] });
  assert.throws(() => generateFilter(draft([row])), error => error.code === 'INVALID_FILTER_SUBTYPE');
});
