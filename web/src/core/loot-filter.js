import LZString from 'lz-string';
import catalog from '../data/filter-catalog.json' with { type: 'json' };
import itemCatalog from './game-item-data.json' with { type: 'json' };
import { normalizePlannerBuild } from './planner.js';
import { resolvePlannerItemId } from './items.js';

export const FILTER_CATALOG = catalog;
export const FILTER_VERSION = 9;
export const MAX_FILTER_RULES = 200;
export const FILTER_PRIORITIES = Object.freeze(['target', 'core', 'crafting', 'valuable', 'global']);
export const DEFAULT_OPTIONS = Object.freeze({
  showAllUniques: false, showRareUniques: true, rareUniqueRerollThreshold: 0.9,
  showSets: false, showRareAffixes: true, rareAffixWeightThreshold: 0.15,
  rareAffixMinTier: 1, showGoodExalted: false, goodExaltedMinTier: 7, hideUnmatched: false,
});
export const DEFAULT_STYLES = Object.freeze({
  target: Object.freeze({ color: 7, emphasized: true }), core: Object.freeze({ color: 6, emphasized: true }),
  crafting: Object.freeze({ color: 4, emphasized: false }), valuable: Object.freeze({ color: 11, emphasized: false }),
  global: Object.freeze({ color: 1, emphasized: false }),
});
// EquipmentType names from the same 1.5.2.1 game build as the catalog.
export const EQUIPMENT_TYPES = Object.freeze([
  'HELMET', 'BODY_ARMOR', 'BELT', 'BOOTS', 'GLOVES', 'ONE_HANDED_AXE', 'ONE_HANDED_DAGGER', 'ONE_HANDED_MACES',
  'ONE_HANDED_SCEPTRE', 'ONE_HANDED_SWORD', 'WAND', 'ONE_HANDED_FIST', 'TWO_HANDED_AXE', 'TWO_HANDED_MACE',
  'TWO_HANDED_SPEAR', 'TWO_HANDED_STAFF', 'TWO_HANDED_SWORD', 'QUIVER', 'SHIELD', 'CATALYST', 'AMULET', 'RING',
  'RELIC', 'BOW', 'CROSSBOW', 'IDOL_1x1_ETERRA', 'IDOL_1x1_LAGON', 'IDOL_2x1', 'IDOL_1x2', 'IDOL_3x1',
  'IDOL_1x3', 'IDOL_4x1', 'IDOL_1x4', 'IDOL_2x2', 'BLESSING', 'GREATER_LENS', 'ARCTUS_LENS', 'MESEMBRIA_LENS',
  'EOS_LENS', 'DYSIS_LENS', 'UNUSED', 'IDOL_ALTAR',
]);
const GEAR_TYPES = [...Array.from({ length: 34 }, (_, i) => i), 41];
const ORDINARY_RARITIES = ['NORMAL', 'MAGIC', 'RARE', 'EXALTED'];
const SLOT_NAMES = { head: '头盔', amulet: '项链', chest: '胸甲', weapon1: '主手', weapon2: '副手', waist: '腰带', ring1: '戒指一', ring2: '戒指二', feet: '鞋', hands: '手套', relic: '遗物', idol_altar: '神像祭坛' };
const own = (o, k) => Object.hasOwn(o, k);
const label = (zh, en) => ({ zh, en });
const warning = (code, zh, en, rowId) => ({ code, message: label(zh, en), ...(rowId ? { rowId } : {}) });
const nameOf = (item, fallback = '') => item?.name ?? label(null, fallback);
export function filterLabel(value, language = 'zh') { return typeof value === 'string' ? value : value?.[language] || value?.en || value?.zh || ''; }
export class FilterError extends Error {
  constructor(code, zh, en, rowId) { super(`${zh} / ${en}`); this.name = 'FilterError'; this.code = code; this.rowId = rowId; }
}
const fail = (code, zh, en, rowId) => { throw new FilterError(code, zh, en, rowId); };
function number(value, min, max, field, rowId) {
  const result = Number(value);
  if (value == null || value === '' || typeof value === 'boolean' || !Number.isFinite(result) || result < min || result > max) fail('INVALID_FILTER_VALUE', `无效值：${field}`, `Invalid value: ${field}`, rowId);
  return result;
}
function integer(value, min, max, field, rowId) { const n = number(value, min, max, field, rowId); if (!Number.isInteger(n)) fail('INVALID_FILTER_VALUE', `需要整数：${field}`, `Expected integer: ${field}`, rowId); return n; }
function ids(values, dictionary, field, rowId, allowEmpty = false) {
  if (!Array.isArray(values) || (!allowEmpty && !values.length)) fail('EMPTY_FILTER_SELECTION', `请选择${field}`, `Select ${field}`, rowId);
  const result = [...new Set(values.map(v => integer(v, 0, 65535, field, rowId)))];
  if (dictionary && result.some(id => !own(dictionary, id))) fail('UNKNOWN_FILTER_ID', `${field}包含未知编号`, `Unknown ${field} ID`, rowId);
  return result;
}

