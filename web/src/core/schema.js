import { isLosslessNumber } from 'lossless-json';
import resourceData from '../data/save-resource-data.js';
import plannerData from '../data/planner-game-data.js';

const INT32_MAX = '2147483647';
const INT64_MAX = '9223372036854775807';
const FLOAT32_MAX = '3.4028234663852886e+38';
const own = (value, key) => value != null && Object.hasOwn(value, key);
const numeric = value => isLosslessNumber(value) || (typeof value === 'number' && Number.isFinite(value));
const text = (zh, en) => ({ zh, en });
const factionNamesZh = ['命运之环', '商人公会', '遗忘骑士', '织命者'];

function resourceName(collection, entry) {
  if (collection === 'savedShards') return resourceData.shards[String(entry?.shardType)] ?? null;
  // Only the verified v6 header is used for labels. Encoded bytes are never edited here.
  if (!Array.isArray(entry?.data) || entry.data.length < 7 || Number(entry.data[0]) !== 6) return null;
  const baseType = Number(entry.data[5]);
  const subtype = baseType === 107 && entry.data.length >= 8
    ? Number(entry.data[6]) * 256 + Number(entry.data[7])
    : Number(entry.data[6]);
  if (baseType === 107 && entry.data.length < 8) return null;
  if (![102, 103, 104, 106, 107, 108, 109].includes(baseType) || !Number.isInteger(subtype) || subtype < 0 || subtype > (baseType === 107 ? 65535 : 255)) return null;
  return resourceData.resources[`${baseType}:${subtype}`] ?? null;
}

