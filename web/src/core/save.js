import { parse, stringify, isLosslessNumber, LosslessNumber } from 'lossless-json';
import { strToU8, zipSync } from 'fflate';
import { getEditableFields } from './schema.js';

export { getEditableFields } from './schema.js';

const PREFIX = 'EPOCH';
const MAX_SAVE_LENGTH = 32 * 1024 * 1024;
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const own = (value, key) => value != null && Object.hasOwn(value, key);
const numeric = value => isLosslessNumber(value) || typeof value === 'number';
const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value) && !isLosslessNumber(value);

const ENGLISH_ERRORS = {
  INVALID_FILENAME: 'Choose a native save file. Its name must not contain a path or special characters.',
  INVALID_EXTENSION: 'Only native save files and their .bak or .json copies are supported.',
  UNKNOWN_FILENAME: 'Unrecognized save filename. Keep the original filename created by the game.',
  TOO_DEEP: 'The save structure is too deeply nested to process safely.',
  INVALID_DATA: 'The save contains an unsupported data type or a conflicting numeric marker and cannot be converted safely.',
  UNSAFE_NUMBER: 'A number has already exceeded JavaScript’s exact range. Enter it as a numeric string instead.',
  UNSAFE_KEY: 'The save contains an unsafe property name.',
  INVALID_ROOT: 'The save content must be a JSON object.',
  KIND_MISMATCH: 'The save contents do not match its filename, or this format is not supported.',
  FILE_TOO_LARGE: 'The save must be text and no larger than 32 MiB.',
  INVALID_PREFIX: 'Missing EPOCH header. Only the verified EPOCH + JSON format is supported.',
  INVALID_JSON: 'The save JSON could not be read.',
  INVALID_INTEGER: 'Enter an exact integer, without a decimal point, exponent, or blank value.',
  OUT_OF_RANGE: 'The value is outside the supported range.',
  INVALID_DECIMAL: 'Enter a valid number.',
  INVALID_BOOLEAN: 'This field accepts only an on/off value.',
  INVALID_STRING: 'Enter a non-empty name of the supported length, without control characters.',
  INVALID_LIST: 'Enter a valid list of unique tier numbers, separated by commas or as a JSON array.',
  UNSUPPORTED_FIELD: 'This field is absent or has not been verified for safe editing.',
  INVALID_EDITS: 'Changes must be a list of field edits.',
  INVALID_PATH: 'This edit path is invalid or cannot be modified.',
  NO_FILES: 'Load a save file first.',
  DUPLICATE_FILENAME: 'Two files with the same native save filename cannot be exported together.',
  NO_CHANGES: 'There are no changes to export. Original backups can be downloaded separately.',
};

function englishError(code, details) {
  if (code === 'OUT_OF_RANGE' && (details.min != null || details.max != null)) {
    return `The value must be between ${details.min ?? '−∞'} and ${details.max ?? '∞'}${details.numericType === 'float32' ? ' and representable as a 32-bit floating-point number' : ''}.`;
  }
  if (code === 'INVALID_STRING' && details.maxLength != null) return `The name must contain ${details.minLength ?? 0}–${details.maxLength} characters.`;
  const suffix = details.path ? ` (${details.path})` : details.filename ? ` (${details.filename})` : details.cause ? ` ${details.cause}` : '';
  return (ENGLISH_ERRORS[code] ?? 'The save could not be processed safely.') + suffix;
}

export class SaveError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'SaveError';
    this.code = code;
    this.details = details;
    this.messageEn = englishError(code, details);
  }
}

function fail(code, message, details) { throw new SaveError(code, message, details); }

