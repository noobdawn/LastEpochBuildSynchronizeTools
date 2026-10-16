import LZString from 'lz-string';
import catalog from '../data/filter-catalog.json' with { type: 'json' };
import commonAffixes from '../data/filter-common-affixes.json' with { type: 'json' };
import itemCatalog from './game-item-data.json' with { type: 'json' };
import { normalizePlannerBuild } from './planner.js';
import { resolvePlannerItemId } from './items.js';
import { EQUIPMENT_TYPES, FILTER_VERSION, MAX_FILTER_RULES, FilterError, filterLabel } from './loot-filter.js';
import fixedUniqueAffixes from '../data/filter-unique-affixes.json' with { type: 'json' };

export const COMMON_AFFIX_GROUPS = commonAffixes.groups;
export const VALUE_FILTER_DEFAULT_OPTIONS = Object.freeze({ rareUniqueThreshold: 0.9, rareSetThreshold: 0.65 });
const label = (zh, en) => ({ zh, en });
const group = (id, zh, en, descriptionZh, descriptionEn, color, emphasized = false, show = true) => ({ id, name: label(zh, en), description: label(descriptionZh, descriptionEn), defaults: { show, color, emphasized } });
/** Logical groups are editable independently. Compiled precedence rules may repeat a group. */
export const EQUIPMENT_FILTER_GROUPS = Object.freeze([
  group('equipment_core', '核心词缀崇高装备', 'Core-affix exalted equipment', '至少一条高价值词缀达到 T6/T7。', 'At least one high-value affix at T6 or higher.', 6, true),
  group('equipment_useful', '有效词缀崇高装备', 'Useful-affix exalted equipment', '至少一条有效词缀达到 T6/T7，并且至少三条有效词缀。高价值词缀也计入有效数量。', 'At least one useful affix at T6 or higher and at least three useful affixes in total, including high-value affixes.', 4, true),
  group('equipment_crafting', '考虑打造装备', 'Crafting candidates', '至少两条有效词缀达到 T5，其中至少一条是高价值词缀。', 'At least two useful affixes at T5 or higher, including at least one high-value affix at T5 or higher.', 3),
  group('equipment_leveling', '开荒过渡装备', 'Leveling equipment', '至少一条高价值词缀，并且至少三条有效词缀，不限层级。', 'At least one high-value affix and at least three useful affixes in total, at any tier.', 1),
]);
export const VALUE_FILTER_GROUPS = Object.freeze([
  ...EQUIPMENT_FILTER_GROUPS,
  group('unique_needed', '需求暗金', 'Needed uniques', '按暗金编号保留，优先于稀有度与潜能。', 'Selected unique identities take precedence over rarity and potential.', 7, true),
  group('idol_double', '双有效词缀神像', 'Two useful idol affixes', '同形状的所选需求中，一条前缀和一条后缀同时符合，允许重组。', 'A selected prefix and suffix of the same shape; selected pairs may recombine.', 9, true),
  group('idol_single', '单有效词缀神像', 'One useful idol affix', '符合一个所选词缀，未达到双词缀档。', 'One selected affix without reaching the two-affix group.', 10),
  group('unique_rare', '高价值暗金', 'High-value uniques', '随机池稀有度达到门槛，不代表 Boss 掉率或价格。', 'Meets the random-pool rarity threshold; not a boss drop rate or price.', 8, true),
  group('unique_high_lp', '高潜暗金（2–4）', 'High-potential uniques (2–4)', '拥有 2–4 传奇潜能的普通暗金；不包含 Weaver’s Will。', 'Ordinary uniques with 2–4 legendary potential; excludes Weaver’s Will.', 5, true),
  group('set_valuable', '高价值套装', 'Valuable set items', '配装需要、手动选择，或随机池稀有度达到门槛的套装。', 'Needed or selected set items, or sets meeting the random-pool rarity threshold.', 16, true),
  group('unique_common', '一般暗金', 'Other uniques', '其余暗金与传奇装备。', 'Remaining unique and legendary items.', 5),
  group('set_common', '一般套装', 'Other set items', '其余套装装备。', 'Remaining set items.', 17),
  group('equipment_other', '其他装备', 'Other equipment', '未命中以上价值组的普通、魔法、稀有与崇高装备。', 'Remaining normal, magic, rare and exalted equipment.', 1, false, false),
  group('idol_other', '其他神像', 'Other idols', '未命中所选神像词缀的神像。', 'Idols without selected matching affixes.', 1, false, false),
  group('glyph', '雕文', 'Glyphs', '所有雕文。', 'All glyphs.', 14),
  group('rune', '符文', 'Runes', '所有符文。', 'All runes.', 13),
  group('shard', '词缀碎片', 'Affix shards', '所有词缀碎片。', 'All affix shards.', 2),
  group('key', '钥匙与特殊材料', 'Keys and special materials', '游戏 AllKeys 分类，包含钥匙及部分特殊材料。', 'The game’s AllKeys category, including keys and some special materials.', 12, true),
  group('altar', '神像祭坛', 'Idol altars', '祭坛独立保留，不随普通装备兜底隐藏。', 'Altars have their own group, separate from other equipment.', 15),
]);
const BY_GROUP = Object.fromEntries(VALUE_FILTER_GROUPS.map(g => [g.id, g]));
const GEAR_TYPES = Array.from({ length: 25 }, (_, i) => i);
const IDOL_TYPES = Array.from({ length: 9 }, (_, i) => i + 25);
const ORDINARY_RARITIES = ['NORMAL', 'MAGIC', 'RARE', 'EXALTED'];
const warning = (code, zh, en, sourcePath) => ({ code, message: label(zh, en), ...(sourcePath ? { sourcePath } : {}) });
const fail = (code, zh, en) => { throw new FilterError(code, zh, en); };
const unique = values => [...new Set(values)];
const sorted = values => unique(values).sort((a, b) => a - b);
export const isValueEquipmentAffix = a => !!a && a.specialAffixType !== 7 && a.canRollOn.some(type => GEAR_TYPES.includes(type) || type === 41);
export const isValueIdolAffix = (a, baseTypeId) => !!a && a.specialAffixType !== 7 && [0, 1].includes(a.type) && IDOL_TYPES.includes(Number(baseTypeId)) && a.canRollOn.includes(Number(baseTypeId));
const isGearAffix = isValueEquipmentAffix;
function number(value, min, max, field, integer = false) {
  const result = Number(value);
  if (value == null || value === '' || typeof value === 'boolean' || !Number.isFinite(result) || result < min || result > max || (integer && !Number.isInteger(result))) fail('INVALID_FILTER_VALUE', `无效值：${field}`, `Invalid value: ${field}`);
  return result;
}
function ids(values, dictionary, field) {
  if (!Array.isArray(values)) fail('INVALID_FILTER_SELECTION', `无效选择：${field}`, `Invalid selection: ${field}`);
  const result = sorted(values.map(id => number(id, 0, 65535, field, true)));
  if (result.some(id => !Object.hasOwn(dictionary, id))) fail('UNKNOWN_FILTER_ID', `${field} 包含未知编号`, `Unknown ID in ${field}`);
  return result;
}
function readAffix(raw, sourcePath, sourceRole) {
  if (!raw || typeof raw.id !== 'string' || raw.id.length > 80 || !/^A[A-Za-z0-9+/=]+$/.test(raw.id)) fail('UNKNOWN_BUILD_AFFIX', '无法解析配装词缀', 'Cannot decode build affix');
  const decoded = LZString.decompressFromBase64(raw.id.slice(1));
  const id = decoded && /^\d+$/.test(decoded) ? Number(decoded) : NaN, definition = catalog.affixes[id];
  if (!definition) fail('UNKNOWN_BUILD_AFFIX', '词缀不在当前目录中', 'Affix is absent from the current catalog');
  const tier = number(raw.tier ?? 1, 1, definition.tierCount, 'tier', true);
  return { id, tier, name: definition.name, specialType: definition.specialAffixType, sourceRole, sourcePath };
}

