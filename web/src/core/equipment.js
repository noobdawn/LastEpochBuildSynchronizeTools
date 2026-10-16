import catalog from './game-item-data.json' with { type: 'json' };
import labels from '../data/equipment-labels.js';
import { cloneSaveData } from './save.js';
import { BLESSING_CONTAINERS, EQUIPMENT_CONTAINERS, decodeSavedItem, UnsupportedItemError } from './items.js';

const text = (zh, en) => ({ zh, en });
const own = (object, key) => object != null && Object.hasOwn(object, key);
const slotNames = {
  head: text('头盔', 'Helmet'), chest: text('胸甲', 'Body armour'), weapon1: text('主手', 'Main hand'),
  weapon2: text('副手', 'Off hand'), hands: text('手套', 'Gloves'), waist: text('腰带', 'Belt'),
  feet: text('鞋子', 'Boots'), ring1: text('戒指 1', 'Ring 1'), ring2: text('戒指 2', 'Ring 2'),
  amulet: text('项链', 'Amulet'), relic: text('遗物', 'Relic'), idol_altar: text('神像祭坛', 'Idol altar'),
};
const slotFor = new Map(Object.entries(EQUIPMENT_CONTAINERS).map(([slot, id]) => [id, slot]));
const ROLL_NOTE = text('数值在自身范围中的位置；不是属性的实际数值。', 'Position within the modifier range; not the absolute stat value.');

function fail(code, zh, en, details = {}) { throw new UnsupportedItemError(code, `${zh} / ${en}`, details); }
function integer(value, min, max, field) {
  if (value == null || typeof value === 'boolean' || (typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') {
    fail('INVALID_EQUIPMENT_VALUE', '请输入合法整数', 'Enter a valid integer', { field });
  }
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) fail('INVALID_EQUIPMENT_VALUE', `数值必须在 ${min}–${max} 之间`, `Value must be between ${min} and ${max}`, { field });
  return n;
}
function saveItems(data) {
  if (!Array.isArray(data?.savedItems)) fail('INVALID_SAVE', '存档没有物品列表', 'Save has no item list');
  return data.savedItems;
}
function location(containerID) {
  const slot = slotFor.get(containerID);
  if (slot) return { group: 'equipment', slot, slotLabel: slotNames[slot] };
  if (containerID === 29) return { group: 'idols', slot: 'idol', slotLabel: text('神像', 'Idol') };
  const timeline = BLESSING_CONTAINERS.indexOf(containerID) + 1;
  if (timeline) return { group: 'blessings', slot: `blessing${timeline}`, slotLabel: text(`祝福 ${timeline}`, `Blessing ${timeline}`) };
  return { group: 'inventory', slot: `container${containerID}`, slotLabel: text('背包或仓库', 'Inventory or stash') };
}