/** Save names are deliberately stricter than arbitrary upload names or ZIP paths. */
export function validateSaveName(name) {
  if (typeof name !== 'string' || name.length > 160 || !name || /[\x00-\x1f\x7f<>:"/\\|?*]/.test(name) || name !== name.trim()) {
    fail('INVALID_FILENAME', '请选择原始存档文件，文件名不能包含路径或特殊字符。');
  }
  const outputName = name.replace(/\.(bak|json)$/i, '');
  if (outputName.includes('.') || /_temp$/i.test(outputName)) fail('INVALID_EXTENSION', '仅支持原始存档文件及其 .bak、.json 副本。');
  let kind;
  if (/^\d*CHARACTERSLOT(?:_[A-Za-z0-9-]+)*_\d+$/i.test(outputName)) kind = 'character';
  else if (/^STASH(?:_[A-Za-z0-9-]+)*_TAB_\d+$/i.test(outputName)) kind = 'stashTab';
  else if (/^STASH(?:_[A-Za-z0-9-]+)+$/i.test(outputName)) kind = 'stash';
  else if (/^Epoch_Local_Global_Data(?:_[A-Za-z0-9-]+)*$/i.test(outputName)) kind = 'global';
  else fail('UNKNOWN_FILENAME', '无法识别此存档文件名。请保留游戏原始文件名。');
  return { name, outputName, kind };
}

function assertSerializable(value, depth = 0) {
  if (depth > 150) fail('TOO_DEEP', '存档结构过深，无法安全处理。');
  if (isLosslessNumber(value)) {
    // The library's marker check is structural. Do not mistake an arbitrary JSON
    // object with that marker for a number and silently replace its contents.
    if (!(value instanceof LosslessNumber) || typeof value.value !== 'string' || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value.value)) {
      fail('INVALID_DATA', '存档包含与无损数值标记冲突的对象，不能安全转换。');
    }
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) {
      fail('UNSAFE_NUMBER', '数值已经超出 JavaScript 精确范围；请使用无损数值或数字字符串输入。');
    }
    return;
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      if (!own(value, i)) fail('INVALID_DATA', '存档数组不能包含空缺。');
      assertSerializable(value[i], depth + 1);
    }
    return;
  }
  if (plainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (UNSAFE_KEYS.has(key)) fail('UNSAFE_KEY', '存档包含不安全的字段名称。');
      assertSerializable(child, depth + 1);
    }
    return;
  }
  fail('INVALID_DATA', '存档包含无法保存的数据类型。');
}

function validateShape(data, kind) {
  if (!plainObject(data)) fail('INVALID_ROOT', '存档内容必须是 JSON 对象。');
  const valid = kind === 'character'
    ? typeof data.characterName === 'string' && numeric(data.level) && Array.isArray(data.savedItems)
    : kind === 'stash'
      ? numeric(data.gold) && (Array.isArray(data.tabsv2) || Array.isArray(data.tabs))
      : kind === 'stashTab'
        ? typeof data.displayName === 'string' && Array.isArray(data.savedItems)
        : Array.isArray(data.stashes);
  if (!valid) fail('KIND_MISMATCH', '文件内容与文件名对应的存档类型不一致，或格式尚未支持。');
}

export function cloneSaveData(data) {
  assertSerializable(data);
  return parse(stringify(data));
}

export function parseSave(text, name) {
  const identity = validateSaveName(name);
  if (typeof text !== 'string' || text.length > MAX_SAVE_LENGTH) fail('FILE_TOO_LARGE', '存档应为文本，且不能超过 32 MiB。');
  if (!text.startsWith(PREFIX)) fail('INVALID_PREFIX', '存档缺少 EPOCH 标识；当前仅支持已验证的 EPOCH + JSON 格式。');
  let data;
  try {
    // This validation result is discarded: native JSON numbers never enter the document.
    // It catches prototype keys before lossless-json can silently discard __proto__.
    JSON.parse(text.slice(PREFIX.length), (key, value) => {
      if (UNSAFE_KEYS.has(key)) fail('UNSAFE_KEY', '存档包含不安全的字段名称。');
      return value;
    });
    data = parse(text.slice(PREFIX.length));
  } catch (error) {
    if (error instanceof SaveError) throw error;
    fail('INVALID_JSON', `存档 JSON 无法读取：${error.message}`, { cause: error.message });
  }
  assertSerializable(data);
  validateShape(data, identity.kind);
  return { ...identity, data, prefix: PREFIX, originalText: text, originalCanonical: stringify(data) };
}