/** Reads planner identities and additional affixes, never inherent ir/ur rolls. */
export function createValueFilterDraft(input) {
  const build = normalizePlannerBuild(input), warnings = [], targets = [], high = [], uniqueIds = [], setIds = [], idolRows = new Map();
  let hasUnresolvedTargets = !/^Version\s+1\.5\.\d+(?:\.\d+)?$/i.test(build.dataVersion);
  if (hasUnresolvedTargets) warnings.push(warning('BUILD_VERSION', '配装版本与目录基准不同；请先核对，兜底隐藏已关闭。', 'Build version differs from the catalog baseline; fallback hiding is disabled until reviewed.'));
  const records = [...Object.entries(build.data.equipment).filter(([, item]) => item).map(([slot, item]) => ({ slot, item, sourcePath: `data.equipment.${slot}` })),
    ...build.data.idols.filter(Boolean).map((item, index) => ({ slot: 'idol', item, sourcePath: `data.idols[${index}]` }))];
  for (const { slot, item, sourcePath } of records) {
    let identity;
    try { identity = resolvePlannerItemId(item.id); }
    catch (error) { hasUnresolvedTargets = true; warnings.push(warning('UNRESOLVED_TARGET', `${sourcePath}：${error.message}`, `${sourcePath}: ${error.message}`, sourcePath)); continue; }
    const definition = identity.uniqueId == null ? null : catalog.uniques[identity.uniqueId];
    if (identity.uniqueId != null && !definition) { hasUnresolvedTargets = true; warnings.push(warning('UNKNOWN_FILTER_UNIQUE', '独特物品不在过滤器目录中。', 'Unique is absent from the filter catalog.', sourcePath)); continue; }
    const idol = IDOL_TYPES.includes(identity.baseTypeId);
    if (definition) (definition.isSetItem ? setIds : uniqueIds).push(identity.uniqueId);
    const target = { ...identity, slot, sourcePath, kind: definition ? definition.isSetItem ? 'set' : 'unique' : idol ? 'idol' : identity.baseTypeId === 41 ? 'altar' : 'equipment', name: definition?.name ?? catalog.bases[`${identity.baseTypeId}:${identity.subTypeId}`]?.name, affixes: [], inherentAffixes: [] };
    targets.push(target);
    const candidates = [];
    if (item.affixes != null && !Array.isArray(item.affixes)) { hasUnresolvedTargets = true; warnings.push(warning('UNRESOLVED_TARGET', '配装词缀列表格式无效。', 'Invalid build affix list.', sourcePath)); }
    else for (const [index, raw] of (item.affixes ?? []).entries()) candidates.push({ raw, role: 'regular', path: `${sourcePath}.affixes[${index}]` });
    for (const [field, role] of [['sealedAffix', 'sealed'], ['corruptedAffix', 'corrupted'], ['primordialAffix', 'primordial']]) if (item[field]) candidates.push({ raw: item[field], role, path: `${sourcePath}.${field}` });
    for (const candidate of candidates) {
      try {
        const affix = readAffix(candidate.raw, candidate.path, candidate.role);
        // Exulis' type-6 variants also belong to the ordinary amulet corruption pool: exclude only this unique's fixed source.
        const fixedVariant = fixedUniqueAffixes[identity.uniqueId]?.includes(affix.id);
        if (affix.specialType === 7 && !fixedVariant) fail('INVALID_UNIQUE_VARIANT', '固有变体不属于此暗金', 'The inherent variant does not belong to this unique');
        if (fixedVariant) { target.inherentAffixes.push({ ...affix, sourceRole: 'fixed_variant' }); continue; }
        // LET also uses primordialAffix for the second fixed unique variant, at its original tier.
        if (candidate.role === 'primordial' && affix.tier !== 8) fail('INVALID_PRIMORDIAL_AFFIX', '原初词缀必须为 T8', 'Primordial affix must be T8');
        if (!catalog.affixes[affix.id].canRollOn.includes(identity.baseTypeId)) fail('INCOMPATIBLE_BUILD_AFFIX', '词缀与装备类型不兼容', 'Affix is incompatible with its item type');
        affix.origin = candidate.role === 'primordial' ? 'primordial' : affix.specialType === 3 ? 'reforged_set' : candidate.role === 'corrupted' || affix.specialType === 6 ? 'corruption' : definition?.legendaryType === 1 ? 'weaver_addition' : definition ? 'legendary_addition' : idol ? 'idol' : 'ordinary';
        target.affixes.push(affix);
        if (!idol && isGearAffix(catalog.affixes[affix.id])) high.push(affix.id);
        if ([2, 3, 4, 5, 6].includes(affix.specialType) || candidate.role === 'primordial' || definition?.legendaryType === 1) warnings.push(warning('SPECIAL_AFFIX_SOURCE', '已记录特殊附加词缀；价值分组只判断词缀，不代表普通掉落或制作路线。', 'Special additional affix recorded. Value grouping does not imply an ordinary drop or crafting route.', candidate.path));
      } catch (error) { hasUnresolvedTargets = true; warnings.push(warning('UNRESOLVED_TARGET', `${candidate.path}：${error.message}`, `${candidate.path}: ${error.message}`, candidate.path)); }
    }
    if (idol && !definition && target.affixes.length) {
      const affixIds = sorted(target.affixes.map(a => a.id)), key = [identity.baseTypeId, identity.subTypeId, ...affixIds].join('-');
      if (idolRows.has(key)) { const row = idolRows.get(key); row.count++; row.sourcePaths.push(sourcePath); }
      else idolRows.set(key, { id: `idol-${key}`, baseTypeId: identity.baseTypeId, subTypeId: identity.subTypeId, affixIds, enabled: true, count: 1, sourcePaths: [sourcePath], name: target.name });
    }
  }
  const highAffixIds = sorted(high), mediumAffixIds = sorted(COMMON_AFFIX_GROUPS.flatMap(g => g.affixIds).filter(id => !highAffixIds.includes(id)));
  const groups = Object.fromEntries(VALUE_FILTER_GROUPS.map(g => [g.id, { ...g.defaults }]));
  if (hasUnresolvedTargets) { groups.equipment_other.show = true; groups.idol_other.show = true; }
  return { schemaVersion: 3, name: build.id ? `Build ${build.id}` : 'Build 价值过滤器', language: 'zh', build: { id: build.id, sourceUrl: build.sourceUrl, dataVersion: build.dataVersion, classId: Number(build.data.bio.characterClass) }, uniqueIds: sorted(uniqueIds), setIds: sorted(setIds), highAffixIds, mediumAffixIds, idols: [...idolRows.values()],
    analysis: { targets, warnings, hasUnresolvedTargets, build: { id: build.id, sourceUrl: build.sourceUrl, dataVersion: build.dataVersion, classId: Number(build.data.bio.characterClass) }, summary: { equipmentCount: records.filter(r => r.slot !== 'idol').length, idolCount: records.filter(r => r.slot === 'idol').length, uniqueCount: unique(uniqueIds).length, setCount: unique(setIds).length, highAffixCount: highAffixIds.length } }, groups, exclusions: { equipmentTypeIds: [], idolTypeIds: [], idolBaseKeys: [] }, options: { ...VALUE_FILTER_DEFAULT_OPTIONS } };
}

