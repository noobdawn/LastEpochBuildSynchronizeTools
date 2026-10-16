import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../web/src/data/filter-catalog.json' with { type: 'json' };
import itemCatalog from '../web/src/core/game-item-data.json' with { type: 'json' };
import research from '../docs/data/filter-rarity-data.json' with { type: 'json' };

test('filter names and compatibility retain the same item IDs as the supported codec', () => {
  assert.equal(catalog.source.gameBuildHash, itemCatalog.buildHash);
  assert.equal(catalog.source.localization.gameBuildHash, itemCatalog.buildHash);
  assert.equal(research.source.gameBuildHash, itemCatalog.buildHash);
  assert.deepEqual(Object.keys(catalog.affixes), Object.keys(itemCatalog.affixes));
  assert.deepEqual(Object.keys(catalog.uniques), Object.keys(itemCatalog.uniques));
  for (const [id, affix] of Object.entries(catalog.affixes)) {
    assert.equal(affix.id, Number(id));
    assert.equal(affix.specialAffixType, itemCatalog.affixes[id].specialType);
    assert.deepEqual(affix.canRollOn, itemCatalog.affixes[id].canRollOn);
    for (const type of affix.canRollOn) assert.ok(catalog.types[type]);
  }
  for (const [id, unique] of Object.entries(catalog.uniques)) {
    assert.equal(unique.baseType, itemCatalog.uniques[id].baseType);
    assert.deepEqual(unique.subTypes, itemCatalog.uniques[id].subTypes);
    for (const subtype of unique.subTypes) assert.ok(catalog.bases[`${unique.baseType}:${subtype}`]);
  }
  for (const type of Object.values(catalog.types)) assert.equal(type.id, type.filterEquipmentType);
});

test('official Chinese labels cover every affix and unique, without fabricated placeholder translations', () => {
  assert.equal(catalog.affixes[36].name.zh, '复合生命');
  assert.equal(catalog.affixes[572].name.zh, '召唤骷髅等级');
  assert.equal(catalog.affixes[579].name.zh, '召唤幽灵等级');
  assert.equal(catalog.affixes[1].name.zh, '提高护甲'); // Enabled filter override, not plain Armor.
  assert.equal(catalog.uniques[277].name.zh, '阿特拉里亚的红戒指');
  assert.equal(catalog.uniques[476].name.zh, '死亡之舞');
  assert.equal(catalog.types[1].name.zh, '胸甲');
  assert.equal(catalog.types[40].name.zh, null); // Unused game placeholder has no official name.
  assert.equal(catalog.bases['40:0'].name.zh, null);
  assert.equal(catalog.localizationCoverage.affixesZh, Object.keys(catalog.affixes).length);
  assert.equal(catalog.localizationCoverage.uniquesZh, Object.keys(catalog.uniques).length);
  assert.deepEqual(catalog.localizationCoverage.missingAffixZhIds, []);
  assert.deepEqual(catalog.localizationCoverage.missingUniqueZhIds, []);
  for (const group of ['affixes', 'uniques', 'types', 'bases']) {
    for (const [id, row] of Object.entries(catalog[group])) {
      assert.ok(row.name.en?.length, `${group} ${id} needs an English fallback`);
      if (row.name.zh) assert.match(row.name.zh, /\p{Script=Han}/u, `${group} ${id} has no Chinese text`);
      for (const value of Object.values(row.name)) {
        if (value) assert.doesNotMatch(value, /[{}\uFFFD<>]/, `${group} ${id} contains unresolved display markup`);
      }
    }
  }
  assert.equal(catalog.source.localization.files.length, 3);
  for (const file of catalog.source.localization.files) assert.match(file.sha256, /^[a-f0-9]{64}$/);
});

test('bilingual browser catalog retains research weights and acquisition restrictions exactly', () => {
  for (const row of research.affixes) {
    const item = catalog.affixes[row.affixId];
    assert.deepEqual(item.name, row.localizedName);
    assert.equal(item.weighting, row.weighting);
    assert.equal(item.standard, row.derived.ordinaryDropAffix);
    assert.equal(item.hasShard, row.derived.hasShard);
    assert.deepEqual(item.effectiveWeightByType, row.derived.effectiveWeightByEquipmentType);
  }
  for (const row of research.uniques) {
    const item = catalog.uniques[row.uniqueID];
    assert.deepEqual(item.name, row.localizedName);
    assert.equal(item.rerollChance, row.rerollChance);
    assert.equal(item.canDropRandomly, row.canDropRandomly);
    assert.equal(item.hideFromPlayers, row.hideFromPlayers);
    assert.deepEqual(item.effectiveLpLevelBySubtype, row.derived.effectiveLevelForLegendaryPotentialBySubtype);
  }
  assert.equal(catalog.uniques[46].hideFromPlayers, true);
  assert.deepEqual(catalog.uniques[61].effectiveLpLevelBySubtype, { 8: 76 });
  assert.ok(Object.values(catalog.affixes).some(affix => affix.weighting > 1));
  assert.ok(Object.values(catalog.affixes).some(affix => affix.rollsOn === 1 && !affix.hasShard));
});