/** Untouched documents return their exact original text, including spacing and number spelling. */
export function serializeSave(documentOrData) {
  const document = documentOrData?.prefix === PREFIX && own(documentOrData, 'data') ? documentOrData : null;
  const data = document ? document.data : documentOrData;
  assertSerializable(data);
  if (document) validateShape(data, document.kind);
  const canonical = stringify(data);
  if (document?.originalText && canonical === document.originalCanonical) return document.originalText;
  return PREFIX + canonical;
}

export function hasSaveChanges(document) {
  return serializeSave(document) !== document.originalText;
}

export function valueAtPath(data, path) {
  let value = data;
  for (const part of path) {
    if (UNSAFE_KEYS.has(String(part)) || !own(value, part)) return undefined;
    value = value[part];
  }
  return value;
}

function normalizeInteger(value, field) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) fail('INVALID_INTEGER', '请输入精确的整数。');
  const source = typeof value === 'string' ? value.trim() : isLosslessNumber(value) || typeof value === 'number' ? String(value) : '';
  if (!/^-?(?:0|[1-9]\d*)$/.test(source)) fail('INVALID_INTEGER', '请输入整数，不支持小数、指数或空值。');
  if (source.length > 100) fail('OUT_OF_RANGE', '数值超出支持范围。');
  const number = BigInt(source);
  if ((field.min != null && number < BigInt(field.min)) || (field.max != null && number > BigInt(field.max))) {
    fail('OUT_OF_RANGE', `数值必须介于 ${field.min ?? '−∞'} 与 ${field.max ?? '∞'} 之间。`, { min: field.min, max: field.max });
  }
  return new LosslessNumber(number.toString());
}

function normalizeEdit(value, field) {
  if (field.type === 'integer') return normalizeInteger(value, field);
  if (field.type === 'decimal') {
    const source = typeof value === 'string' ? value.trim() : isLosslessNumber(value) || typeof value === 'number' ? String(value) : '';
    if (source.length > 100 || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(source)) fail('INVALID_DECIMAL', '请输入有效数值。');
    const number = Number(source);
    const underflow = (number !== 0 && Math.fround(number) === 0) || (number === 0 && /[1-9]/.test(source.split(/[eE]/)[0]));
    if (!Number.isFinite(number) || !Number.isFinite(Math.fround(number)) || underflow || number < Number(field.min) || number > Number(field.max)) {
      fail('OUT_OF_RANGE', '数值超出游戏浮点字段的范围。', { min: field.min, max: field.max, numericType: 'float32' });
    }
    return new LosslessNumber(source);
  }
  if (field.type === 'boolean') {
    if (typeof value !== 'boolean') fail('INVALID_BOOLEAN', '此字段只接受开关值。');
    return value;
  }
  if (field.type === 'string') {
    if (typeof value !== 'string' || /[\x00-\x1f\x7f]/.test(value)) fail('INVALID_STRING', '名称不能包含控制字符。');
    if (value.trim().length < (field.minLength ?? 0) || [...value].length > (field.maxLength ?? 256)) fail('INVALID_STRING', `名称长度须为 ${field.minLength ?? 0}–${field.maxLength ?? 256} 个字符。`, { minLength: field.minLength ?? 0, maxLength: field.maxLength ?? 256 });
    return value;
  }
  if (field.type === 'integer-list') {
    let values = value;
    if (typeof values === 'string') {
      const source = values.trim();
      if (source.startsWith('[')) {
        try { values = parse(source); } catch { fail('INVALID_LIST', '请输入以逗号分隔的层级，或整数数组。'); }
      } else values = source ? source.split(/[\s,，]+/) : [];
    }
    if (!Array.isArray(values) || values.length > field.maxItems) fail('INVALID_LIST', '层级列表长度不合法。');
    const normalized = values.map(item => normalizeInteger(item, field));
    if (new Set(normalized.map(String)).size !== normalized.length) fail('INVALID_LIST', '层级不能重复。');
    return normalized;
  }
  fail('UNSUPPORTED_FIELD', '此字段尚未支持安全编辑。');
}