function inspectItem(savedItem, index) {
  const containerID = Number(savedItem?.containerID);
  const descriptor = decodeSavedItem(savedItem);
  const where = location(containerID);
  const baseName = labels.bases?.[`${descriptor.baseTypeId}:${descriptor.subTypeId}`];
  const uniqueName = labels.uniques?.[descriptor.uniqueId];
  const actualName = uniqueName || baseName;
  const fallback = descriptor.supported
    ? text(`${where.slotLabel.zh} · ${descriptor.baseTypeId}:${descriptor.subTypeId}`, `${where.slotLabel.en} · ${descriptor.baseTypeId}:${descriptor.subTypeId}`)
    : text(`未识别物品 ${index + 1}`, `Unrecognized item ${index + 1}`);
  const result = { index, containerID, ...where, name: actualName ? text(actualName, actualName) : fallback,
    readOnly: false, reason: null, descriptor: descriptor.supported ? descriptor : null, fields: [],
    inventoryPosition: savedItem?.inventoryPosition ? { x: Number(savedItem.inventoryPosition.x), y: Number(savedItem.inventoryPosition.y) } : null };
  const lock = (code, zh, en) => ({ ...result, readOnly: true, reason: text(zh, en), reasonCode: code });
  if (!descriptor.supported) return lock(descriptor.reason, '尚未识别此物品格式，保留原数据。', 'This item format is unrecognized; its original data is preserved.');
  if (Number(savedItem.formatVersion) !== 2) return lock('UNSUPPORTED_WRAPPER_VERSION', '尚未验证此外层物品版本。', 'This item wrapper version has not been verified.');
  const base = catalog.bases[descriptor.baseTypeId];
  const subtype = base?.subtypes[descriptor.subTypeId];
  if (!subtype) return lock('UNKNOWN_ITEM_BASE', '当前游戏目录中没有此装备底材。', 'This item base is absent from the current game catalog.');
  const unique = own(descriptor, 'uniqueId') ? catalog.uniques[descriptor.uniqueId] : null;
  if (own(descriptor, 'uniqueId') && (!unique || unique.baseType !== descriptor.baseTypeId || !unique.subTypes.includes(descriptor.subTypeId))) {
    return lock('UNKNOWN_UNIQUE_ITEM', '暗金物品与当前游戏目录不匹配。', 'This unique item does not match the current game catalog.');
  }
  if (descriptor.affixes.some(affix => !catalog.affixes[affix.affixId] || affix.tier > catalog.affixes[affix.affixId].tierCount)) {
    return lock('UNKNOWN_ITEM_AFFIX', '有词缀尚未识别，保留整件物品。', 'An affix is unrecognized; the complete item is preserved.');
  }
  const add = (path, label, value, min, max, byteOffset, mask = 255, shift = 0, delta = 0, type = 'integer') => {
    result.fields.push({ path, label, value, min, max, type, ...(type === 'roll' ? { percentage: value * 100 / 255, note: ROLL_NOTE } : {}), byteOffset, mask, shift, delta });
  };
  for (let i = 0; i < Math.min(3, subtype.implicitCount); i++) {
    add(['implicitRolls', i], text(`固有词缀 ${i + 1} · 数值比例`, `Implicit ${i + 1} · Roll`), descriptor.implicitRolls[i], 0, 255, 9 + i, 255, 0, 0, 'roll');
  }
  for (const i of unique?.rollIds ?? []) {
    if (i < 0 || i > 7) continue;
    add(['uniqueRolls', i], text(`暗金词缀 ${i + 1} · 数值比例`, `Unique modifier ${i + 1} · Roll`), descriptor.uniqueRolls[i], 0, 255, 14 + i, 255, 0, 0, 'roll');
  }
  const affixStart = unique ? 23 : 14;
  descriptor.affixes.forEach((affix, i) => {
    const name = labels.affixes?.[affix.affixId] || `#${affix.affixId}`;
    add(['affixes', i, 'roll'], text(`${name} · 数值比例`, `${name} · Roll`), affix.roll, 0, 255, affixStart + i * 3 + 2, 255, 0, 0, 'roll');
    // The native reader uses T8 to identify a primordial sealed affix. Crossing
    // that boundary would change sealing semantics, so tier changes stay in T1–7.
    if (affix.tier < 8 && catalog.affixes[affix.affixId].tierCount > 1) {
      add(['affixes', i, 'tier'], text(`${name} · 等级`, `${name} · Tier`), affix.tier, 1, Math.min(7, catalog.affixes[affix.affixId].tierCount), affixStart + i * 3, 240, 4, -1);
    }
  });
  const ordinaryState = !(descriptor.flags & 48);
  // Normal equipment's low six bits hold forging potential; upper two bits
  // retain the existing normal/blood/ice forging-potential type. Idol bytes have
  // different semantics, and blessing/altar crafting is not exposed here.
  if (!unique && descriptor.baseTypeId < 25 && ordinaryState && (descriptor.potentialByte >> 6) <= 2) {
    add(['forgingPotential'], text('锻造潜能', 'Forging potential'), descriptor.potentialByte & 63, 0, 63, 12, 63);
  }
  const ordinaryUnique = unique && ordinaryState && !unique.set && !unique.cocooned && !unique.preCorrupted && !unique.specificAffixes;
  if (ordinaryUnique && unique.legendaryType === 0 && descriptor.rarity === 7 && descriptor.baseTypeId < 25 && descriptor.extraFlags <= 4) {
    add(['legendaryPotential'], text('传奇潜能', 'Legendary potential'), descriptor.extraFlags, 0, 4, 22, 31);
  }
  if (ordinaryUnique && unique.legendaryType === 1 && (descriptor.rarity === 7 || descriptor.rarity === 9)) {
    const value = descriptor.rarity === 9 ? descriptor.extraFlags >> 3 : descriptor.extraFlags;
    if (value <= 28 && descriptor.affixes.every(affix => affix.tier <= 7)) {
      add(['weaversWill'], text('剩余织造意志', 'Remaining Weaver’s Will'), value, 0, 28, 22, descriptor.rarity === 9 ? 248 : 31, descriptor.rarity === 9 ? 3 : 0);
    }
  }
  if (!result.fields.length) return lock('NO_VERIFIED_FIELDS', '此物品没有已验证的可编辑数值。', 'This item has no verified editable values.');
  return result;
}