const rarity = rarities => ({ type: 'rarity', rarities });
const subtype = baseTypeIds => ({ type: 'subtype', baseTypeIds, subTypeIds: [] });
const identities = uniqueIds => ({ type: 'unique', uniqueIds });
const affix = (affixIds, minTier = 1, minCount = 1, minTotalTier = 0) => ({ type: 'affix', affixIds, minTier, minCount, minTotalTier });
// AffixCondition's editor clamps impossible count values. Never emit a condition that would be broadened this way.
function viable(c) {
  if (c.type !== 'affix') return true;
  const definitions = c.affixIds.map(id => catalog.affixes[id]).filter(a => Array.from({ length: a.tierCount }, (_, i) => i + 1).some(tier => compare(tier, c.comparison ?? 'MORE_OR_EQUAL', c.minTier)));
  const prefix = definitions.filter(a => a.type === 0), suffix = definitions.filter(a => a.type === 1);
  const maxCount = Math.min(4, (prefix.length ? 2 : 0) + (suffix.length ? 2 : 0), prefix.length + suffix.length);
  return c.affixIds.length > 0 && maxCount >= c.minCount && definitions.reduce((sum, a) => sum + a.tierCount, 0) >= c.minTotalTier;
}
function validateDraft(draft) {
  if (!draft || draft.schemaVersion !== 3 || typeof draft.name !== 'string' || !draft.name.trim() || draft.name.length > 200 || !['zh', 'en'].includes(draft.language)) fail('INVALID_FILTER_DRAFT', '请填写过滤器名称并选择语言', 'Enter a filter name and language');
  const high = ids(draft.highAffixIds, catalog.affixes, 'highAffixIds'), medium = ids(draft.mediumAffixIds, catalog.affixes, 'mediumAffixIds').filter(id => !high.includes(id));
  if ([...high, ...medium].some(id => !isGearAffix(catalog.affixes[id]))) fail('INVALID_EQUIPMENT_AFFIX', '装备价值池包含神像或固有属性', 'Equipment pools contain idol or inherent affixes');
  const uniqueIds = ids(draft.uniqueIds, catalog.uniques, 'uniqueIds'), setIds = ids(draft.setIds, catalog.uniques, 'setIds');
  if (uniqueIds.some(id => catalog.uniques[id].isSetItem) || setIds.some(id => !catalog.uniques[id].isSetItem)) fail('INVALID_UNIQUE_KIND', '暗金与套装需要分别选择', 'Select uniques and sets separately');
  const options = { ...VALUE_FILTER_DEFAULT_OPTIONS, ...draft.options };
  options.rareUniqueThreshold = number(options.rareUniqueThreshold, 0, 1, 'rareUniqueThreshold');
  options.rareSetThreshold = number(options.rareSetThreshold, 0, 1, 'rareSetThreshold');
  const styles = Object.fromEntries(VALUE_FILTER_GROUPS.map(g => {
    const style = draft.groups?.[g.id] ?? g.defaults;
    if (typeof style.show !== 'boolean' || typeof style.emphasized !== 'boolean') fail('INVALID_FILTER_STYLE', '分组显示设置无效', 'Invalid group visibility or emphasis');
    return [g.id, { show: style.show, emphasized: style.emphasized, color: number(style.color, 0, 17, `${g.id}.color`, true) }];
  }));
  const exclusions = validateExclusions(draft.exclusions);
  if (draft.analysis?.hasUnresolvedTargets && (!styles.equipment_other.show || !styles.idol_other.show)) fail('UNRESOLVED_HIDE_TARGETS', '配装有未解析的目标，不能启用兜底隐藏', 'Unresolved build targets prevent fallback hiding');
  if (!Array.isArray(draft.idols)) fail('INVALID_IDOL_FILTER', '神像需求格式无效', 'Invalid idol targets');
  const idolPools = new Map(), rowIds = new Set();
  for (const row of draft.idols) {
    if (!row || typeof row.id !== 'string' || !row.id || rowIds.has(row.id) || typeof row.enabled !== 'boolean') fail('INVALID_IDOL_FILTER', '神像条目编号或开关无效', 'Invalid idol row ID or enabled state');
    rowIds.add(row.id); if (!row.enabled) continue;
    const type = number(row.baseTypeId, 25, 33, 'baseTypeId', true), selected = ids(row.affixIds, catalog.affixes, 'idol.affixIds');
    if (!selected.length) fail('EMPTY_IDOL_SELECTION', '启用的神像条目需要词缀', 'An enabled idol row needs affixes');
    if (selected.some(id => !isValueIdolAffix(catalog.affixes[id], type))) fail('INCOMPATIBLE_IDOL_AFFIX', '神像词缀与形状不兼容', 'Idol affix is incompatible with its shape');
    if (row.subTypeId != null && !Object.hasOwn(itemCatalog.bases[type]?.subtypes ?? {}, number(row.subTypeId, 0, 65535, 'subTypeId', true))) fail('INVALID_IDOL_SUBTYPE', '神像底材不属于所选形状', 'Idol base does not belong to the selected shape');
    idolPools.set(type, sorted([...(idolPools.get(type) ?? []), ...selected]));
  }
  return { high, medium, uniqueIds, setIds, options, styles, idolPools, exclusions };
}

