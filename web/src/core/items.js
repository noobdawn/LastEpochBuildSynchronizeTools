import catalog from './game-item-data.json' with { type: 'json' };
import LZString from 'lz-string';
import { cloneSaveData } from './save.js';

// Independently implemented from ItemData.RebuildID in game build 8dfd6929…:
// version 6, RVA 0x1205e80. See tools/extract-game-data.py and tests/items.test.js.
export const ITEM_FORMAT_VERSION = 6;
export const EQUIPMENT_CONTAINERS = Object.freeze({
  head: 2, chest: 3, weapon1: 4, weapon2: 5, hands: 6, waist: 7,
  feet: 8, ring2: 9, ring1: 10, amulet: 11, relic: 12, idol_altar: 123,
});
export const BLESSING_CONTAINERS = Object.freeze([33, 34, 35, 36, 37, 38, 39, 43, 44, 45]);
const own = (object, key) => object != null && Object.hasOwn(object, key);
const UNIQUE_RARITIES = new Set([7, 8, 9]);

export class UnsupportedItemError extends Error {
  constructor(code, message, details = {}) {
    super(message); this.name = 'UnsupportedItemError'; this.code = code; this.details = details;
  }
}
function fail(code, message, details) { throw new UnsupportedItemError(code, message, details); }
function int(value, min, max, field) {
  const n = Number(value);
  if (value == null || value === '' || typeof value === 'boolean' || !Number.isSafeInteger(n) || n < min || n > max) {
    fail('INVALID_ITEM', `无效物品字段 / Invalid item field: ${field}`, { field });
  }
  return n;
}
const byte = (value, field) => int(value, 0, 255, field);
function bytes(value, count, field) {
  if (!Array.isArray(value) || value.length !== count) fail('INVALID_ITEM', `Invalid byte count: ${field}`);
  return value.map((v, i) => byte(v, `${field}[${i}]`));
}
function roll(value, field) {
  if (value == null) return 128; // LET's omitted roll is the midpoint, 127.5 / 255.
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 255 || typeof value === 'boolean') fail('INVALID_ROLL', `Invalid item roll: ${field}`);
  return Math.round(n);
}

/** Parse only verified equipment layouts. Unknown versions/types remain opaque. */
export function decodeSavedItem(savedItem) {
  const source = Array.isArray(savedItem) ? savedItem : savedItem?.data;
  if (!Array.isArray(source)) return { supported: false, reason: 'NO_BYTES', raw: savedItem };
  let data;
  try { data = source.map((v, i) => byte(v, `data[${i}]`)); }
  catch { return { supported: false, reason: 'INVALID_BYTES', raw: savedItem }; }
  if (data[0] !== 6) return { supported: false, reason: 'UNKNOWN_VERSION', raw: savedItem };
  if (data.length < 14 || !own(catalog.bases, data[5])) return { supported: false, reason: 'UNSUPPORTED_TYPE', raw: savedItem };
  const rarity = data[7] & 63;
  if (rarity > 9 || rarity === 5 || rarity === 6) return { supported: false, reason: 'UNSUPPORTED_RARITY', raw: savedItem };
  const unique = UNIQUE_RARITIES.has(rarity);
  if (unique && data.length < 23) return { supported: false, reason: 'TRUNCATED', raw: savedItem };
  const count = rarity === 9 ? data[22] & 7 : unique ? data[22] >> 5 : data[13] & 63;
  const start = unique ? 23 : 14;
  const giftCount = data[7] >> 6;
  if (data.length !== start + 3 * count + 8 * giftCount) return { supported: false, reason: 'UNRECOGNIZED_LENGTH', raw: savedItem };
  const result = {
    supported: true, version: 6,
    individualId: ((data[1] & 127) * 0x1000000 + data[2] * 0x10000 + data[3] * 256 + data[4]),
    duplicated: Boolean(data[1] & 128),
    baseTypeId: data[5], subTypeId: data[6], rarity, flags: data[8],
    implicitRolls: data.slice(9, 12), affixes: [],
    giftingTargets: Array.from({ length: giftCount }, (_, i) => data.slice(start + count * 3 + i * 8, start + count * 3 + (i + 1) * 8)),
  };
  if (unique) {
    result.uniqueId = data[12] * 256 + data[13];
    result.uniqueRolls = data.slice(14, 22);
    result.extraFlags = rarity === 9 ? data[22] & 248 : data[22] & 31;
  } else {
    result.potentialByte = data[12];
    result.sealedFlags = data[13] & 192;
  }
  for (let i = 0; i < count; i++) {
    const offset = start + i * 3;
    result.affixes.push({ affixId: (data[offset] & 15) * 256 + data[offset + 1], tier: (data[offset] >> 4) + 1, roll: data[offset + 2] });
  }
  return result;
}