let customSequence = 0;
/** Editable plain objects. Empty new selections deliberately fail export until selected or disabled. */
export function createFilterRow(kind = 'affix', overrides = {}) {
  if (!['unique', 'affix', 'idol'].includes(kind)) fail('INVALID_FILTER_KIND', '不支持的规则类型', 'Unsupported row kind');
  return {
    id: `custom-${Date.now()}-${++customSequence}`, kind, enabled: true, name: label('新增目标', 'New target'),
    purpose: kind === 'unique' ? 'target' : kind === 'idol' ? 'idol' : 'crafting', category: 'utility',
    slot: null, baseTypeIds: [], subTypeIds: [], uniqueIds: [], affixIds: [],
    minTier: 1, minCount: 1, minTotalTier: 0, requireExalted: false, excludeCorrupted: false,
    priority: kind === 'unique' || kind === 'idol' ? 'target' : 'crafting', sourcePaths: [], notes: [], ...overrides,
  };
}

/** Suggested organizational labels only; this is not a damage calculator. */
export function classifyAffix(affix) {
  const text = filterLabel(affix?.name, 'en');
  if (/health|ward|resistan|armou?r|dodge|endurance|block|glancing|damage taken|stun avoidance|healing/i.test(text)) return 'survival';
  if (/damage|penetration|bleed|ignite|poison|frostbite|critical|crit |attack speed|cast speed|shred|level of|chance to (cast|inflict)/i.test(text)) return 'damage';
  return 'utility';
}
/** Editor cap, tightened for ordinary/Weaver idol generation: one prefix and one suffix. */
export function getFilterRowMaxCount(affixIds, idol = false) {
  const definitions = [...new Set(affixIds)].map(id => catalog.affixes[id]).filter(Boolean);
  const prefixes = definitions.filter(a => a.type === 0).length;
  const suffixes = definitions.filter(a => a.type === 1).length;
  if (idol) return Number(prefixes > 0) + Number(suffixes > 0);
  return Math.min(4, (prefixes ? 2 : 0) + (suffixes ? 2 : 0), prefixes + suffixes);
}
function readAffix(raw, sourcePath) {
  if (!raw || typeof raw.id !== 'string' || raw.id.length > 80 || !/^A[A-Za-z0-9+/=]+$/.test(raw.id)) fail('UNKNOWN_BUILD_AFFIX', '无法解析配装词缀', 'Cannot decode build affix');
  const text = LZString.decompressFromBase64(raw.id.slice(1));
  if (!text || !/^\d+$/.test(text) || !catalog.affixes[Number(text)]) fail('UNKNOWN_BUILD_AFFIX', '词缀不在当前游戏目录中', 'Affix is absent from the current catalog');
  const id = Number(text), definition = catalog.affixes[id];
  return { id, tier: integer(raw.tier ?? 1, 1, definition.tierCount, 'tier'), name: nameOf(definition), specialType: definition.specialAffixType, sourcePath };
}

