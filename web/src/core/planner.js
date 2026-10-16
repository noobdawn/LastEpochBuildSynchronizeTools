import { cloneSaveData } from './save.js';
import { applyPlannerItems } from './items.js';
import gameData from '../data/planner-game-data.js';

const HOSTS = new Set(['www.lastepochtools.com', 'lastepochtools.com']);
const LANGUAGES = new Set(['en', 'zh', 'de', 'es', 'fr', 'ja', 'ko', 'pl', 'pt', 'ru']);
const MAX_RESPONSE = 2 * 1024 * 1024;
const DEFAULT_OPTIONS = { equipment: true, idols: true, blessings: true, passives: true, skills: true, skillBar: true, class: false, level: false, weaverTree: false };
const own = (object, key) => object != null && Object.hasOwn(object, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export class PlannerError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'PlannerError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) { throw new PlannerError(code, message, details); }
function integer(value, min, max, field) {
  const n = Number(value);
  if (value == null || value === '' || typeof value === 'boolean' || !Number.isSafeInteger(n) || n < min || n > max) {
    fail('INVALID_BUILD', `无效配装字段 / Invalid build field: ${field}`, { field });
  }
  return n;
}

/** Accept a share code or the actual LET planner URL; never fetch an arbitrary host. */
export function parsePlannerUrl(input) {
  if (typeof input !== 'string' || input.trim().length > 2048) fail('INVALID_URL', '请输入 LastEpochTools 分享链接 / Enter a LastEpochTools share URL.');
  const text = input.trim();
  let id;
  let language = 'en';
  if (/^[A-Za-z0-9]{8}$/.test(text)) id = text;
  else {
    let url;
    try { url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`); }
    catch { fail('INVALID_URL', '分享链接格式不正确 / Invalid share URL.'); }
    if (!HOSTS.has(url.hostname.toLowerCase()) || url.username || url.password || url.port || !['http:', 'https:'].includes(url.protocol)) {
      fail('INVALID_URL', '只支持 LastEpochTools 分享链接 / Only LastEpochTools share URLs are supported.');
    }
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'planner' || ![2, 3].includes(parts.length)) fail('INVALID_URL', '链接必须指向已分享的配装 / The URL must identify a shared build.');
    if (parts.length === 3) {
      if (!LANGUAGES.has(parts[1])) fail('INVALID_URL', '不支持此链接的语言路径 / Unsupported language path.');
      language = parts[1];
    }
    id = parts.at(-1);
    if (!/^[A-Za-z0-9]{8}$/.test(id)) fail('INVALID_URL', '分享码格式不正确 / Invalid share code.');
  }
  return {
    id, language,
    url: `https://www.lastepochtools.com/planner/${language === 'en' ? '' : `${language}/`}${id}`,
    apiUrl: `https://www.lastepochtools.com/api/public/build_data/${id}`,
  };
}

function checkObject(value, depth = 0) {
  if (depth > 40) fail('INVALID_BUILD', '配装数据层级过深 / Build data is too deeply nested.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('INVALID_BUILD', '配装包含无效数值 / Invalid number in build.');
    return;
  }
  if (Array.isArray(value)) { for (const child of value) checkObject(child, depth + 1); return; }
  if (!object(value)) fail('INVALID_BUILD', '配装数据格式不正确 / Invalid build data.');
  for (const [key, child] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) fail('INVALID_BUILD', '配装包含不安全字段 / Unsafe field in build.');
    checkObject(child, depth + 1);
  }
}

/** Keep LET's documented-by-observation payload intact; this adapter never executes site JS. */
export function normalizePlannerBuild(raw, { id = null, sourceUrl = null } = {}) {
  if (!object(raw)) fail('INVALID_BUILD', '服务器未返回配装数据 / The server did not return a build.');
  checkObject(raw);
  const data = object(raw.data) ? raw.data : raw;
  if (!object(data.bio) || !object(data.equipment) || !Array.isArray(data.idols) || !object(data.charTree) || !Array.isArray(data.skillTrees)) {
    fail('INVALID_BUILD', '配装缺少必要字段 / The build is missing required fields.');
  }
  integer(data.bio.characterClass, 0, 4, 'bio.characterClass');
  integer(data.bio.chosenMastery, 0, 3, 'bio.chosenMastery');
  integer(data.bio.level, 1, 100, 'bio.level');
  const dataVersion = raw.dataVersion ?? raw.data_version ?? data.dataVersion;
  if (typeof dataVersion !== 'string' || !dataVersion.trim()) fail('MISSING_BUILD_VERSION', '配装没有版本信息 / The build has no version information.');
  if (data.idols.length > 100 || data.skillTrees.length > 5 || Object.keys(data.equipment).length > 20) fail('INVALID_BUILD', '配装包含过多条目 / Too many entries in build.');
  return { id: id ?? raw.id ?? null, sourceUrl: sourceUrl ?? raw.sourceUrl ?? null, dataVersion, data: structuredClone(data) };
}

export async function fetchPlannerBuild(input, { signal } = {}) {
  const parsed = parsePlannerUrl(input);
  const timeout = AbortSignal.timeout(20000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const networkFailure = error => {
    if (timeout.aborted) fail('BUILD_FETCH_TIMEOUT', '读取配装超时，请重试 / Build request timed out. Please retry.');
    if (error.name === 'AbortError' || signal?.aborted) throw error;
    fail('BUILD_FETCH_FAILED', '无法连接配装接口，请稍后重试 / Could not reach the build API. Please retry.', { cause: error.message });
  };
  let response;
  try {
    response = await fetch(parsed.apiUrl, { signal: requestSignal, mode: 'cors', credentials: 'omit', headers: { Accept: 'application/json' }, referrerPolicy: 'no-referrer' });
  } catch (error) { networkFailure(error); }
  if (!response.ok) fail(response.status === 404 ? 'BUILD_NOT_FOUND' : 'BUILD_FETCH_FAILED', `配装读取失败 / Build request failed (${response.status}).`, { status: response.status });
  if (Number(response.headers.get('content-length')) > MAX_RESPONSE) fail('BUILD_TOO_LARGE', '配装数据过大 / Build response is too large.');
  let text;
  try { text = await response.text(); }
  catch (error) { networkFailure(error); }
  if (text.length > MAX_RESPONSE) fail('BUILD_TOO_LARGE', '配装数据过大 / Build response is too large.');
  let raw;
  try { raw = JSON.parse(text); }
  catch { fail('BUILD_FETCH_FAILED', '配装接口没有返回 JSON，可能暂时需要网站验证 / The build API returned a non-JSON response.'); }
  return normalizePlannerBuild(raw, { id: parsed.id, sourceUrl: parsed.url });
}

function selectedNodes(selected, field) {
  if (!object(selected) && !Array.isArray(selected)) fail('INVALID_BUILD', `无效技能树 / Invalid tree: ${field}`);
  const result = new Map();
  for (const [key, value] of Object.entries(selected)) {
    if (value === null) continue;
    if (!/^(0|[1-9]\d*)$/.test(key)) fail('INVALID_BUILD', `无效节点编号 / Invalid node ID: ${field}.${key}`);
    const id = integer(key, 0, 255, `${field}.id`);
    const points = integer(value, 0, 255, `${field}.${key}`);
    if (points) result.set(id, points);
  }
  return result;
}

const sum = values => [...values].reduce((total, value) => total + Number(value), 0);

export function summarizeBuild(build) {
  const b = normalizePlannerBuild(build);
  return {
    id: b.id, dataVersion: b.dataVersion,
    classId: Number(b.data.bio.characterClass), masteryId: Number(b.data.bio.chosenMastery), level: Number(b.data.bio.level),
    equipmentCount: Object.values(b.data.equipment).filter(Boolean).length,
    idolCount: b.data.idols.filter(Boolean).length,
    blessingCount: Object.values(b.data.blessings ?? {}).filter(Boolean).length,
    passivePoints: sum(selectedNodes(b.data.charTree.selected, 'charTree').values()),
    skillCount: b.data.skillTrees.filter(Boolean).length,
    skills: b.data.skillTrees.filter(Boolean).map(t => ({ id: t.treeID, name: gameData.skills[t.treeID]?.name ?? t.treeID, level: t.level })),
  };
}

function validateCurrentTree(selected, schema, { mastery, passive = false, field }) {
  for (const [id, points] of selected) {
    const node = schema.nodes[id];
    if (!node || points > node.max) fail('INCOMPATIBLE_TREE', `配装节点与当前游戏不兼容 / Build node does not match the current game: ${field}/${id}`, { field, node: id, points, maximum: node?.max });
    if (passive && node.mastery > 0 && node.mastery !== mastery && node.level > 22) fail('INVALID_MASTERY_NODE', `节点需要另一专精 / Node requires another mastery: ${id}`);
  }
  // Reconstruct a legal allocation order. Alternatives in game node requirements are OR.
  const placed = new Map();
  const masteryTotals = [0, 0, 0, 0];
  let remaining = sum(selected.values());
  while (remaining) {
    let changed = false;
    for (const [id, points] of selected) {
      const count = placed.get(id) ?? 0;
      if (count >= points) continue;
      const node = schema.nodes[id];
      if (passive && ((masteryTotals[node.mastery] ?? 0) < node.level || (node.mastery > 0 && masteryTotals[0] < 20))) continue;
      if (node.requires.length && !node.requires.some(([parent, minimum]) => (placed.get(parent) ?? 0) >= minimum)) continue;
      placed.set(id, count + 1);
      masteryTotals[node.mastery] += 1;
      remaining -= 1;
      changed = true;
    }
    if (!changed) fail('INVALID_TREE_REQUIREMENTS', `配装不符合当前节点前置要求 / Current node prerequisites are not met: ${field}`, { field });
  }
  return { nodeIDs: [...selected.keys()], nodePoints: [...selected.values()] };
}

function currentTreeVersion(sourceVersion, currentVersion, warnings, field) {
  const version = integer(sourceVersion, 0, 65535, `${field}.version`);
  if (version > currentVersion) fail('FUTURE_TREE_VERSION', `配装技能树比本工具数据更新 / Build tree is newer than this tool: ${field}`);
  if (version < currentVersion) warnings.push(`${field}: 已按当前节点规则校验并更新树版本 ${version} → ${currentVersion} / Validated against current node rules and updated tree version.`);
  return currentVersion;
}

function savedPointBudget(saveData) {
  const tree = saveData.savedCharacterTree;
  if (!object(tree) || !Array.isArray(tree.nodeIDs) || !Array.isArray(tree.nodePoints) || tree.nodeIDs.length !== tree.nodePoints.length) fail('INVALID_SAVE_TREE', '存档天赋树格式不正确 / Invalid passive tree in save.');
  return tree.nodePoints.reduce((total, points) => total + integer(points, 0, 255, 'savedCharacterTree.nodePoints'), 0) + integer(tree.unspentPoints, 0, 255, 'savedCharacterTree.unspentPoints');
}

function skillAvailability(saveData, classId, mastery, level) {
  const schema = gameData.passives[classId];
  const totals = [0, 0, 0, 0];
  const tree = saveData.savedCharacterTree;
  for (let index = 0; index < tree.nodeIDs.length; index++) {
    const node = schema.nodes[Number(tree.nodeIDs[index])];
    if (node) totals[node.mastery] += Number(tree.nodePoints[index]);
  }
  return id => {
    const rules = own(gameData.classSkills[classId], id) ? gameData.classSkills[classId][id] : null;
    if (!rules) fail('SKILL_CLASS_MISMATCH', `技能不属于此职业 / Skill does not belong to this class: ${id}`, { treeID: id, classId });
    // CharacterClass.getUnlockedAbilities checks character level, points spent in
    // each mastery, and the chosen mastery for unlocks above 22 passive points.
    const unlocked = rules.some(rule => rule.kind === 'level' ? level >= rule.level
      : rule.kind === 'mastery' ? mastery === rule.mastery
        : totals[rule.mastery] >= rule.level && (rule.level <= 22 || mastery === rule.mastery));
    if (!unlocked) fail('LOCKED_SKILL', `角色尚未解锁此技能，请检查等级和天赋 / Skill is not unlocked; check character level and passives: ${id}`, { treeID: id });
  };
}

/** Apply selected build sections to a lossless clone of character save data. */
export function applyPlannerBuild(saveData, build, options = {}) {
  const b = normalizePlannerBuild(build);
  if (b.data.workshopReadOnly === true) fail('DISPLAY_ONLY_BUILD', '此存档配装仅供只读概览，不能重新应用；请直接编辑原物品或将角色存档导入原站 / This save-derived build is read-only. Edit original items directly or import the character save on the original site.');
  if (!/^Version\s+1\.5\.\d+(?:\.\d+)?$/i.test(b.dataVersion)) fail('UNSUPPORTED_BUILD_VERSION', '仅支持 1.5.x 配装 / Only 1.5.x builds are supported.', { version: b.dataVersion });
  if (!object(saveData) || !Array.isArray(saveData.savedItems) || !object(saveData.savedCharacterTree)) fail('NOT_CHARACTER_SAVE', '请选择角色存档 / Select a character save.');
  const settings = { ...DEFAULT_OPTIONS, ...options };
  for (const key of Object.keys(DEFAULT_OPTIONS)) if (typeof settings[key] !== 'boolean') fail('INVALID_OPTION', `无效同步选项 / Invalid import option: ${key}`);
  if (settings.weaverTree) fail('UNSUPPORTED_WEAVER_TREE', '织网者树写入尚未验证，请取消此选项 / Weaver tree writing has not been verified; deselect this option.');
  let data = cloneSaveData(saveData);
  const changes = [];
  const warnings = [];
  const source = b.data;
  const oldClass = integer(data.characterClass, 0, 4, 'save.characterClass');
  const oldMastery = integer(data.chosenMastery, 0, 3, 'save.chosenMastery');
  const oldLevel = integer(data.level, 1, 100, 'save.level');
  const classId = Number(source.bio.characterClass);
  const mastery = Number(source.bio.chosenMastery);
  const targetLevel = settings.level ? Number(source.bio.level) : oldLevel;
  const identityChanged = oldClass !== classId || oldMastery !== mastery;
  if (identityChanged && !settings.class && Object.keys(DEFAULT_OPTIONS).some(key => !['class', 'level'].includes(key) && settings[key])) {
    fail('CLASS_MISMATCH', '配装职业或专精与存档不同，请先启用职业同步 / Class or mastery differs; enable class synchronization.');
  }
  if (identityChanged && settings.class && (!settings.passives || !settings.skills || !settings.skillBar)) {
    fail('CLASS_REQUIRES_TREES', '变更职业需要同时同步天赋、技能和技能栏 / Changing class requires passives, skills and skill bar.');
  }
  const set = (key, value, section) => { changes.push({ section, path: key, before: data[key], after: value }); data[key] = value; };
  if (settings.class && identityChanged) {
    set('characterClass', classId, 'class');
    set('chosenMastery', mastery, 'class');
    if (own(data, 'originalMastery')) set('originalMastery', mastery, 'class');
  }
  if (settings.level && targetLevel !== oldLevel) {
    set('level', targetLevel, 'level');
    if (own(data, 'currentExp')) set('currentExp', 0, 'level');
  }
  if (settings.passives) {
    const schema = gameData.passives[classId];
    const selected = selectedNodes(source.charTree.selected, 'charTree');
    const nodes = validateCurrentTree(selected, schema, { mastery, passive: true, field: 'charTree' });
    const budget = savedPointBudget(saveData) + targetLevel - oldLevel;
    const spent = sum(selected.values());
    if (spent > budget || budget < 0) fail('INSUFFICIENT_PASSIVE_POINTS', `配装需要 ${spent} 天赋点，存档可用 ${Math.max(0, budget)} / Build needs ${spent} passive points; save has ${Math.max(0, budget)}.`, { required: spent, available: Math.max(0, budget) });
    const version = currentTreeVersion(source.charTree.version, schema.version, warnings, 'charTree');
    set('savedCharacterTree', { ...data.savedCharacterTree, treeID: data.savedCharacterTree.treeID ?? '', version, ...nodes, unspentPoints: budget - spent, nodesTaken: null }, 'passives');
    // This cache belongs to the former allocation and is empty in current native saves.
    if (own(data, 'characterTreeNodeProgression')) set('characterTreeNodeProgression', [], 'passives');
  } else if (targetLevel !== oldLevel) {
    const budget = savedPointBudget(saveData) + targetLevel - oldLevel;
    const spent = sum(data.savedCharacterTree.nodePoints);
    if (budget < spent) fail('LEVEL_BELOW_PASSIVES', '降级后无法保留现有天赋点，请同时同步天赋 / Lower level cannot retain existing passives; synchronize the passive tree.');
    set('savedCharacterTree', { ...data.savedCharacterTree, unspentPoints: budget - spent }, 'level');
  }
  const requireSkill = settings.skills || settings.skillBar ? skillAvailability(data, classId, mastery, targetLevel) : null;
  if (settings.skills) {
    if (!Array.isArray(data.savedSkillTrees)) fail('INVALID_SAVE_TREE', '存档缺少技能树 / Save is missing skill trees.');
    const slots = new Set();
    const ids = new Set();
    const unlockedSlots = [4, 8, 20, 35, 50].filter(level => targetLevel >= level).length;
    const trees = source.skillTrees.filter(Boolean).map(tree => {
      if (!object(tree) || typeof tree.treeID !== 'string' || !own(gameData.skills, tree.treeID)) fail('UNKNOWN_SKILL', '配装包含当前游戏中未知的技能 / Unknown skill in build.', { treeID: tree?.treeID });
      const slot = integer(tree.slotNumber, 0, 4, 'skillTrees.slotNumber');
      if (slot >= unlockedSlots) fail('LOCKED_SKILL_SLOT', '角色等级尚未解锁此专精槽 / Character level has not unlocked this specialization slot.', { slot });
      requireSkill(tree.treeID);
      if (slots.has(slot) || ids.has(tree.treeID)) fail('DUPLICATE_SKILL', '配装包含重复技能或专精槽 / Duplicate skill or specialization slot.');
      slots.add(slot); ids.add(tree.treeID);
      const schema = gameData.skills[tree.treeID];
      const selected = selectedNodes(tree.selected, `skillTrees.${tree.treeID}`);
      const nodes = validateCurrentTree(selected, schema, { field: tree.treeID });
      const level = integer(tree.level, 1, 255, `${tree.treeID}.level`);
      const spent = sum(selected.values());
      if (spent > level) fail('INVALID_SKILL_POINTS', '技能分配点数超过配装技能等级 / Allocated skill points exceed build skill level.', { treeID: tree.treeID });
      const version = currentTreeVersion(tree.version, schema.version, warnings, tree.treeID);
      const previous = data.savedSkillTrees.find(t => t.treeID === tree.treeID);
      const xpNeeded = gameData.skillXpThresholds[Math.min(level, 20) - 1];
      const previousXp = previous ? integer(previous.xp, 0, 2147483647, 'savedSkillTrees.xp') : 0;
      if (level > 20) warnings.push(`${tree.treeID}: ${level} 级包含装备或天赋额外等级；游戏会按实际加成重算 / Skill levels above 20 require the actual equipment or passive bonuses.`);
      return {
        ...(previous ?? {}), treeID: tree.treeID, slotNumber: slot, xp: Math.max(previousXp, xpNeeded), version,
        ...nodes, unspentPoints: level - spent, nodesTaken: null, abilityXP: 0,
      };
    });
    set('savedSkillTrees', trees, 'skills');
  }
  if (settings.skillBar) {
    if (!Array.isArray(source.hud) || source.hud.length !== 5 || source.hud.some(id => typeof id !== 'string' || id.length > 100)) fail('INVALID_SKILL_BAR', '配装技能栏必须有五个位置 / Build skill bar must have five slots.');
    // Move-only and the class's innate evade are not in the unlockable skill list.
    const evadeId = { 0: 'evade3', 1: 'evade2', 2: 'evade5', 3: 'evade1', 4: 'evade4' }[classId];
    for (const id of source.hud) if (id && id !== 'na28' && id !== evadeId) requireSkill(id);
    set('abilityBar', [...source.hud], 'skillBar');
  }
  if (settings.equipment || settings.idols || settings.blessings) {
    const result = applyPlannerItems(data, source, settings);
    data = result.data;
    changes.push(...result.changes);
    warnings.push(...result.warnings);
  }
  if (object(source.weaverTree) && sum(selectedNodes(source.weaverTree.selected ?? {}, 'weaverTree').values()) > 0) warnings.push('织网者树尚未同步，保留存档原值 / Weaver tree was not imported; the save retains its existing tree.');
  return { data, changes, warnings: [...new Set(warnings)] };
}