/** Rebuild verified v6 equipment from semantic fields, never from an opaque tail. */
export function encodeItemData(item) {
  const baseTypeId = int(item.baseTypeId, 0, 100, 'baseTypeId');
  const subTypeId = byte(item.subTypeId, 'subTypeId');
  const rarity = int(item.rarity, 0, 9, 'rarity');
  if (!own(catalog.bases, baseTypeId) || rarity === 5 || rarity === 6) fail('UNSUPPORTED_ITEM_TYPE', 'Unsupported equipment type or rarity.');
  const id = int(item.individualId, 16, 0x7fffffff, 'individualId');
  const affixes = item.affixes ?? [];
  if (!Array.isArray(affixes) || affixes.length > 7) fail('INVALID_AFFIX_COUNT', 'At most seven affixes are supported.');
  const gifts = item.giftingTargets ?? [];
  if (!Array.isArray(gifts) || gifts.length > 3) fail('INVALID_GIFT_COUNT', 'Invalid gifting targets.');
  const result = [6, Math.floor(id / 0x1000000) | (item.duplicated ? 128 : 0), (id >>> 16) & 255, (id >>> 8) & 255, id & 255,
    baseTypeId, subTypeId, rarity | gifts.length << 6, byte(item.flags ?? 0, 'flags'), ...bytes(item.implicitRolls, 3, 'implicitRolls')];
  if (UNIQUE_RARITIES.has(rarity)) {
    const uniqueId = int(item.uniqueId, 0, 65535, 'uniqueId');
    const extra = byte(item.extraFlags ?? 0, 'extraFlags');
    if ((rarity === 9 && (extra & 7)) || (rarity !== 9 && extra > 31)) fail('INVALID_ITEM_FLAGS', 'Invalid unique item flags.');
    result.push(uniqueId >> 8, uniqueId & 255, ...bytes(item.uniqueRolls, 8, 'uniqueRolls'), rarity === 9 ? extra | affixes.length : extra | affixes.length << 5);
  } else {
    const sealed = byte(item.sealedFlags ?? 0, 'sealedFlags');
    if (sealed & 63) fail('INVALID_ITEM_FLAGS', 'Invalid sealed affix flags.');
    result.push(byte(item.potentialByte ?? 0, 'potentialByte'), affixes.length | sealed);
  }
  for (const affix of affixes) {
    const affixId = int(affix.affixId, 0, 4095, 'affixId');
    const tier = int(affix.tier, 1, 16, 'tier');
    result.push((tier - 1) << 4 | affixId >> 8, affixId & 255, byte(affix.roll, 'affix.roll'));
  }
  for (const gift of gifts) result.push(...bytes(gift, 8, 'giftingTarget'));
  return result;
}

function unpackPlannerId(id, expectedPrefix) {
  if (typeof id !== 'string' || id.length < 3 || id.length > 80 || !/^[IUA][A-Za-z0-9+/=]+$/.test(id) || (expectedPrefix && id[0] !== expectedPrefix)) {
    fail('UNKNOWN_PLANNER_ITEM', 'Invalid LastEpochTools item identifier.', { id });
  }
  const value = LZString.decompressFromBase64(id.slice(1));
  if (typeof value !== 'string' || !/^\d{1,12}$/.test(value)) fail('UNKNOWN_PLANNER_ITEM', 'Unsupported LastEpochTools item identifier.', { id });
  return value;
}

/** LET prefix + standard LZ-string ID protocol, checked against all 1,966 public mappings. */
export function resolvePlannerItemId(id) {
  const decoded = unpackPlannerId(id);
  let value;
  if (id[0] === 'I' && /^1\d{6,8}000$/.test(decoded)) {
    value = { baseTypeId: Number(decoded.slice(1, 4)), subTypeId: Number(decoded.slice(4, -3)) };
  } else if (id[0] === 'U' && /^\d{6,8}$/.test(decoded)) {
    const uniqueId = Number(decoded.slice(3));
    const unique = catalog.uniques[uniqueId];
    if (!unique) fail('UNKNOWN_GAME_ITEM', 'This unique item is absent from the supported game build.', { id, uniqueId });
    value = { baseTypeId: unique.baseType, subTypeId: Number(decoded.slice(0, 3)), uniqueId };
  } else fail('UNKNOWN_PLANNER_ITEM', 'Unsupported LastEpochTools item identifier.', { id });
  const base = catalog.bases[value.baseTypeId];
  if (!base || !own(base.subtypes, value.subTypeId)) fail('UNKNOWN_GAME_ITEM', 'This item base is absent from the supported game build.', { id });
  if (own(value, 'uniqueId')) {
    const unique = catalog.uniques[value.uniqueId];
    if (!unique || unique.baseType !== value.baseTypeId || !unique.subTypes.includes(value.subTypeId)) fail('ITEM_MAPPING_MISMATCH', 'Unique item mapping does not match current game data.', { id });
  }
  return { ...value };
}