export function analyzeFilterBuild(input) {
  const build = normalizePlannerBuild(input), rows = [], warnings = [], targets = [], uniqueRows = new Map(), idolRows = new Map();
  const records = [...Object.entries(build.data.equipment).filter(([, item]) => item).map(([slot, item]) => ({ slot, item, path: `data.equipment.${slot}`, idol: false })),
    ...build.data.idols.filter(Boolean).map((item, index) => ({ slot: 'idol', item, path: `data.idols[${index}]`, idol: true }))];
  let hasUnresolvedTargets = false;
  if (!/^Version\s+1\.5\.\d+(?:\.\d+)?$/i.test(build.dataVersion)) {
    hasUnresolvedTargets = true;
    warnings.push(warning('BUILD_VERSION', '配装版本与当前目录基准不同；请核对目标，不允许开启兜底隐藏。', 'Build version differs from the catalog baseline; review targets. Hiding unmatched items is blocked.'));
  }
  for (const { slot, item, path, idol } of records) {
    try {
      const identity = resolvePlannerItemId(item.id), unique = catalog.uniques[identity.uniqueId];
      if (identity.uniqueId != null && !unique) fail('UNKNOWN_FILTER_UNIQUE', '独特物品不在过滤器目录中', 'Unique is absent from the filter catalog');
      if (item.ruined || (item.corrupted && !unique)) {
        hasUnresolvedTargets = true;
        warnings.push(warning('SPECIAL_ITEM_STATE', `${path} 包含毁坏或腐化状态，前身候选不保证保留最终状态；请核对，暂不允许兜底隐藏。`, `${path} has ruined/corrupted state. Precursor candidates do not guarantee retention of its final state; hiding unmatched items is blocked.`));
      }
      const affixes = (item.affixes ?? []).map((a, index) => ({ ...readAffix(a, `${path}.affixes[${index}]`), sourceRole: 'regular' }));
      if (item.sealedAffix) affixes.push({ ...readAffix(item.sealedAffix, `${path}.sealedAffix`), sourceRole: 'sealed' });
      if (item.corruptedAffix) affixes.push({ ...readAffix(item.corruptedAffix, `${path}.corruptedAffix`), sourceRole: 'corrupted' });
      for (const a of affixes) if (!catalog.affixes[a.id].canRollOn.includes(identity.baseTypeId)) fail('INCOMPATIBLE_BUILD_AFFIX', '配装词缀与部位不兼容', 'Build affix is incompatible with its item type');
      const target = { ...identity, slot, sourcePath: path, name: nameOf(unique ?? catalog.bases?.[`${identity.baseTypeId}:${identity.subTypeId}`], item.id), affixes, kind: unique ? unique.isSetItem ? 'set' : unique.legendaryType === 1 ? 'weaver' : unique.isPrimordialItem ? 'primordial' : 'unique' : idol ? 'idol' : 'equipment' };
      targets.push(target);
      if (unique) {
        if (!uniqueRows.has(identity.uniqueId)) {
          const row = createFilterRow('unique', { id: `unique-${identity.uniqueId}`, name: target.name, uniqueIds: [identity.uniqueId], sourcePaths: [path], count: 1, slots: [slot] });
          rows.push(row); uniqueRows.set(identity.uniqueId, row);
        } else { const row = uniqueRows.get(identity.uniqueId); row.count++; row.sourcePaths.push(path); row.slots.push(slot); }
      }
      if (idol && !unique) {
        const specialUnsupported = affixes.some(a => [4, 6, 7].includes(a.specialType) || a.sourceRole === 'corrupted');
        const key = [identity.baseTypeId, identity.subTypeId, ...affixes.map(a => a.id).sort((a, b) => a - b)].join('-');
        if (idolRows.has(key)) { const row = idolRows.get(key); row.count++; row.sourcePaths.push(path); continue; }
        const row = createFilterRow('idol', { id: `idol-${key}`, name: target.name, baseTypeIds: [identity.baseTypeId], subTypeIds: [identity.subTypeId], affixIds: affixes.map(a => a.id), minCount: affixes.length, count: 1, sourcePaths: [path], sourceAffixes: affixes, enabled: !!affixes.length && !specialUnsupported, route: affixes.some(a => a.specialType === 5) ? 'weaver_idol' : 'idol' });
        if (specialUnsupported) { hasUnresolvedTargets = true; row.notes.push(label('特殊神像前身尚未核验，默认不导出此组合。', 'Special idol precursor is unverified; this combination is disabled by default.')); warnings.push(warning('SPECIAL_IDOL', '部分特殊神像需要手动确认获取路线。', 'Some special idols need acquisition-route review.', row.id)); }
        if (row.route === 'weaver_idol') row.notes.push(label('Weaver 神像可有特殊掉落和重铸来源；不是 Weaver’s Will 装备。', 'Weaver idols have special acquisition and reforging routes; they are not Weaver’s Will equipment.'));
        rows.push(row); idolRows.set(key, row); continue;
      }
      const groups = new Map();
      for (const affix of affixes) {
        const unsupported = (unique && (unique.legendaryType === 1 || unique.isSetItem || unique.isCocoonedItem || unique.isPrimordialItem || unique.isPreCorrupted || unique.dropsSpecificLegendaryAffixes)) || [2, 3, 4, 5, 6, 7].includes(affix.specialType) || affix.sourceRole === 'corrupted';
        const purpose = unsupported ? 'target' : unique ? 'donor' : 'crafting';
        const category = classifyAffix(catalog.affixes[affix.id]);
        const minTier = Math.min(affix.tier, 7);
        const key = `${purpose}-${category}-${minTier}-${affix.specialType}`;
        if (!groups.has(key)) groups.set(key, createFilterRow('affix', {
          id: `affix-${slot}-${key}`, name: label(`${SLOT_NAMES[slot] ?? slot} · ${filterLabel(catalog.affixes[affix.id]?.name, 'zh')}`, `${slot} · ${filterLabel(catalog.affixes[affix.id]?.name, 'en')}`),
          slot, purpose, category, baseTypeIds: [identity.baseTypeId], targetUniqueId: identity.uniqueId ?? null, minTier, priority: purpose === 'donor' ? 'core' : 'crafting', requireExalted: purpose === 'donor', excludeCorrupted: purpose !== 'target', sourcePaths: [], sourceAffixes: [], enabled: !unsupported, route: unsupported ? target.kind : affix.specialType === 1 ? 'experimental' : purpose,
        }));
        const row = groups.get(key); row.affixIds.push(affix.id); row.sourcePaths.push(affix.sourcePath); row.sourceAffixes.push(affix);
        if (unsupported) { if (!unique) hasUnresolvedTargets = true; row.notes.push(label('此属性是特殊养成结果，未自动生成普通掉落或合成路线。', 'This is a special progression outcome; a normal drop or crafting route was not inferred.')); }
        if (affix.tier > 7) row.notes.push(label('目标 T8：先保留对应 T7 前身，再通过特殊制作完成。', 'T8 target: retain its T7 precursor for special crafting.'));
        if (affix.sourceRole === 'sealed') row.notes.push(label('目标包含封印词缀；此规则保留可制作候选，不保证掉落已封印。', 'The target includes a sealed affix; this retains candidates without requiring a sealed drop.'));
        if (affix.specialType === 1) row.notes.push(label('实验词缀不能按普通碎片拆解。', 'Experimental affixes do not provide ordinary shards.'));
      }
      for (const row of groups.values()) row.name = label(`${SLOT_NAMES[slot] ?? slot} · ${row.affixIds.map(id => filterLabel(catalog.affixes[id].name, 'zh')).join('、')}`, `${slot} · ${row.affixIds.map(id => filterLabel(catalog.affixes[id].name, 'en')).join(', ')}`);
      rows.push(...groups.values());
    } catch (error) {
      hasUnresolvedTargets = true;
      warnings.push(warning('UNRESOLVED_TARGET', `${path}：${error.message}`, `${path}: ${error.message}`));
    }
  }
  // Shard supply is a separate use, independent of where the finished build wears the affix.
  const shardTargets = new Map();
  for (const target of targets) for (const affix of target.affixes) {
    const definition = catalog.affixes[affix.id];
    if (!definition.hasShard) continue;
    if (!shardTargets.has(affix.id)) {
      const baseTypeIds = definition.canRollOn.filter(id => GEAR_TYPES.includes(id));
      const rare = baseTypeIds.some(type => (definition.effectiveWeightByType?.[type] ?? definition.weighting) > 0 && (definition.effectiveWeightByType?.[type] ?? definition.weighting) <= DEFAULT_OPTIONS.rareAffixWeightThreshold);
      shardTargets.set(affix.id, createFilterRow('affix', { id: `shatter-${affix.id}`, name: label(`碎片来源 · ${filterLabel(definition.name)}`, `Shard source · ${filterLabel(definition.name, 'en')}`), purpose: 'shatter', category: classifyAffix(definition), affixIds: [affix.id], baseTypeIds, minTier: 1, priority: 'valuable', enabled: rare, sourcePaths: [], notes: [label('可拆解词缀；稀有词缀默认启用，其余可按碎片库存开启。', 'Shard-capable affix; rare targets are enabled by default. Enable others according to your shard supply.')] }));
    }
    shardTargets.get(affix.id).sourcePaths.push(affix.sourcePath);
  }
  rows.push(...shardTargets.values());
  if (rows.some(r => !r.enabled && r.purpose !== 'shatter')) warnings.push(warning('SPECIAL_ROUTES', '部分养成或特殊制作目标默认关闭；开启前请检查用途和获取路线。', 'Some special progression targets are disabled; review their purpose and route before enabling them.'));
  warnings.push(warning('CATEGORIES_SUGGESTED', '伤害／生存／功能仅按词缀描述初步归类，可自行调整；没有计算完整角色收益。', 'Damage/survival/utility categories are suggestions from affix descriptions, not a full character calculation.'));
  return {
    build: { id: build.id, sourceUrl: build.sourceUrl, dataVersion: build.dataVersion, classId: Number(build.data.bio.characterClass), masteryId: Number(build.data.bio.chosenMastery), level: Number(build.data.bio.level) },
    rows, targets, warnings, hasUnresolvedTargets,
    summary: { equipmentCount: Object.values(build.data.equipment).filter(Boolean).length, idolCount: build.data.idols.filter(Boolean).length, uniqueCount: uniqueRows.size, affixCount: new Set(targets.flatMap(t => t.affixes.map(a => a.id))).size },
  };
}
export function createFilterDraft(build) {
  const analysis = analyzeFilterBuild(build);
  return { schemaVersion: 1, name: `Build ${analysis.build.id ?? ''}`.trim(), language: 'zh', build: analysis.build, analysis, rows: analysis.rows, options: { ...DEFAULT_OPTIONS }, styles: structuredClone(DEFAULT_STYLES) };
}