/** Four fixed, ordered templates; item types and affix alternatives share native ID sets. */
export function generateValueFilter(draft) {
  const { high, medium, uniqueIds, setIds, options, styles, idolPools, exclusions } = validateDraft(draft);
  const warnings = [...(draft.analysis?.warnings ?? [])], rules = [], useful = sorted([...high, ...medium]);
  const definitions = BY_GROUP;
  const add = (groupId, key, conditions) => {
    if (!conditions.every(viable) || conditions.some(c => c.type === 'unique' && !c.uniqueIds.length)) return;
    const style = styles[groupId]; rules.push({ id: `${groupId}-${key}`, groupId, name: style.name === undefined ? definitions[groupId].name : style.name, description: definitions[groupId].description, type: style.show ? 'SHOW' : 'HIDE', conditions, style: { color: style.color, emphasized: style.emphasized }, order: rules.length });
  };
  const equipment = [rarity(ORDINARY_RARITIES), subtype(GEAR_TYPES)];
  const excludedTypes = sorted([...exclusions.equipmentTypeIds, ...exclusions.idolTypeIds]);
  const hide = (key, conditions) => rules.push({ id: `excluded-${key}`, groupId: 'excluded', name: label('隐藏所选类型', 'Hide selected types'), type: 'HIDE', conditions, style: { color: 0, emphasized: false } });
  if (excludedTypes.length) hide('types', [subtype(excludedTypes)]);
  for (const type of IDOL_TYPES) {
    if (exclusions.idolTypeIds.includes(type)) continue;
    const subTypeIds = exclusions.idolBaseKeys.filter(key => Number(key.split(':')[0]) === type).map(key => Number(key.split(':')[1]));
    // Native subTypes are respected only when exactly one EquipmentType is selected.
    if (subTypeIds.length) hide(`idols-${type}`, [{ type: 'subtype', baseTypeIds: [type], subTypeIds }]);
  }
  add('unique_needed', 'selected', [identities(uniqueIds)]);
  add('equipment_core', 'fixed', [rarity(['EXALTED']), subtype(GEAR_TYPES), affix(high, 6)]);
  add('equipment_useful', 'fixed', [rarity(['EXALTED']), subtype(GEAR_TYPES), affix(useful, 6), affix(useful, 1, 3)]);
  add('equipment_crafting', 'fixed', [...equipment, affix(high, 5), affix(useful, 5, 2)]);
  add('equipment_leveling', 'fixed', [...equipment, affix(high), affix(useful, 1, 3)]);
  add('equipment_other', 'remaining', equipment);
  for (const [baseTypeId, selected] of idolPools) {
    const scope = [rarity(ORDINARY_RARITIES), subtype([baseTypeId])];
    add('idol_double', `shape${baseTypeId}`, [...scope, affix(selected.filter(id => catalog.affixes[id].type === 0)), affix(selected.filter(id => catalog.affixes[id].type === 1))]);
    add('idol_single', `shape${baseTypeId}`, [...scope, affix(selected)]);
  }
  const rareIds = (sets, threshold) => Object.values(catalog.uniques).filter(u => u.isSetItem === sets && !u.hideFromPlayers && u.canDropRandomly && u.rerollChance >= threshold).map(u => u.id);
  add('unique_rare', 'random-pool', [identities(rareIds(false, options.rareUniqueThreshold))]);
  const lpIds = Object.values(catalog.uniques).filter(u => !u.isSetItem && u.legendaryType === 0 && !u.hideFromPlayers).map(u => u.id);
  add('unique_high_lp', 'lp2to4', [rarity(['UNIQUE', 'LEGENDARY']), identities(lpIds), { type: 'potential', minLegendaryPotential: 2, maxLegendaryPotential: 4 }]);
  add('set_valuable', 'selected-or-rare', [identities(sorted([...setIds, ...rareIds(true, options.rareSetThreshold)]))]);
  // Reforged sets can have LEGENDARY rarity, so identity (not just the rarity flag) separates sets.
  add('unique_common', 'remaining', [identities(Object.values(catalog.uniques).filter(u => !u.isSetItem).map(u => u.id))]);
  add('set_common', 'remaining', [identities(Object.values(catalog.uniques).filter(u => u.isSetItem).map(u => u.id))]);
  add('idol_other', 'remaining', [rarity(ORDINARY_RARITIES), subtype(IDOL_TYPES)]);
  for (const kind of ['glyph', 'rune', 'shard', 'key']) add(kind, 'all', [{ type: 'resource', kind }]);
  add('altar', 'all', [subtype([41])]);
  rules.forEach((rule, index) => { rule.order = index; });
  if (rules.length > MAX_FILTER_RULES) fail('TOO_MANY_FILTER_RULES', `原生规则超过 ${MAX_FILTER_RULES} 条`, `More than ${MAX_FILTER_RULES} native rules`);
  warnings.push(warning('RELATIVE_UNIQUE_RARITY', '暗金和套装的稀有门槛只比较随机池 rerollChance，不代表 Boss 掉率或市场价格。', 'Unique and set rarity thresholds compare random-pool rerollChance, not boss drop rates or market prices.'));
  const orderedGroups = VALUE_FILTER_GROUPS.filter(g => g.id !== 'equipment_other');
  return { xml: serialize(rules, draft), rules, warnings, diagnostics: { approximate: false, ruleCount: rules.length, equipmentRuleCount: rules.filter(r => EQUIPMENT_FILTER_GROUPS.some(g => g.id === r.groupId)).length }, groups: orderedGroups.map(g => ({ ...g, ...styles[g.id], ruleCount: rules.filter(r => r.groupId === g.id).length })) };
}