function plannerAffix(affix) {
  if (!affix) fail('UNKNOWN_PLANNER_AFFIX', 'Missing affix record.');
  const affixId = Number(unpackPlannerId(affix.id, 'A'));
  const definition = catalog.affixes[affixId];
  if (!definition) fail('UNKNOWN_GAME_AFFIX', `Affix ${affixId} is absent from this game build.`);
  const tier = int(affix.tier ?? 1, 1, Math.min(16, definition.tierCount), 'affix.tier');
  return { affixId, tier, roll: roll(affix.r, 'affix.r') };
}

function nextIndividualId(usedIds) {
  let id;
  do {
    const value = new Uint32Array(1);
    globalThis.crypto.getRandomValues(value);
    id = 16 + value[0] % (0x7fffffff - 15);
  } while (usedIds?.has(id));
  usedIds?.add(id);
  return id;
}

/** Convert an observed LET item record to the current game's saved item wrapper. */
export function encodePlannerItem(item, { containerID, inventoryPosition = { x: 0, y: 0 }, usedIds, individualId } = {}) {
  const identity = resolvePlannerItemId(item?.id);
  const allowedFields = new Set(['id', 'affixes', 'ir', 'ur', 'x', 'y', 'lp', 'legendaryPotential', 'ww', 'wt', 'sealedAffix', 'corruptedAffix', 'corrupted', 'ruined']);
  for (const key of Object.keys(item)) if (!allowedFields.has(key)) fail('UNSUPPORTED_ITEM_FEATURE', `尚未验证物品字段 / Unverified item field: ${key}`);
  for (const [key, count] of [['ir', 3], ['ur', 8]]) {
    if (item[key] != null && (!Array.isArray(item[key]) || item[key].length > count)) fail('INVALID_ROLLS', `Invalid ${key} array.`);
  }
  // These carry additional semantics that cannot be discarded safely.
  const isUnique = own(identity, 'uniqueId');
  const corrupted = Boolean(item.corrupted || item.corruptedAffix || catalog.bases[identity.baseTypeId].subtypes[identity.subTypeId].corrupted);
  if (item.ruined || (isUnique && (corrupted || item.sealedAffix))) fail('UNSUPPORTED_ITEM_FEATURE', '毁坏物品及特殊封印暗金尚未验证 / Ruined items and specially sealed uniques require further verification.');
  if (!Array.isArray(item.affixes ?? [])) fail('INVALID_AFFIXES', 'Affixes must be an array.');
  const regularAffixes = (item.affixes ?? []).map(plannerAffix);
  if (regularAffixes.length > 4) fail('UNSUPPORTED_ITEM_FEATURE', 'More than four regular affixes are not supported.');
  const affixes = [item.sealedAffix && plannerAffix(item.sealedAffix), item.corruptedAffix && plannerAffix(item.corruptedAffix), ...regularAffixes].filter(Boolean);
  if (new Set(affixes.map(a => a.affixId)).size !== affixes.length) fail('DUPLICATE_AFFIX', 'Duplicate item affixes are not supported.');
  const descriptor = {
    ...identity, individualId: individualId ?? nextIndividualId(usedIds),
    rarity: Math.min(4, regularAffixes.length), flags: 128 | (corrupted ? 16 : 0), // Locally generated, always untradeable.
    implicitRolls: Array.from({ length: 3 }, (_, i) => roll(item.ir?.[i], `ir[${i}]`)),
    affixes, potentialByte: 0, sealedFlags: (item.sealedAffix ? 128 : 0) | (item.corruptedAffix ? 64 : 0),
  };
  if (own(identity, 'uniqueId')) {
    const unique = catalog.uniques[identity.uniqueId];
    if (unique.cocooned || unique.preCorrupted || unique.specificAffixes) fail('UNSUPPORTED_ITEM_FEATURE', 'This unique has additional game-defined item features that need separate validation.');
    descriptor.rarity = affixes.length ? 9 : unique.set ? 8 : 7;
    descriptor.uniqueRolls = Array.from({ length: 8 }, (_, i) => roll(item.ur?.[i], `ur[${i}]`));
    descriptor.extraFlags = 0;
    if (item.lp != null || item.legendaryPotential != null) {
      const lp = int(item.lp ?? item.legendaryPotential, 0, 4, 'legendaryPotential');
      if (affixes.length && lp) fail('INVALID_LEGENDARY_POTENTIAL', 'Applied legendary affixes cannot also retain legendary potential.');
      if ((unique.set || unique.legendaryType === 1) && lp) fail('INVALID_LEGENDARY_POTENTIAL', 'Set and Weaver items cannot have legendary potential.');
      descriptor.extraFlags = lp;
    }
    if (unique.legendaryType === 1) {
      const remaining = int(item.ww ?? 0, 0, 28, 'weaversWill');
      descriptor.extraFlags = affixes.length ? remaining << 3 : remaining;
    } else if (item.ww != null) fail('INVALID_ITEM_FEATURE', 'Only Weaver items can have remaining Weaver’s Will.');
    if (item.wt != null) fail('UNSUPPORTED_ITEM_FEATURE', 'Weaver’s Touch on unique idols requires further verification.');
  } else {
    if (item.lp != null || item.legendaryPotential != null || item.ww != null) fail('INVALID_ITEM_FEATURE', 'This base item cannot use unique potential fields.');
    if (item.wt != null) {
      if (identity.baseTypeId < 25 || identity.baseTypeId > 33) fail('INVALID_ITEM_FEATURE', 'Only idols can have Weaver’s Touch.');
      descriptor.potentialByte = int(item.wt, 0, 14, 'weaversTouch');
    }
  }
  return { itemData: null, data: encodeItemData(descriptor), inventoryPosition: {
    x: int(inventoryPosition.x, 0, 255, 'inventoryPosition.x'), y: int(inventoryPosition.y, 0, 255, 'inventoryPosition.y'),
  }, quantity: 1, containerID: int(containerID, 0, 255, 'containerID'), formatVersion: 2 };
}