function validateStyle(style, id) {
  if (!style || typeof style.emphasized !== 'boolean') fail('INVALID_FILTER_STYLE', '无效强调样式', 'Invalid emphasis style', id);
  return { color: integer(style.color, 0, 17, 'color', id), emphasized: style.emphasized };
}
function compileRow(row, warnings) {
  if (!row || typeof row.enabled !== 'boolean') fail('INVALID_FILTER_ROW', '无效规则', 'Invalid row');
  if (!row.enabled) return null;
  if (!FILTER_PRIORITIES.includes(row.priority)) fail('INVALID_FILTER_PRIORITY', '无效优先级', 'Invalid priority', row.id);
  const conditions = [];
  if (row.kind === 'unique') {
    if (row.purpose !== 'target') fail('INVALID_FILTER_PURPOSE', '独特物品请使用目标用途', 'Unique rows require target purpose', row.id);
    conditions.push({ type: 'unique', uniqueIds: ids(row.uniqueIds, catalog.uniques, 'uniqueIds', row.id) });
  } else {
    if (!['affix', 'idol'].includes(row.kind) || !['target', 'crafting', 'donor', 'shatter', 'idol'].includes(row.purpose)) fail('INVALID_FILTER_PURPOSE', '无效用途', 'Invalid purpose', row.id);
    const affixIds = ids(row.affixIds, catalog.affixes, 'affixIds', row.id);
    let baseTypeIds = ids(row.baseTypeIds ?? [], itemCatalog.bases, 'baseTypeIds', row.id, true);
    const subTypeIds = ids(row.subTypeIds ?? [], null, 'subTypeIds', row.id, true);
    if (!baseTypeIds.length) baseTypeIds = [...new Set(affixIds.flatMap(id => catalog.affixes[id].canRollOn))].filter(id => GEAR_TYPES.includes(id));
    if (!baseTypeIds.length || baseTypeIds.some(id => !GEAR_TYPES.includes(id))) fail('INVALID_FILTER_TYPE', '请选择可过滤的装备类型', 'Select filterable equipment types', row.id);
    if (subTypeIds.length && (baseTypeIds.length !== 1 || subTypeIds.some(id => !own(itemCatalog.bases[baseTypeIds[0]].subtypes, id)))) fail('INVALID_FILTER_SUBTYPE', '具体底材必须属于同一种装备类型', 'Specific bases must belong to one equipment type', row.id);
    const idolOnly = row.kind === 'idol' || row.purpose === 'idol' || baseTypeIds.every(id => id >= 25 && id <= 33);
    const minCount = integer(row.minCount, 1, getFilterRowMaxCount(affixIds, idolOnly), 'minCount', row.id);
    const minTier = integer(row.minTier, 1, 8, 'minTier', row.id);
    const minTotalTier = integer(row.minTotalTier ?? 0, 0, 28, 'minTotalTier', row.id);
    for (const id of affixIds) if (!baseTypeIds.some(type => catalog.affixes[id].canRollOn.includes(type))) fail('INCOMPATIBLE_FILTER_AFFIX', '词缀与所选装备类型不兼容', 'Affix is incompatible with the selected types', row.id);
    if (!baseTypeIds.some(type => {
      const eligible = affixIds.filter(id => catalog.affixes[id].canRollOn.includes(type) && catalog.affixes[id].tierCount >= minTier);
      const idolType = type >= 25 && type <= 33;
      // IsValidAffix (1.5.2.1 RVA 0x11c2f60) limits isIdol generation to 1 of each type.
      // Enchanted/corrupted extra-affix routes are rejected separately, not modeled here.
      const maximumTotal = idolType
        ? [0, 1].reduce((sum, affixType) => sum + Math.max(0, ...eligible.filter(id => catalog.affixes[id].type === affixType).map(id => catalog.affixes[id].tierCount)), 0)
        : eligible.reduce((sum, id) => sum + catalog.affixes[id].tierCount, 0);
      return getFilterRowMaxCount(eligible, idolType) >= minCount && maximumTotal >= minTotalTier;
    })) fail('IMPOSSIBLE_FILTER_MATCH', '此层级／数量与装备类型组合无法匹配', 'This tier/count/type combination cannot match', row.id);
    if (row.kind === 'idol' || row.purpose === 'idol') {
      if (baseTypeIds.some(id => id < 25 || id > 33) || !['idol', 'target'].includes(row.purpose)) fail('INVALID_IDOL_FILTER', '神像需使用神像用途和神像类型', 'Idols require idol purpose and idol types', row.id);
      if (affixIds.some(id => [4, 6, 7].includes(catalog.affixes[id].specialAffixType))) fail('UNSUPPORTED_IDOL_ROUTE', '附魔或腐化神像前身尚未验证，请保留普通目标词缀后重试', 'Enchanted/corrupted idol precursors are unverified; select the ordinary target affixes', row.id);
    }
    if (row.purpose === 'donor' || row.purpose === 'crafting') {
      if (baseTypeIds.some(id => id >= 25 && id <= 33) || affixIds.some(id => ![0, 1].includes(catalog.affixes[id].specialAffixType))) fail('UNSUPPORTED_CRAFTING_ROUTE', '此类别不能使用普通装备加工／传奇材料路线', 'This category cannot use ordinary equipment crafting or legendary donation', row.id);
      if (row.purpose === 'donor' && baseTypeIds.includes(41)) fail('UNSUPPORTED_DONOR_TYPE', '祭坛不是普通传奇合成材料', 'Altars are not ordinary legendary donors', row.id);
      const origin = catalog.uniques[row.targetUniqueId];
      if (row.purpose === 'donor' && origin && (origin.legendaryType === 1 || origin.isSetItem || origin.isPrimordialItem || origin.isCocoonedItem || origin.isPreCorrupted || origin.dropsSpecificLegendaryAffixes)) fail('UNSUPPORTED_DONOR_ROUTE', '原目标是特殊独特物品，尚不能自动推断普通传奇合成路线', 'The original target is a special unique; ordinary legendary donation is not verified', row.id);
      conditions.push({ type: 'rarity', rarities: row.purpose === 'donor' || row.requireExalted ? ['EXALTED'] : ORDINARY_RARITIES });
      conditions.push({ type: 'corruption', value: 'OnlyUncorrupted' });
      if (row.purpose === 'donor') warnings.push(warning('DONOR_CANDIDATE', '词缀条件也会计算封印词缀；传奇材料仍需确认目标词缀未封印、共四条未封印词缀及实际配方资格。', 'Affix conditions also count sealed affixes. Confirm the target affix is unsealed, four unsealed affixes exist, and the recipe accepts the item.', row.id));
    } else if (row.purpose === 'shatter') {
      if (affixIds.some(id => !catalog.affixes[id].hasShard)) fail('AFFIX_HAS_NO_SHARD', '所选词缀没有普通碎片，不能作为拆解需求', 'Selected affixes have no ordinary shards', row.id);
      conditions.push({ type: 'rarity', rarities: ORDINARY_RARITIES });
      if (row.excludeCorrupted) conditions.push({ type: 'corruption', value: 'OnlyUncorrupted' });
    } else {
      if (row.purpose === 'target' && row.targetUniqueId != null) conditions.push({ type: 'unique', uniqueIds: ids([row.targetUniqueId], catalog.uniques, 'targetUniqueId', row.id) });
      if (row.requireExalted) conditions.push({ type: 'rarity', rarities: ['EXALTED'] });
      if (row.excludeCorrupted) conditions.push({ type: 'corruption', value: 'OnlyUncorrupted' });
    }
    conditions.push({ type: 'subtype', baseTypeIds, subTypeIds });
    conditions.push({ type: 'affix', affixIds, minTier, minCount, minTotalTier });
  }
  return { id: row.id, sourceRowId: row.id, name: row.name, priority: row.priority, type: 'SHOW', conditions };
}