function escapeXml(value) {
  const text = String(value ?? '');
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/u.test(text) || (text.isWellFormed && !text.isWellFormed())) fail('INVALID_XML_TEXT', '名称含有无效 XML 字符', 'A name contains invalid XML characters');
  return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
}
const RESOURCE_XML = {
  glyph: ['GlyphCondition', 'GlyphFilterFlags', 'AllGlyphs'], rune: ['RuneCondition', 'RuneFilterFlags', 'AllRunes'],
  shard: ['CraftingMaterialsCondition', 'NonEquippableItemFilterFlags', 'AllShards'], key: ['KeysCondition', 'NonEquippableItemFilterFlags', 'AllKeys'],
};
function conditionXml(c) {
  const wrap = (type, body) => `        <Condition i:type="${type}">${body}</Condition>`;
  if (c.type === 'unique') return wrap('UniqueModifiersCondition', c.uniqueIds.map(id => `<Uniques><UniqueId>${id}</UniqueId><Rolls /></Uniques>`).join(''));
  if (c.type === 'subtype') return wrap('SubTypeCondition', `<type>${c.baseTypeIds.map(id => `<EquipmentType>${EQUIPMENT_TYPES[id]}</EquipmentType>`).join('')}</type><subTypes>${c.subTypeIds?.map(id => `<int>${id}</int>`).join('') ?? ''}</subTypes>`);
  if (c.type === 'rarity') return wrap('RarityCondition', `<rarity>${c.rarities.join(' ')}</rarity>`);
  if (c.type === 'affix') return wrap('AffixCondition', `<affixes>${c.affixIds.map(id => `<int>${id}</int>`).join('')}</affixes><comparsion>${c.comparison ?? 'MORE_OR_EQUAL'}</comparsion><comparsionValue>${c.minTier}</comparsionValue><minOnTheSameItem>${c.minCount}</minOnTheSameItem><combinedComparsion>${c.combinedComparison ?? (c.minTotalTier ? 'MORE_OR_EQUAL' : 'ANY')}</combinedComparsion><combinedComparsionValue>${c.minTotalTier || 1}</combinedComparsionValue><advanced>true</advanced>`);
  if (c.type === 'potential') return wrap('PotentialCondition', ['MinLegendaryPotential', 'MaxLegendaryPotential', 'MinWeaversWill', 'MaxWeaversWill', 'MinWeaversTouch', 'MaxWeaversTouch', 'MinForgingPotential', 'MaxForgingPotential'].map(field => { const value = c[field[0].toLowerCase() + field.slice(1)]; return value == null ? `<${field} i:nil="true" />` : `<${field}>${value}</${field}>`; }).join(''));
  if (c.type === 'resource') { const [type, field, value] = RESOURCE_XML[c.kind]; return wrap(type, `<${field}>${value}</${field}>`); }
  fail('UNKNOWN_FILTER_CONDITION', '无法序列化规则条件', 'Cannot serialize filter condition');
}
function serialize(rules, draft) {
  const body = [...rules].reverse().map(rule => `    <Rule>\n      <type>${rule.type}</type>\n      <conditions>\n${rule.conditions.map(conditionXml).join('\n')}\n      </conditions>\n      <recolor>${rule.type === 'SHOW'}</recolor>\n      <color>${rule.style.color}</color>\n      <isEnabled>true</isEnabled>\n      <levelDependent_deprecated>false</levelDependent_deprecated>\n      <minLvl_deprecated>0</minLvl_deprecated>\n      <maxLvl_deprecated>0</maxLvl_deprecated>\n      <emphasized>${rule.style.emphasized}</emphasized>\n      <nameOverride>${escapeXml(filterLabel(rule.name, draft.language))}</nameOverride>\n      <SoundId>0</SoundId>\n      <MapIconId>0</MapIconId>\n      <BeamOverride>false</BeamOverride>\n      <BeamSizeOverride>NONE</BeamSizeOverride>\n      <BeamColorOverride>0</BeamColorOverride>\n      <Order>${rule.order}</Order>\n    </Rule>`).join('\n');
  return `<ItemFilter xmlns:i="http://www.w3.org/2001/XMLSchema-instance">\n  <name>${escapeXml(draft.name)}</name>\n  <filterIcon>0</filterIcon>\n  <filterIconColor>0</filterIconColor>\n  <description>${escapeXml(draft.language === 'en' ? 'Four fixed equipment categories and selected hidden item types.' : '四类固定装备规则与所选类型隐藏。')}</description>\n  <lastModifiedInVersion>${itemCatalog.gameVersion}</lastModifiedInVersion>\n  <lootFilterVersion>${FILTER_VERSION}</lootFilterVersion>\n  <rules>\n${body}\n  </rules>\n</ItemFilter>\n`;
}