/** Atomic whitelist patches: no deletes, implicit resets, or creation of missing records. */
export function applySaveEdits(document, edits) {
  if (!Array.isArray(edits)) fail('INVALID_EDITS', '修改必须是字段修改列表。');
  const fields = new Map(getEditableFields(document).map(field => [JSON.stringify(field.path), field]));
  const normalized = edits.map(edit => {
    if (!edit || !Array.isArray(edit.path) || !edit.path.length || !own(edit, 'value')) fail('INVALID_PATH', '修改路径不合法。');
    if (edit.path.some(part => UNSAFE_KEYS.has(String(part)))) fail('INVALID_PATH', '不能修改此路径。');
    const field = fields.get(JSON.stringify(edit.path));
    if (!field) fail('UNSUPPORTED_FIELD', `字段 ${edit.path.join('.')} 尚未验证或不存在，不能直接修改。`, { path: edit.path.join('.') });
    return { path: field.path, value: normalizeEdit(edit.value, field) };
  });
  const data = cloneSaveData(document.data);
  for (const { path, value } of normalized) {
    const parent = valueAtPath(data, path.slice(0, -1));
    parent[path.at(-1)] = value;
  }
  return { ...document, data };
}

export function toDisplayValue(value) {
  if (isLosslessNumber(value)) return String(value);
  if (Array.isArray(value)) return value.map(toDisplayValue);
  if (plainObject(value)) return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, toDisplayValue(child)]));
  return value;
}

/** Values in the preview are strings for numbers, so the preview itself cannot lose precision. */
export function diffSave(original, updated) {
  const before = original?.prefix === PREFIX ? original.data : original;
  const after = updated?.prefix === PREFIX ? updated.data : updated;
  const changes = [];
  const walk = (left, right, path) => {
    if (left === right || (numeric(left) && numeric(right) && String(left) === String(right))) return;
    if (Array.isArray(left) && Array.isArray(right) && left.length === right.length) {
      left.forEach((child, index) => walk(child, right[index], [...path, index]));
    } else if (plainObject(left) && plainObject(right)) {
      for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) walk(left[key], right[key], [...path, key]);
    } else {
      changes.push({ path, before: toDisplayValue(left), after: toDisplayValue(right), type: left === undefined ? 'added' : right === undefined ? 'removed' : 'changed' });
    }
  };
  walk(before, after, []);
  return changes;
}

export function summarizeSave(document) {
  const data = document.data;
  return {
    name: document.name, outputName: document.outputName, kind: document.kind,
    characterName: typeof data.characterName === 'string' ? data.characterName : null,
    displayName: typeof data.displayName === 'string' ? data.displayName : null,
    level: numeric(data.level) ? String(data.level) : null,
    characterClass: numeric(data.characterClass) ? String(data.characterClass) : null,
    chosenMastery: numeric(data.chosenMastery) ? String(data.chosenMastery) : null,
    cycle: numeric(data.cycle) ? String(data.cycle) : null,
    gold: numeric(data.gold) ? String(data.gold) : null,
    ancientBones: numeric(data.ancientBones) ? String(data.ancientBones) : null,
    itemCount: Array.isArray(data.savedItems) ? data.savedItems.length : 0,
    editableCount: getEditableFields(document).length,
    changed: hasSaveChanges(document),
  };
}

/** Modified files and originals are kept in separate folders, with native names intact. */
export function createSaveArchive(documents, { includeBackups = true } = {}) {
  if (!Array.isArray(documents) || documents.length === 0) fail('NO_FILES', '请先导入存档。');
  const files = Object.create(null);
  const names = new Set();
  let modifiedCount = 0;
  for (const document of documents) {
    const { outputName } = validateSaveName(document.name);
    if (names.has(outputName.toLowerCase())) fail('DUPLICATE_FILENAME', `同名存档不能同时导出：${outputName}`, { filename: outputName });
    names.add(outputName.toLowerCase());
    if (includeBackups) files[`originals/${document.name}`] = strToU8(document.originalText);
    if (hasSaveChanges(document)) {
      files[`modified/${outputName}`] = strToU8(serializeSave(document));
      modifiedCount += 1;
    }
  }
  if (!modifiedCount) fail('NO_CHANGES', '尚无修改可供导出；原始备份可单独下载。');
  return zipSync(files, { level: 6 });
}