const escapeXml = value => {
  const text = String(value ?? '');
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/u.test(text) || (text.isWellFormed && !text.isWellFormed())) fail('INVALID_XML_TEXT', '名称含有无效 XML 字符', 'A name contains invalid XML characters');
  return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
};
function conditionXml(c) {
  const wrap = (type, body) => `        <Condition i:type="${type}">${body}</Condition>`;
  if (c.type === 'unique') return wrap('UniqueModifiersCondition', c.uniqueIds.map(id => `<Uniques><UniqueId>${id}</UniqueId><Rolls /></Uniques>`).join(''));
  if (c.type === 'subtype') return wrap('SubTypeCondition', `<type>${c.baseTypeIds.map(id => `<EquipmentType>${EQUIPMENT_TYPES[id]}</EquipmentType>`).join('')}</type><subTypes>${c.subTypeIds.map(id => `<int>${id}</int>`).join('')}</subTypes>`);
  if (c.type === 'rarity') return wrap('RarityCondition', `<rarity>${c.rarities.join(' ')}</rarity>`);
  if (c.type === 'corruption') return wrap('CorruptionCondition', `<Corruption>${c.value}</Corruption>`);
  if (c.type === 'affix') return wrap('AffixCondition', `<affixes>${c.affixIds.map(id => `<int>${id}</int>`).join('')}</affixes><comparsion>MORE_OR_EQUAL</comparsion><comparsionValue>${c.minTier}</comparsionValue><minOnTheSameItem>${c.minCount}</minOnTheSameItem><combinedComparsion>${c.minTotalTier ? 'MORE_OR_EQUAL' : 'ANY'}</combinedComparsion><combinedComparsionValue>${c.minTotalTier || 1}</combinedComparsionValue><advanced>true</advanced>`);
  fail('UNKNOWN_FILTER_CONDITION', '无法序列化规则条件', 'Cannot serialize filter condition');
}
function serialize(rules, draft) {
  const body = [...rules].reverse().map(rule => `    <Rule>\n      <type>${rule.type}</type>\n      <conditions>\n${rule.conditions.map(conditionXml).join('\n')}\n      </conditions>\n      <recolor>${rule.type === 'SHOW'}</recolor>\n      <color>${rule.style.color}</color>\n      <isEnabled>true</isEnabled>\n      <levelDependent_deprecated>false</levelDependent_deprecated>\n      <minLvl_deprecated>0</minLvl_deprecated>\n      <maxLvl_deprecated>0</maxLvl_deprecated>\n      <emphasized>${rule.style.emphasized}</emphasized>\n      <nameOverride>${escapeXml(filterLabel(rule.name, draft.language))}</nameOverride>\n      <SoundId>0</SoundId>\n      <MapIconId>0</MapIconId>\n      <BeamOverride>false</BeamOverride>\n      <BeamSizeOverride>NONE</BeamSizeOverride>\n      <BeamColorOverride>0</BeamColorOverride>\n      <Order>${rule.order}</Order>\n    </Rule>`).join('\n');
  return `<ItemFilter xmlns:i="http://www.w3.org/2001/XMLSchema-instance">\n  <name>${escapeXml(draft.name)}</name>\n  <filterIcon>0</filterIcon>\n  <filterIconColor>0</filterIconColor>\n  <description>${escapeXml(draft.language === 'en' ? 'Build targets and selected crafting candidates. Review special routes in game.' : '配装目标与选定制作候选；特殊获取路线请在游戏内确认。')}</description>\n  <lastModifiedInVersion>${itemCatalog.gameVersion}</lastModifiedInVersion>\n  <lootFilterVersion>${FILTER_VERSION}</lootFilterVersion>\n  <rules>\n${body}\n  </rules>\n</ItemFilter>\n`;
}