function compare(actual, operation, expected) {
  if (operation === 'ANY') return true;
  if (operation === 'EQUAL') return actual === expected;
  if (operation === 'LESS') return actual < expected;
  if (operation === 'LESS_OR_EQUAL') return actual <= expected;
  if (operation === 'MORE') return actual > expected;
  if (operation === 'MORE_OR_EQUAL') return actual >= expected;
  return false;
}
/** Preview input uses decoded IDs, display tiers (T1=1), rarity enum names, and legendaryPotential. */
export function matchValueFilterRule(rule, item) {
  const affixes = [...(item.affixes ?? []), ...['sealedAffix', 'corruptedAffix', 'primordialAffix'].map(field => item[field]).filter(Boolean)];
  return rule.conditions.every(c => {
    if (c.type === 'unique') return ['UNIQUE', 'SET', 'LEGENDARY'].includes(item.rarity) && c.uniqueIds.includes(item.uniqueId);
    if (c.type === 'subtype') return c.baseTypeIds.includes(item.baseTypeId) && (c.baseTypeIds.length !== 1 || !c.subTypeIds?.length || c.subTypeIds.includes(item.subTypeId));
    if (c.type === 'rarity') return c.rarities.includes(item.rarity);
    if (c.type === 'affix') { const found = affixes.filter(a => c.affixIds.includes(a.affixId ?? a.id) && compare(a.tier, c.comparison ?? 'MORE_OR_EQUAL', c.minTier)); return found.length >= c.minCount && compare(found.reduce((sum, a) => sum + a.tier, 0), c.combinedComparison ?? (c.minTotalTier ? 'MORE_OR_EQUAL' : 'ANY'), c.minTotalTier); }
    if (c.type === 'potential') return Number.isFinite(item.legendaryPotential) && item.legendaryPotential >= c.minLegendaryPotential && item.legendaryPotential <= c.maxLegendaryPotential;
    if (c.type === 'resource') return (item.resourceKind ?? item.kind) === c.kind;
    return false;
  });
}
export function evaluateValueItem(draft, item) {
  const { rules } = generateValueFilter(draft), rule = rules.find(r => matchValueFilterRule(r, item));
  return { groupId: rule?.groupId ?? null, outcome: rule?.type ?? 'SHOW', rule: rule ?? null };
}


