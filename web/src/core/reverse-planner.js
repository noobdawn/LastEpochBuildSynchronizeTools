import LZString from 'lz-string';
import { cloneSaveData } from './save.js';
import { decodeSavedItem, encodePlannerItem, resolvePlannerItemId, EQUIPMENT_CONTAINERS, BLESSING_CONTAINERS } from './items.js';
import { normalizePlannerBuild } from './planner.js';
import catalog from './game-item-data.json' with { type: 'json' };
import treeData from '../data/planner-game-data.js';

const own = (value, key) => value != null && Object.hasOwn(value, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const UNIQUE_RARITIES = new Set([7, 8, 9]);
const SLOT_BY_CONTAINER = new Map(Object.entries(EQUIPMENT_CONTAINERS).map(([slot, id]) => [id, slot]));

export class ReversePlannerError extends Error {
  constructor(code, zh, en, details = {}) {
    super(zh);
    this.name = 'ReversePlannerError';
    this.code = code;
    this.messageEn = en;
    this.details = details;
  }
}

function fail(code, zh, en, details) { throw new ReversePlannerError(code, zh, en, details); }
function integer(value, min, max, field) {
  const result = Number(value);
  if (value == null || value === '' || typeof value === 'boolean' || !Number.isSafeInteger(result) || result < min || result > max) {
    fail('INVALID_SAVE_FIELD', `无法读取存档字段：${field}`, `Invalid save field: ${field}`, { field });
  }
  return result;
}

function encodeId(prefix, value) { return prefix + LZString.compressToBase64(value); }
function itemId(item) {
  const id = own(item, 'uniqueId')
    ? encodeId('U', String(item.subTypeId).padStart(3, '0') + String(item.uniqueId).padStart(3, '0'))
    : encodeId('I', '1' + String(item.baseTypeId).padStart(3, '0') + String(item.subTypeId).padStart(3, '0') + '000');
  // Use the existing verified resolver to check the reverse identifier too.
  const identity = resolvePlannerItemId(id);
  if (identity.baseTypeId !== item.baseTypeId || identity.subTypeId !== item.subTypeId || identity.uniqueId !== item.uniqueId) {
    fail('ITEM_ID_MISMATCH', '物品编号无法无歧义转换。', 'The item identity cannot be converted unambiguously.');
  }
  return id;
}

function affixRecord(affix) {
  const definition = catalog.affixes[affix.affixId];
  if (!definition || affix.tier > definition.tierCount) {
    fail('UNKNOWN_SAVE_AFFIX', `词缀 ${affix.affixId} 尚未支持。`, `Affix ${affix.affixId} is not supported.`, { affixId: affix.affixId });
  }
  return { id: encodeId('A', String(affix.affixId)), tier: affix.tier, r: affix.roll };
}

/** Reuse the item codec; this maps its semantic fields into LET-shaped records. */
function itemRecord(savedItem, context) {
  if (Number(savedItem?.formatVersion) !== 2) fail('UNSUPPORTED_WRAPPER_VERSION', '此外层物品格式尚未验证。', 'This item wrapper format is not verified.');
  const item = decodeSavedItem(savedItem);
  if (!item.supported) fail('UNSUPPORTED_SAVE_ITEM', `此物品格式尚未验证：${item.reason}`, `This item layout is not verified: ${item.reason}`, { reason: item.reason });
  if (integer(savedItem.quantity ?? 1, 0, 2147483647, 'item.quantity') !== 1) {
    fail('INVALID_EQUIPPED_QUANTITY', '已装备物品的数量不是 1。', 'An equipped item has a quantity other than one.');
  }
  if (context.slot === 'idol' && (item.baseTypeId < 25 || item.baseTypeId > 33)) {
    fail('INVALID_IDOL', '神像容器中存在非神像物品。', 'The idol container contains a non-idol item.');
  }
  if (context.slot === 'blessing' && item.baseTypeId !== 34) {
    fail('INVALID_BLESSING', '祝福容器中存在非祝福物品。', 'A blessing container contains a non-blessing item.');
  }
  const record = { id: itemId(item), ir: [...item.implicitRolls], affixes: [] };
  if (item.flags & 32) record.ruined = true;
  let affixOffset = 0;
  if (UNIQUE_RARITIES.has(item.rarity)) {
    const unique = catalog.uniques[item.uniqueId];
    record.ur = [...item.uniqueRolls];
    if (unique.legendaryType === 1) record.ww = item.rarity === 9 ? item.extraFlags >> 3 : item.extraFlags;
    else if (item.rarity !== 9) record.lp = item.extraFlags;
    else if (item.extraFlags) fail('UNKNOWN_LEGENDARY_FLAGS', '传奇物品包含尚未验证的额外标志。', 'The legendary item has unverified extra flags.');
    if (item.flags & 16) record.corrupted = true;
  } else {
    if (item.sealedFlags & 128) {
      if (!item.affixes[affixOffset]) fail('MISSING_SEALED_AFFIX', '封印词缀标志与物品内容不符。', 'The sealed-affix flag has no matching affix.');
      record.sealedAffix = affixRecord(item.affixes[affixOffset++]);
    }
    if (item.sealedFlags & 64) {
      if (!item.affixes[affixOffset]) fail('MISSING_CORRUPTED_AFFIX', '腐化词缀标志与物品内容不符。', 'The corrupted-affix flag has no matching affix.');
      record.corruptedAffix = affixRecord(item.affixes[affixOffset++]);
    }
    if (item.flags & 16) record.corrupted = true;
    if (item.baseTypeId >= 25 && item.baseTypeId <= 33) record.wt = item.potentialByte;
  }
  record.affixes = item.affixes.slice(affixOffset).map(affixRecord);
  if (context.slot === 'idol') {
    const [width, height] = catalog.bases[item.baseTypeId].size;
    const x = integer(savedItem.inventoryPosition?.x, 0, 4, 'idol.x');
    const y = integer(savedItem.inventoryPosition?.y, 0, 4, 'idol.y');
    if (x + width > 5 || y + height > 5) fail('INVALID_IDOL_POSITION', '神像位置超出当前格子范围。', 'The idol position is outside the current grid.');
    record.x = x + 1;
    record.y = 6 - y - height;
  }
  // This catches LP/WW bounds, unsupported unique mechanics and field combinations.
  // It operates on a new record; its generated bytes are never written to the save.
  encodePlannerItem(record, { containerID: context.containerID, individualId: Math.max(16, item.individualId) });
  return record;
}

function selectedNodes(tree, field) {
  if (!object(tree) || !Array.isArray(tree.nodeIDs) || !Array.isArray(tree.nodePoints) || tree.nodeIDs.length !== tree.nodePoints.length) {
    fail('INVALID_SAVED_TREE', `存档树结构不完整：${field}`, `The saved tree structure is incomplete: ${field}`, { field });
  }
  const selected = {};
  tree.nodeIDs.forEach((value, index) => {
    const id = integer(value, 0, 255, `${field}.nodeIDs`);
    if (own(selected, id)) fail('DUPLICATE_SAVED_NODE', `存档树存在重复节点：${field}/${id}`, `The saved tree has a duplicate node: ${field}/${id}`);
    selected[id] = integer(tree.nodePoints[index], 0, 255, `${field}.nodePoints`);
  });
  return selected;
}

/**
 * Local, read-only build overview. Unknown equipped records remain explicit
 * placeholders; a marker enforced by applyPlannerBuild prevents lossy reapply.
 * This does not upload a build or create a LastEpochTools share URL.
 */
export function saveToPlannerBuild(saveData) {
  const save = cloneSaveData(saveData);
  if (!object(save) || !Array.isArray(save.savedItems) || !object(save.savedCharacterTree) || !Array.isArray(save.savedSkillTrees)) {
    fail('NOT_CHARACTER_SAVE', '请选择含装备和技能树的角色存档。', 'Select a character save containing items and skill trees.');
  }
  const warnings = [{
    code: 'READ_ONLY_SAVE_OVERVIEW',
    zh: '这是本工具中的只读配装概览，未上传到 LastEpochTools。物品身份、锻造潜能、阵营与交易标记、赠送对象等存档专属信息不进入配装；请直接编辑原物品，或将导出的角色存档交给原站 Import。',
    en: 'This is a local, read-only build overview; nothing was uploaded to LastEpochTools. Item identities, forging potential, faction/trade flags and gifting targets are save-only data. Edit original items directly, or use the exported character save with the original site’s Import.',
  }];
  const data = {
    bio: {
      level: integer(save.level, 1, 100, 'level'),
      characterClass: integer(save.characterClass, 0, 4, 'characterClass'),
      chosenMastery: integer(save.chosenMastery, 0, 3, 'chosenMastery'),
    },
    equipment: Object.fromEntries(Object.keys(EQUIPMENT_CONTAINERS).map(slot => [slot, null])),
    idols: [], blessings: Object.fromEntries(BLESSING_CONTAINERS.map((_, index) => [index + 1, null])),
    charTree: { treeID: '', version: 0, selected: {} }, skillTrees: [], hud: [],
    workshopReadOnly: true,
    workshopSource: { kind: 'offline-save', characterName: String(save.characterName ?? '') },
  };
  const occupiedSlots = new Set();
  save.savedItems.forEach((savedItem, sourceIndex) => {
    const containerID = Number(savedItem?.containerID);
    const equipmentSlot = SLOT_BY_CONTAINER.get(containerID);
    const timelineIndex = BLESSING_CONTAINERS.indexOf(containerID);
    if (!equipmentSlot && timelineIndex < 0 && containerID !== 29) return;
    const slot = equipmentSlot ?? (containerID === 29 ? 'idol' : 'blessing');
    const identity = equipmentSlot ?? (containerID === 29 ? `idol-${sourceIndex}` : `blessing-${timelineIndex + 1}`);
    if (occupiedSlots.has(identity)) fail('DUPLICATE_EQUIPPED_SLOT', `存档中同一装备槽出现多个物品：${identity}`, `The save has multiple items in the same equipped slot: ${identity}`);
    occupiedSlots.add(identity);
    let record;
    try { record = itemRecord(savedItem, { slot, containerID }); }
    catch (error) {
      const reason = error.code ?? 'UNSUPPORTED_SAVE_ITEM';
      const detail = error.details?.reason ?? reason;
      record = { id: null, workshopUnsupported: { reason, detail, sourceIndex, slot: identity, containerID } };
      warnings.push({
        code: reason, slot: identity, sourceIndex,
        zh: `${identity}：无法完整转换此物品，已保留“未支持”占位；原物品不受影响。${error.message}`,
        en: `${identity}: this item cannot be fully converted and is shown as an unsupported placeholder. The original item is unchanged. ${error.messageEn ?? detail}`,
      });
    }
    if (equipmentSlot) data.equipment[equipmentSlot] = record;
    else if (containerID === 29) data.idols.push(record);
    else data.blessings[timelineIndex + 1] = record;
  });

  try {
    data.charTree = {
      treeID: typeof save.savedCharacterTree.treeID === 'string' ? save.savedCharacterTree.treeID : '',
      version: integer(save.savedCharacterTree.version, 0, 65535, 'savedCharacterTree.version'),
      selected: selectedNodes(save.savedCharacterTree, 'savedCharacterTree'),
    };
  } catch (error) {
    data.charTree.workshopUnsupported = { reason: error.code ?? 'INVALID_SAVED_TREE' };
    warnings.push({ code: error.code, zh: `被动树无法完整显示：${error.message}`, en: `The passive tree cannot be fully displayed: ${error.messageEn}` });
  }
  if (save.savedSkillTrees.length > 5) fail('TOO_MANY_SAVED_SKILLS', '存档技能专精槽数量超出已验证范围。', 'The save has more specialization slots than the verified format supports.');
  data.skillTrees = save.savedSkillTrees.map((tree, index) => {
    const treeID = typeof tree?.treeID === 'string' ? tree.treeID : `unknown-${index}`;
    try {
      if (!own(treeData.skills, treeID)) fail('UNKNOWN_SAVED_SKILL', `未知技能：${treeID}`, `Unknown skill: ${treeID}`);
      const selected = selectedNodes(tree, `savedSkillTrees.${index}`);
      const xp = integer(tree.xp, 0, 2147483647, 'skill.xp');
      const unspent = integer(tree.unspentPoints, 0, 2147483647, 'skill.unspentPoints');
      const levelFromXp = treeData.skillXpThresholds.filter(threshold => xp >= threshold).length;
      const levelFromPoints = Object.values(selected).reduce((total, points) => total + points, 0) + unspent;
      return {
        treeID, slotNumber: integer(tree.slotNumber, 0, 4, 'skill.slotNumber'),
        version: integer(tree.version, 0, 65535, 'skill.version'), selected,
        level: Math.max(1, levelFromXp, levelFromPoints),
      };
    } catch (error) {
      warnings.push({ code: error.code, zh: `技能 ${treeID} 无法完整显示：${error.message}`, en: `Skill ${treeID} cannot be fully displayed: ${error.messageEn}` });
      return { treeID, selected: {}, slotNumber: index, version: 0, level: 1, workshopUnsupported: { reason: error.code ?? 'INVALID_SAVED_TREE' } };
    }
  });
  if (data.skillTrees.length) warnings.push({
    code: 'ESTIMATED_SKILL_LEVELS',
    zh: '概览中的技能等级根据存档经验和已分配／剩余点数推定；装备加成后的实时有效等级未重新计算。',
    en: 'Skill levels are inferred from saved experience and allocated/unspent points; live effective levels from equipment bonuses are not recalculated.',
  });
  if (Array.isArray(save.abilityBar) && save.abilityBar.length === 5 && save.abilityBar.every(id => typeof id === 'string')) data.hud = [...save.abilityBar];
  else {
    data.hud = ['', '', '', '', ''];
    data.workshopUnsupportedHud = true;
    warnings.push({ code: 'INVALID_SAVED_SKILL_BAR', zh: '技能栏结构未受支持，概览显示空位，原存档不变。', en: 'The action-bar structure is unsupported. The overview shows empty slots; the save is unchanged.' });
  }
  if (save.savedWeaverTree?.nodeIDs?.length) warnings.push({ code: 'WEAVER_TREE_NOT_SHOWN', zh: '织造树不包含在此概览中，原存档保持完整。', en: 'The Weaver tree is not included in this overview and remains intact in the save.' });

  const build = normalizePlannerBuild({ id: null, sourceUrl: null, dataVersion: 'Version 1.5.2.1', data });
  return { build, warnings };
}