/** Only fields observed in current saves are offered; missing structures are never invented. */
export function getEditableFields(document) {
  const data = document.data;
  const fields = [];
  const add = (parent, key, path, label, group, options = {}) => {
    if (!own(parent, key)) return;
    const raw = parent[key];
    const type = options.type ?? 'integer';
    if (type === 'integer' && (!numeric(raw) || !/^-?\d+$/.test(String(raw)))) return;
    if (type === 'decimal' && !numeric(raw)) return;
    if (type === 'string' && typeof raw !== 'string') return;
    if (type === 'boolean' && typeof raw !== 'boolean') return;
    if (type === 'integer-list' && (!Array.isArray(raw) || raw.some(v => !numeric(v) || !/^\d+$/.test(String(v))))) return;
    fields.push({
      path: [...path, key], label, group, type,
      ...(type === 'integer' ? { min: '0', max: INT32_MAX } : {}),
      ...(type === 'decimal' ? { min: '0', max: FLOAT32_MAX } : {}),
      ...options,
      value: type === 'integer' || type === 'decimal' ? String(raw) : type === 'integer-list' ? raw.map(String) : raw,
    });
  };

  if (document.kind === 'character') {
    add(data, 'characterName', [], text('角色名称', 'Character name'), 'character', { type: 'string', minLength: 1, maxLength: 32 });
    add(data, 'level', [], text('角色等级', 'Character level'), 'character', { min: '1', max: '100' });
    add(data, 'currentExp', [], text('当前经验', 'Current experience'), 'character', { max: INT64_MAX });
    add(data.savedCharacterTree, 'unspentPoints', ['savedCharacterTree'], text('未分配被动点', 'Unspent passive points'), 'passives');
    if (Array.isArray(data.savedSkillTrees)) data.savedSkillTrees.forEach((tree, index) => {
      const path = ['savedSkillTrees', index];
      const skill = plannerData.skills[String(tree?.treeID)]?.name || String(tree?.treeID ?? index + 1);
      add(tree, 'unspentPoints', path, text(`技能 ${skill} · 未分配点数`, `Skill ${skill} · Unspent points`), 'skills');
      add(tree, 'xp', path, text(`技能 ${skill} · 经验`, `Skill ${skill} · Experience`), 'skills');
      add(tree, 'abilityXP', path, text(`技能 ${skill} · 能力经验`, `Skill ${skill} · Ability experience`), 'skills', { type: 'decimal' });
    });
    if (Array.isArray(data.monolithRuns)) data.monolithRuns.forEach((run, index) => {
      const identity = `${String(run?.timelineID ?? '?')} / ${String(run?.difficultyIndex ?? '?')}`;
      add(run, 'stability', ['monolithRuns', index], text(`时间线 ${identity} · 稳定值`, `Timeline ${identity} · Stability`), 'monolith');
      add(run?.savedEchoWeb, 'corruption', ['monolithRuns', index, 'savedEchoWeb'], text(`时间线 ${identity} · 腐化`, `Timeline ${identity} · Corruption`), 'monolith');
    });
    add(data, 'maxCorruption', [], text('最高腐化记录', 'Highest recorded corruption'), 'monolith');
    add(data, 'arenaTiersCompleted', [], text('已完成竞技场层级（0–3）', 'Completed arena tiers (0–3)'), 'progression', { type: 'integer-list', min: '0', max: '3', maxItems: 4 });
    add(data, 'maxWave', [], text('竞技场最高波次记录', 'Highest recorded arena wave'), 'progression');
    add(data, 'previousArenaRunWaves', [], text('上次竞技场波次记录', 'Previous arena run waves'), 'progression');
    add(data, 'deaths', [], text('死亡次数记录', 'Recorded deaths'), 'advanced');
    add(data, 'monolithEchoesConquered', [], text('已征服回响数量', 'Echoes conquered'), 'advanced');
    add(data, 'monolithTimelinesConquered', [], text('已征服时间线数量', 'Timelines conquered'), 'advanced');
    add(data, 'minionAIToggle', [], text('随从 AI 开关', 'Minion AI toggle'), 'advanced', { type: 'boolean' });
  }

  if (document.kind === 'stash') {
    add(data, 'gold', [], text('金币', 'Gold'), 'resources');
    add(data, 'ancientBones', [], text('远古骨骸', 'Ancient bones'), 'resources');
    add(data, 'highestCorruption', [], text('最高腐化记录', 'Highest recorded corruption'), 'monolith');
    for (const [key, zh, en] of [
      ['savedShards', '词缀碎片', 'Affix shard'],
      ['materialsList', '材料', 'Material'], ['keysList', '钥匙', 'Key'], ['wovenEchoesList', '编织回响', 'Woven echo'],
    ]) {
      if (!Array.isArray(data[key])) continue;
      data[key].forEach((entry, index) => {
        const identity = entry?.shardType != null ? String(entry.shardType) : `#${index + 1}`;
        const name = resourceName(key, entry);
        add(entry, 'quantity', [key, index], name ? text(`${name} · ${zh}数量`, `${name} · ${en} quantity`) : text(`${zh} ${identity} · 数量`, `${en} ${identity} · Quantity`), 'resources', { itemIndex: index, collection: key });
      });
    }
    if (Array.isArray(data.savedResonances)) data.savedResonances.forEach((entry, index) => {
      for (const [key, zh, en] of [['goldResonanceAmount', '黄金共鸣数量', 'Golden resonance amount'], ['obsidianResonanceAmount', '黑曜石共鸣数量', 'Obsidian resonance amount']]) {
        add(entry, key, ['savedResonances', index], text(`共鸣 #${index + 1} · ${zh}`, `Resonance #${index + 1} · ${en}`), 'resources');
      }
    });
  }

  if (document.kind === 'character' || document.kind === 'stash') {
    if (data.factions && typeof data.factions === 'object' && !Array.isArray(data.factions)) {
      for (const [id, faction] of Object.entries(data.factions)) {
        if (!/^\d+$/.test(id)) continue;
        const metadata = resourceData.factions[id];
        for (const [key, zh, en] of [['rank', '阶级', 'Rank'], ['reputation', '声望', 'Reputation'], ['favor', '恩惠', 'Favor']]) {
          // Unknown future factions can retain their data, but cannot receive an unverified rank.
          if (key === 'rank' && !metadata) continue;
          add(faction, key, ['factions', id], text(`${factionNamesZh[id] ?? `阵营 ${id}`} · ${zh}`, `${metadata?.name ?? `Faction ${id}`} · ${en}`), 'factions', key === 'rank' ? { max: String(metadata.maxRank) } : {});
        }
      }
    }
    if (Array.isArray(data.dungeonCompletion)) data.dungeonCompletion.forEach((dungeon, index) => {
      add(dungeon, 'tiersCompleted', ['dungeonCompletion', index], text(`地下城 ${String(dungeon?.dungeonID ?? '?')} · 已完成层级（0–3）`, `Dungeon ${String(dungeon?.dungeonID ?? '?')} · Completed tiers (0–3)`), 'progression', { type: 'integer-list', min: '0', max: '3', maxItems: 4 });
    });
  }

  if (document.kind === 'stashTab') {
    add(data, 'displayName', [], text('仓库页名称', 'Stash tab name'), 'character', { type: 'string', minLength: 1, maxLength: 64 });
  }
  return fields;
}