// Planner class indices are 0..4; item ClassRequirement uses bits 1,2,4,8,16.
export const FILTER_CLASSES = Object.freeze([
  { id: 0, bit: 1, name: label('野蛮人', 'Primalist') },
  { id: 1, bit: 2, name: label('法师', 'Mage') },
  { id: 2, bit: 4, name: label('哨卫', 'Sentinel') },
  { id: 3, bit: 8, name: label('侍祭', 'Acolyte') },
  { id: 4, bit: 16, name: label('游侠', 'Rogue') },
]);
export const FILTER_EQUIPMENT_TYPES = Object.freeze(GEAR_TYPES.map(id => catalog.types[id]));
export const FILTER_IDOL_TYPES = Object.freeze(IDOL_TYPES.map(id => catalog.types[id]));
export const FILTER_IDOL_BASES = Object.freeze(Object.values(catalog.bases).filter(base => IDOL_TYPES.includes(base.baseType) && !base.hideInFilter && !base.legacy).map(base => ({ ...base, key: `${base.baseType}:${base.subType}` })));
export function getOtherClassIdolKeys(classId) {
  const current = FILTER_CLASSES.find(c => c.id === classId);
  return current ? FILTER_IDOL_BASES.filter(base => base.classRequirement && !(base.classRequirement & current.bit)).map(base => base.key) : [];
}
function validateExclusions(value) {
  if (!value || typeof value !== 'object') fail('INVALID_FILTER_EXCLUSIONS', '隐藏类型选择无效', 'Invalid hidden-type selections');
  const equipmentTypeIds = ids(value.equipmentTypeIds, catalog.types, 'excluded.equipmentTypeIds');
  const idolTypeIds = ids(value.idolTypeIds, catalog.types, 'excluded.idolTypeIds');
  if (equipmentTypeIds.some(id => !GEAR_TYPES.includes(id)) || idolTypeIds.some(id => !IDOL_TYPES.includes(id))) fail('INVALID_FILTER_EXCLUSIONS', '隐藏类型不属于装备或神像', 'Hidden type is outside equipment or idol types');
  const validBases = new Set(FILTER_IDOL_BASES.map(base => base.key));
  if (!Array.isArray(value.idolBaseKeys) || value.idolBaseKeys.some(key => typeof key !== 'string' || !validBases.has(key))) fail('INVALID_FILTER_EXCLUSIONS', '隐藏神像底材无效', 'Invalid hidden idol base');
  return { equipmentTypeIds, idolTypeIds, idolBaseKeys: [...new Set(value.idolBaseKeys)] };
}