/** Read-only view of equipment, idols, blessings and stored items; indices address savedItems. */
export function getEquipment(saveData) {
  return saveItems(saveData).map((item, index) => {
    const result = inspectItem(item, index);
    result.fields = result.fields.map(({ byteOffset, mask, shift, delta, ...field }) => field);
    return result;
  });
}

/** Atomic edit of existing fields on exactly one item. No item reconstruction or wrapper changes. */
export function applyEquipmentEdit(saveData, index, edits) {
  const items = saveItems(saveData);
  const itemIndex = integer(index, 0, items.length - 1, 'index');
  if (!Array.isArray(edits)) fail('INVALID_EQUIPMENT_EDITS', '修改必须是字段列表', 'Edits must be a field list');
  const selected = inspectItem(items[itemIndex], itemIndex);
  if (selected.readOnly) fail('READ_ONLY_EQUIPMENT', selected.reason.zh, selected.reason.en, { index: itemIndex });
  const allowed = new Map(selected.fields.map(field => [JSON.stringify(field.path), field]));
  const used = new Set();
  const patches = edits.map(edit => {
    if (!edit || !Array.isArray(edit.path) || !own(edit, 'value')) fail('INVALID_EQUIPMENT_EDITS', '物品修改路径无效', 'Invalid item edit path');
    const key = JSON.stringify(edit.path);
    const field = allowed.get(key);
    if (!field) fail('UNSUPPORTED_EQUIPMENT_FIELD', '此字段不能在单件编辑中修改', 'This field is not available for item editing', { path: edit.path });
    if (used.has(key)) fail('DUPLICATE_EQUIPMENT_EDIT', '同一字段不能重复修改', 'The same field cannot be edited twice');
    used.add(key);
    return { field, value: integer(edit.value, field.min, field.max, key) };
  });
  const data = cloneSaveData(saveData);
  const bytes = data.savedItems[itemIndex].data;
  const changes = [];
  for (const { field, value } of patches) {
    if (value === field.value) continue;
    bytes[field.byteOffset] = (Number(bytes[field.byteOffset]) & (255 ^ field.mask)) | ((value + field.delta) << field.shift & field.mask);
    changes.push({ path: ['savedItems', itemIndex, ...field.path], label: field.label, before: field.value, after: value });
  }
  if (patches.some(({ field }) => field.path[0] === 'weaversWill' || field.path.at(-1) === 'tier') && selected.fields.some(field => field.path[0] === 'weaversWill')) {
    const changed = decodeSavedItem(bytes);
    const remaining = changed.rarity === 9 ? changed.extraFlags >> 3 : changed.extraFlags;
    // ItemData.getWeaversWillTier sums displayed affix tiers and remaining will.
    if (remaining + changed.affixes.reduce((sum, affix) => sum + affix.tier, 0) > 28) {
      fail('WEAVERS_WILL_LIMIT', '词缀等级总和加剩余织造意志不能超过 28', 'Affix tiers plus remaining Weaver’s Will cannot exceed 28');
    }
  }
  return { data, changes, warnings: patches.some(({ field }) => field.type === 'roll') ? [ROLL_NOTE] : [] };
}