function validateEquippedIdolGrid(savedItems) {
  const idols = savedItems.filter(item => Number(item.containerID) === 29);
  if (!idols.length) return;
  const altars = savedItems.filter(item => Number(item.containerID) === 123);
  let grid = catalog.idolGrids.default;
  if (altars.length > 1) fail('INVALID_IDOL_ALTAR', 'The character has multiple equipped idol altars.');
  if (altars.length) {
    const altar = decodeSavedItem(altars[0]);
    if (!altar.supported || altar.baseTypeId !== 41 || !own(catalog.idolGrids, altar.subTypeId)) {
      fail('UNSUPPORTED_IDOL_ALTAR', '无法验证当前祭坛的神像格 / The equipped altar grid is not supported.');
    }
    grid = catalog.idolGrids[altar.subTypeId];
  }
  const occupied = new Set();
  for (const savedItem of idols) {
    const idol = decodeSavedItem(savedItem);
    if (!idol.supported || idol.baseTypeId < 25 || idol.baseTypeId > 33) fail('UNSUPPORTED_IDOL_LAYOUT', 'An equipped idol has an unverified layout.');
    const [width, height] = catalog.bases[idol.baseTypeId].size;
    const x = int(savedItem.inventoryPosition?.x, 0, 4, 'idol.inventoryPosition.x');
    const y = int(savedItem.inventoryPosition?.y, 0, 4, 'idol.inventoryPosition.y');
    if (x + width > 5 || y + height > 5) fail('INVALID_IDOL_POSITION', 'An idol is outside the 5 × 5 game grid.');
    for (let dx = 0; dx < width; dx++) for (let dy = 0; dy < height; dy++) {
      // Serialized matrices are top-first; the saved inventory y axis starts at the bottom.
      if (grid[4 - y - dy][x + dx] === 99) fail('BLOCKED_IDOL_CELL', '神像占用了当前祭坛的禁用格 / An idol occupies a blocked cell in the equipped altar.');
      const key = `${x + dx}:${y + dy}`;
      if (occupied.has(key)) fail('OVERLAPPING_IDOLS', 'Equipped idols overlap.');
      occupied.add(key);
    }
  }
}