/** Result rules are in UI priority order; only XML storage is reversed. */
export function generateFilter(draft) {
  if (!draft || !Array.isArray(draft.rows) || typeof draft.name !== 'string' || !draft.name.trim() || draft.name.length > 200 || !['zh', 'en'].includes(draft.language)) fail('INVALID_FILTER_DRAFT', '请填写过滤器名称并选择语言', 'Enter a filter name and language');
  const warnings = [...(draft.analysis?.warnings ?? [])], options = { ...DEFAULT_OPTIONS, ...draft.options };
  for (const key of ['showAllUniques', 'showRareUniques', 'showSets', 'showRareAffixes', 'showGoodExalted', 'hideUnmatched']) if (typeof options[key] !== 'boolean') fail('INVALID_FILTER_OPTION', '无效全局选项', 'Invalid global option');
  const styles = Object.fromEntries(FILTER_PRIORITIES.map(id => [id, validateStyle(draft.styles?.[id] ?? DEFAULT_STYLES[id], id)]));
  const rowIds = new Set();
  for (const row of draft.rows) { if (typeof row.id !== 'string' || !row.id || rowIds.has(row.id)) fail('DUPLICATE_FILTER_ROW', '规则编号缺失或重复', 'Missing or duplicate row ID', row.id); rowIds.add(row.id); }
  const rules = draft.rows.map(row => compileRow(row, warnings)).filter(Boolean);
  const add = (id, name, priority, conditions) => { if (conditions.length) rules.push({ id, name, priority, type: 'SHOW', conditions }); };
  if (options.showRareUniques) {
    const threshold = number(options.rareUniqueRerollThreshold, 0, 1, 'rareUniqueRerollThreshold');
    const uniqueIds = Object.entries(catalog.uniques).filter(([, u]) => !u.isSetItem && !u.hideFromPlayers && u.canDropRandomly && u.rerollChance >= threshold).map(([id]) => Number(id));
    if (uniqueIds.length) add('extra-rare-uniques', label('额外：稀有暗金', 'Extra: rare uniques'), 'valuable', [{ type: 'unique', uniqueIds }]);
    warnings.push(warning('RELATIVE_UNIQUE_RARITY', '稀有暗金门槛只比较随机池 rerollChance，不代表 Boss 掉率或市场价格。', 'Rare-unique selection compares random-pool rerollChance, not boss drop rates or market prices.'));
  }
  if (options.showRareAffixes) {
    const threshold = number(options.rareAffixWeightThreshold, 0, 100, 'rareAffixWeightThreshold');
    const minTier = integer(options.rareAffixMinTier, 1, 7, 'rareAffixMinTier');
    const buildAffixIds = new Set((draft.analysis?.targets ?? []).flatMap(target => target.affixes.map(a => a.id)));
    for (const baseTypeId of GEAR_TYPES) {
      const affixIds = Object.entries(catalog.affixes).filter(([id, a]) => !buildAffixIds.has(Number(id)) && a.hasShard && a.tierCount >= minTier && a.canRollOn.includes(baseTypeId) && (a.effectiveWeightByType?.[baseTypeId] ?? a.weighting) > 0 && (a.effectiveWeightByType?.[baseTypeId] ?? a.weighting) <= threshold).map(([id]) => Number(id));
      if (affixIds.length) add(`extra-rare-affixes-${baseTypeId}`, label(`额外：稀有碎片 · ${filterLabel(catalog.types?.[baseTypeId]?.name)}`, `Extra: rare shards · ${filterLabel(catalog.types?.[baseTypeId]?.name, 'en')}`), 'valuable', [{ type: 'rarity', rarities: ORDINARY_RARITIES }, { type: 'subtype', baseTypeIds: [baseTypeId], subTypeIds: [] }, { type: 'affix', affixIds, minTier, minCount: 1, minTotalTier: 0 }]);
    }
  }
  if (options.showGoodExalted) {
    const minTier = integer(options.goodExaltedMinTier, 6, 8, 'goodExaltedMinTier');
    const affixIds = Object.entries(catalog.affixes).filter(([, a]) => a.tierCount >= minTier && [0, 1].includes(a.specialAffixType)).map(([id]) => Number(id));
    if (affixIds.length) add('extra-exalted', label('额外：高阶崇高装备', 'Extra: high-tier exalted'), 'valuable', [{ type: 'rarity', rarities: ['EXALTED'] }, { type: 'affix', affixIds, minTier, minCount: 1, minTotalTier: 0 }]);
  }
  if (options.showAllUniques) add('extra-all-uniques', label('额外：所有暗金与传奇', 'Extra: all uniques and legendaries'), 'global', [{ type: 'rarity', rarities: ['UNIQUE', 'LEGENDARY'] }]);
  if (options.showSets) add('extra-sets', label('额外：所有套装', 'Extra: all sets'), 'global', [{ type: 'rarity', rarities: ['SET'] }]);
  rules.sort((a, b) => FILTER_PRIORITIES.indexOf(a.priority) - FILTER_PRIORITIES.indexOf(b.priority));
  if (options.hideUnmatched) {
    if (draft.analysis?.hasUnresolvedTargets) fail('UNRESOLVED_HIDE_TARGETS', '配装有未解析的特殊目标，不能启用兜底隐藏', 'Unresolved special targets prevent hiding unmatched items');
    warnings.push(warning('HIDE_UNMATCHED', '未命中保留规则的装备、神像和祭坛会被隐藏；符文、雕文、钥匙等其他资源不在隐藏范围。', 'Unmatched equipment, idols and altars will be hidden. Runes, glyphs, keys and other resources are outside this hide scope.'));
    rules.push({ id: 'hide-unmatched-equipment', name: label('隐藏其他装备与神像', 'Hide other equipment and idols'), priority: 'global', type: 'HIDE', conditions: [{ type: 'subtype', baseTypeIds: GEAR_TYPES, subTypeIds: [] }] });
  }
  if (!rules.length) fail('EMPTY_FILTER', '没有启用的有效规则', 'No valid enabled rules');
  if (rules.length > MAX_FILTER_RULES) fail('TOO_MANY_FILTER_RULES', `规则超过 ${MAX_FILTER_RULES} 条`, `More than ${MAX_FILTER_RULES} rules`);
  rules.forEach((rule, order) => { rule.order = order; rule.style = { ...styles[rule.priority] }; });
  return { xml: serialize(rules, draft), rules, warnings };
}

/** Small semantic matcher for generated conditions, used for previews and regression tests. */
export function matchFilterRule(rule, item) {
  return rule.conditions.every(c => {
    if (c.type === 'unique') return ['UNIQUE', 'SET', 'LEGENDARY'].includes(item.rarity) && c.uniqueIds.includes(item.uniqueId);
    if (c.type === 'subtype') return c.baseTypeIds.includes(item.baseTypeId) && (!c.subTypeIds.length || c.subTypeIds.includes(item.subTypeId));
    if (c.type === 'rarity') return c.rarities.includes(item.rarity);
    if (c.type === 'corruption') return c.value === 'OnlyUncorrupted' ? item.corrupted === false : item.corrupted === true;
    if (c.type === 'affix') { const found = (item.affixes ?? []).filter(a => c.affixIds.includes(a.affixId ?? a.id) && a.tier >= c.minTier); return found.length >= c.minCount && found.reduce((sum, a) => sum + a.tier, 0) >= c.minTotalTier; }
    return false;
  });
}
export function previewFilterMatch(rules, item) { const rule = rules.find(r => matchFilterRule(r, item)); return { outcome: rule?.type ?? 'SHOW', rule: rule ?? null }; }