export function applyPlannerItems(save, build, options = {}) {
  for (const section of ['equipment', 'idols', 'blessings']) {
    if (options[section] === false) continue;
    if (!own(build, section)) fail('MISSING_PLANNER_SECTION', `缺少已选配装数据 / Missing selected planner section: ${section}`);
    const value = build[section];
    if (section === 'idols' ? !Array.isArray(value) : value == null || typeof value !== 'object' || Array.isArray(value)) {
      fail('INVALID_PLANNER_SECTION', `无效配装数据 / Invalid planner section: ${section}`);
    }
  }
  const data = cloneSaveData(save);
  const changes = [], warnings = [];
  if (!Array.isArray(data.savedItems)) fail('INVALID_SAVE', 'Character save has no savedItems array.');
  const usedIds = new Set(data.savedItems.filter(x => Number(x.data?.[0]) === 6 && x.data.length >= 5)
    .map(x => (Number(x.data[1]) & 127) * 0x1000000 + Number(x.data[2]) * 65536 + Number(x.data[3]) * 256 + Number(x.data[4])));
  const replacements = new Map();
  if (options.equipment !== false) {
    for (const [slot, containerID] of Object.entries(EQUIPMENT_CONTAINERS)) {
      const item = build.equipment?.[slot];
      // Missing slots are intentionally emptied, but missing altar remains unchanged
      // for pre-altar planner payloads; it determines the equipped idol grid.
      if (slot === 'idol_altar' && !own(build.equipment, slot)) continue;
      if (item?.id) {
        const base = resolvePlannerItemId(item.id).baseTypeId;
        const allowed = { head: [0], chest: [1], hands: [4], waist: [2], feet: [3], ring1: [21], ring2: [21], amulet: [20], relic: [22], idol_altar: [41],
          weapon1: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 23, 24], weapon2: [5, 6, 7, 8, 9, 10, 11, 17, 18, 19] };
        if (!allowed[slot].includes(base)) fail('INVALID_EQUIPMENT_SLOT', `The item does not fit slot ${slot}.`);
      }
      replacements.set(containerID, item?.id ? [encodePlannerItem(item, { containerID, usedIds })] : []);
    }
  }
  if (options.idols !== false) {
    if (!Array.isArray(build.idols)) fail('INVALID_IDOLS', 'Planner idols must be an array.');
    const cells = new Set();
    const idols = build.idols.filter(Boolean).map(item => {
      const identity = resolvePlannerItemId(item.id);
      if (identity.baseTypeId < 25 || identity.baseTypeId > 33) fail('INVALID_IDOL', 'The idol grid contains a non-idol.');
      const [width, height] = catalog.bases[identity.baseTypeId].size;
      const x = int(item.x, 1, 5, 'idol.x') - 1;
      const y = 6 - int(item.y, 1, 5, 'idol.y') - height;
      if (x + width > 5 || y < 0 || y + height > 5) fail('INVALID_IDOL_POSITION', 'An idol is outside the 5 × 5 game grid.');
      for (let dx = 0; dx < width; dx++) for (let dy = 0; dy < height; dy++) {
        const key = `${x + dx}:${y + dy}`;
        if (cells.has(key)) fail('OVERLAPPING_IDOLS', 'Planner idols overlap.');
        cells.add(key);
      }
      return encodePlannerItem(item, { containerID: 29, inventoryPosition: { x, y }, usedIds });
    });
    replacements.set(29, idols);
  }
  if (options.blessings !== false) {
    for (let timeline = 1; timeline <= 10; timeline++) {
      const value = build.blessings?.[timeline];
      const item = typeof value === 'string' ? { id: value } : value;
      const containerID = BLESSING_CONTAINERS[timeline - 1];
      if (item?.id && resolvePlannerItemId(item.id).baseTypeId !== 34) fail('INVALID_BLESSING', 'A blessing slot contains a non-blessing.');
      replacements.set(containerID, item?.id ? [encodePlannerItem(item, { containerID, usedIds })] : []);
    }
  }
  if (replacements.size) {
    const oldCount = data.savedItems.filter(item => replacements.has(Number(item.containerID))).length;
    data.savedItems = data.savedItems.filter(item => !replacements.has(Number(item.containerID)));
    const newItems = [...replacements.values()].flat();
    data.savedItems.push(...newItems);
    if (replacements.has(29) || replacements.has(123)) validateEquippedIdolGrid(data.savedItems);
    changes.push({ path: 'savedItems', label: '装备、神像和祝福 / Equipment, idols and blessings', before: oldCount, after: newItems.length });
    warnings.push('新物品的未指定数值使用 LET 默认中间值；锻造潜能为 0。 / Omitted rolls use LET midpoint values; forging potential is 0.');
  }
  return { data, changes, warnings };
}
