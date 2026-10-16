import catalog from './data/filter-catalog.json' with { type: 'json' };
import palette from './data/filter-palette.json' with { type: 'json' };
import { generateValueFilter, VALUE_FILTER_GROUPS, COMMON_AFFIX_GROUPS, isValueEquipmentAffix, isValueIdolAffix, FILTER_CLASSES, FILTER_EQUIPMENT_TYPES, FILTER_IDOL_TYPES, FILTER_IDOL_BASES, getOtherClassIdolKeys } from './core/value-filter.js';
import './filter-workbench.css';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const local = (value, language) => typeof value === 'string' ? value : value?.[language] || value?.en || value?.zh || '';
const text = (language, zh, en) => language === 'en' ? en : zh;
const unique = values => [...new Set(values.map(Number))];
const fields = { unique: 'uniqueIds', set: 'setIds', high: 'highAffixIds', medium: 'mediumAffixIds' };
const stages = [['需求暗金','Needed uniques'],['高价值词缀','High-value affixes'],['有效词缀','Useful affixes'],['隐藏类型','Hidden types'],['分组与导出','Groups & export']];
const commonGroups = COMMON_AFFIX_GROUPS.groups || COMMON_AFFIX_GROUPS;
const colorOf = id => (palette.colors || palette).find(color => color.id === Number(id))?.hex || '#FFFFFF';
const collectionOf = pool => pool === 'unique' || pool === 'set' ? catalog.uniques : catalog.affixes;
const selectedIds = (draft, pool) => draft[fields[pool]] || [];
const warningText = (warning, language) => local(warning.message || warning, language);
const affixKind = (affix, language) => text(language, affix?.type === 0 ? '前缀' : '后缀', affix?.type === 0 ? 'Prefix' : 'Suffix');
const equipmentAffix = isValueEquipmentAffix;
const idolAffix = isValueIdolAffix;
function uiState(state) {
  const draft = state.filterDraft;
  if (!state.filterUi || state.filterUi.draft !== draft) {
    state.filterUi = {
      draft, candidates: {
        unique: [...draft.uniqueIds], set: [...draft.setIds], high: [...draft.highAffixIds],
        medium: unique([...commonGroups.flatMap(group => group.affixIds), ...draft.mediumAffixIds]),
      },
      initial: { unique: [...draft.uniqueIds], set: [...draft.setIds], high: [...draft.highAffixIds] },
      query: {}, pending: {}, open: {}, idolSequence: 0,
    };
  }
  return state.filterUi;
}
function poolCandidates(state, pool) {
  const ids = uiState(state).candidates[pool];
  return pool === 'medium' ? ids.filter(id => !state.filterDraft.highAffixIds.includes(id)) : ids;
}
function categoryOf(id) {
  const common = commonGroups.find(group => group.affixIds.includes(id));
  if (common) return { id: `common-${common.id}`, name: common.name };
  const affix = catalog.affixes[id];
  return { id: `category-${affix?.displayCategory ?? 'other'}`, name: affix?.displayCategoryName || { zh: '其他词缀', en: 'Other affixes' } };
}
function categorized(state, pool) {
  const groups = new Map();
  for (const id of poolCandidates(state, pool)) {
    const category = categoryOf(id);
    if (!groups.has(category.id)) groups.set(category.id, { ...category, ids: [] });
    groups.get(category.id).ids.push(id);
  }
  return [...groups.values()];
}
function selectionRow(state, pool, id) {
  const { language, filterDraft: draft } = state, ui = uiState(state), item = collectionOf(pool)[id];
  const name = local(item?.name, language) || `#${id}`, selected = selectedIds(draft, pool).includes(id);
  const origin = ui.initial[pool]?.includes(id) ? `<span class="filter-badge">Build</span>` : '';
  const subtitle = pool === 'unique' || pool === 'set' ? (language === 'zh' ? item?.name.en : '') : `${affixKind(item, language)}${item?.specialAffixType > 1 ? ` · ${text(language,'特殊词缀','Special affix')}` : ''}`;
  return `<li class="filter-selection-item ${selected ? '' : 'unselected'}"><label><input type="checkbox" data-filter-toggle="${pool}" data-affix-id="${id}" ${selected ? 'checked' : ''}><span class="filter-selection-name"><strong>${escape(name)}${origin}</strong>${subtitle ? `<small>${escape(subtitle)}</small>` : ''}</span></label><button type="button" class="filter-remove" data-filter-remove="${pool}" data-affix-id="${id}" aria-label="${escape(text(language,`移除 ${name}`,`Remove ${name}`))}">×</button></li>`;
}
function searchResults(state, pool) {
  const { language } = state, ui = uiState(state), query = (ui.query[pool] || '').trim().toLocaleLowerCase();
  const candidates = ui.candidates[pool], pending = ui.pending[pool] || [];
  const found = Object.values(collectionOf(pool)).filter(item => {
    if (item.hideFromPlayers || candidates.includes(item.id)) return false;
    if (pool === 'unique' && item.isSetItem || pool === 'set' && !item.isSetItem) return false;
    if (pool === 'high' || pool === 'medium') {
      if (!equipmentAffix(item)) return false;
      if (pool === 'medium' && state.filterDraft.highAffixIds.includes(item.id)) return false;
    }
    return !query || `${item.name.zh || ''} ${item.name.en || ''} ${item.id}`.toLocaleLowerCase().includes(query);
  }).slice(0, 30);
  return found.map(item => `<label class="filter-search-result"><input type="checkbox" data-filter-pending="${pool}" data-affix-id="${item.id}" ${pending.includes(item.id) ? 'checked' : ''}><span><strong>${escape(local(item.name, language))}</strong><small>${escape(pool === 'high' || pool === 'medium' ? affixKind(item, language) : item.name.en || '')}${pool === 'high' && state.filterDraft.mediumAffixIds.includes(item.id) ? ` · ${text(language,'升为高价值','Promote to high value')}` : ''}</small></span></label>`).join('') || `<p class="small-note">${text(language,'无匹配项','No matches')}</p>`;
}
function picker(state, pool) {
  const { language } = state, ui = uiState(state);
  const count = (ui.pending[pool] || []).length;
  return `<details class="filter-picker" data-filter-picker="${pool}" ${ui.open[pool] ? 'open' : ''}><summary>${text(language,'＋ 搜索添加','＋ Search & add')}</summary><label class="filter-field"><span>${text(language,'名称或编号','Name or ID')}</span><input class="text-input" type="search" data-filter-search="${pool}" value="${escape(ui.query[pool] || '')}" autocomplete="off" placeholder="${text(language,'搜索名称…','Search names…')}"></label><div class="filter-picker-results" id="filter-results-${pool}">${searchResults(state,pool)}</div><div class="filter-picker-actions"><span id="filter-pending-count-${pool}" aria-live="polite">${text(language,`已选 ${count} 项`,`${count} selected`)}</span><button type="button" class="outline-button" data-filter-add-selected="${pool}" ${count ? '' : 'disabled'}>${text(language,'加入所选','Add selected')}</button></div></details>`;
}
function uniqueView(state) {
  const { language, filterDraft: draft } = state;
  return `<div class="filter-intro"><h2>${text(language,'需求暗金','Needed uniques')}</h2></div><div class="filter-pool-grid">${['unique','set'].map(pool => `<section class="panel"><div class="panel-head"><h2>${text(language,pool === 'unique' ? '需求暗金' : '需求套装',pool === 'unique' ? 'Needed uniques' : 'Needed set items')}</h2><span class="filter-count">${text(language,`已选 ${selectedIds(draft,pool).length} 件`,`${selectedIds(draft,pool).length} selected`)}</span></div><div class="panel-body">${poolCandidates(state,pool).length ? `<ul class="filter-selection-list">${poolCandidates(state,pool).map(id => selectionRow(state,pool,id)).join('')}</ul>` : `<p class="small-note">${text(language,'暂无目标','No targets')}</p>`}${picker(state,pool)}</div></section>`).join('')}</div>`;
}
function affixPool(state, pool) {
  const { language, filterDraft: draft } = state, groups = categorized(state,pool);
  const total = poolCandidates(state,pool).length, selected = poolCandidates(state,pool).filter(id => selectedIds(draft,pool).includes(id)).length;
  return `<div class="filter-pool-toolbar"><p class="small-note">${text(language,`已选 ${selected} / ${total} 个词缀`,`${selected} / ${total} affixes selected`)}</p><div><button class="text-button" data-filter-bulk="${pool}" data-filter-choice="all">${text(language,'全部选中','Select all')}</button><button class="text-button" data-filter-bulk="${pool}" data-filter-choice="none">${text(language,'全部取消','Clear all')}</button></div></div><div class="filter-pool-grid">${groups.map(group => `<section class="panel"><div class="panel-head"><h2>${escape(local(group.name,language))}</h2><span class="filter-count">${group.ids.filter(id => selectedIds(draft,pool).includes(id)).length} / ${group.ids.length}</span></div><div class="panel-body"><div class="filter-category-actions"><button class="text-button" data-filter-bulk="${pool}" data-filter-category="${group.id}" data-filter-choice="all">${text(language,'此类全选','Select category')}</button><button class="text-button" data-filter-bulk="${pool}" data-filter-category="${group.id}" data-filter-choice="none">${text(language,'此类全不选','Clear category')}</button></div><ul class="filter-selection-list">${group.ids.map(id => selectionRow(state,pool,id)).join('')}</ul></div></section>`).join('')}</div>${groups.length ? '' : `<p class="small-note">${text(language,'暂无词缀','No affixes')}</p>`}<section class="panel filter-pool-add"><div class="panel-body">${picker(state,pool)}</div></section>`;
}
function idolView(state) {
  const { language, filterDraft: draft } = state;
  const shapes = Object.values(catalog.types).filter(type => type.id >= 25 && type.id <= 33);
  return `<section class="panel filter-idol-section"><div class="panel-head"><h2>${text(language,'神像需求','Idol needs')}</h2><span class="filter-count">${draft.idols.filter(idol => idol.enabled).length}</span></div><div class="panel-body"><p class="small-note">${text(language,'同形状词缀可重新组合。','Affixes of the same idol shape can recombine.')}</p><div class="filter-idol-list">${draft.idols.map((idol,index) => {
    const shape = catalog.types[idol.baseTypeId], title = `${local(shape?.name,language) || text(language,'神像','Idol')} ${index+1}`;
    const candidates = Object.values(catalog.affixes).filter(affix => idolAffix(affix,idol.baseTypeId) || idol.affixIds.includes(affix.id));
    return `<div class="filter-idol-card"><div class="filter-idol-heading"><label><input type="checkbox" data-filter-idol-enabled="${escape(idol.id)}" ${idol.enabled ? 'checked' : ''}><strong>${escape(title)}</strong></label><button type="button" class="filter-remove" data-filter-idol-remove="${escape(idol.id)}" aria-label="${escape(text(language,`移除 ${title}`,`Remove ${title}`))}">×</button></div><div class="filter-idol-fields"><label class="filter-field"><span>${text(language,'神像形状','Idol shape')}</span><select class="text-input" data-filter-idol-shape="${escape(idol.id)}">${shapes.map(type => `<option value="${type.id}" ${type.id === idol.baseTypeId ? 'selected' : ''}>${escape(local(type.name,language))}</option>`).join('')}</select></label>${[0,1].map(type => {
      const chosen = idol.affixIds.filter(id => catalog.affixes[id]?.type === type);
      const fieldTitle = text(language,type === 0 ? '需要的前缀' : '需要的后缀',type === 0 ? 'Desired prefixes' : 'Desired suffixes');
      return `<div class="filter-field"><span>${fieldTitle}</span><div class="filter-idol-chips">${chosen.map(id => `<button type="button" class="filter-idol-chip" data-filter-idol-affix-remove="${escape(idol.id)}" data-affix-id="${id}" aria-label="${escape(text(language,`移除 ${local(catalog.affixes[id].name,language)}`,`Remove ${local(catalog.affixes[id].name,language)}`))}">${escape(local(catalog.affixes[id].name,language))}<span aria-hidden="true">×</span></button>`).join('') || `<span class="filter-count">${text(language,'暂不指定','Not specified')}</span>`}</div><label><span class="visually-hidden">${fieldTitle}</span><select class="text-input" data-filter-idol-affix="${escape(idol.id)}" data-affix-type="${type}"><option value="">${text(language,type === 0 ? '＋ 添加前缀' : '＋ 添加后缀',type === 0 ? '＋ Add prefix' : '＋ Add suffix')}</option>${candidates.filter(affix => affix.type === type && !chosen.includes(affix.id)).map(affix => `<option value="${affix.id}">${escape(local(affix.name,language))}${affix.specialAffixType > 1 ? text(language,' · 特殊',' · Special') : ''}</option>`).join('')}</select></label></div>`;
    }).join('')}</div>${idol.enabled && !idol.affixIds.length ? `<p class="small-note">${text(language,'请选择词缀或停用。','Select an affix or disable this idol.')}</p>` : ''}</div>`;
  }).join('')}</div><button type="button" class="outline-button filter-idol-add" id="filter-add-idol">${text(language,'＋ 添加神像需求','＋ Add idol need')}</button></div></section>`;
}
function highView(state) {
  const { language } = state;
  return `<div class="filter-intro"><h2>${text(language,'高价值词缀','High-value affixes')}</h2></div>${affixPool(state,'high')}${idolView(state)}`;
}
function mediumView(state) {
  const { language } = state;
  return `<div class="filter-intro"><h2>${text(language,'有效词缀','Useful affixes')}</h2></div>${affixPool(state,'medium')}`;
}

const equipmentFamilies = [
  ['onehand', '单手武器', 'One-handed weapons', [5,6,7,8,9,10,11]],
  ['twohand', '双手近战武器', 'Two-handed melee weapons', [12,13,14,15,16]],
  ['ranged', '弓与弩', 'Bows & crossbows', [23,24]],
  ['offhand', '副手装备', 'Off-hand equipment', [17,18,19]],
  ['armor', '护甲', 'Armor', [0,1,2,3,4]],
  ['accessories', '饰品与遗物', 'Accessories & relics', [20,21,22]],
];
function exclusionsView(state) {
  const { language, filterDraft: draft } = state, selected = draft.exclusions;
  const typeChoice = (type, field) => `<label class="filter-type-choice"><input type="checkbox" data-filter-exclude="${field}" data-type-id="${type.id}" ${selected[field].includes(type.id) ? 'checked' : ''}><span>${escape(local(type.name,language))}</span></label>`;
  const bulk = (key, zh, en) => `<button type="button" class="text-button" data-filter-exclude-family="${key}">${text(language,zh,en)}</button>`;
  const equipment = equipmentFamilies.map(([key,zh,en,ids]) => `<section class="panel"><div class="panel-head"><h2>${text(language,zh,en)}</h2>${bulk(key,'隐藏此类','Hide this family')}</div><div class="panel-body filter-type-grid">${FILTER_EQUIPMENT_TYPES.filter(type => ids.includes(type.id)).map(type => typeChoice(type,'equipmentTypeIds')).join('')}</div></section>`).join('');
  const classes = [{ id: 'general', bit: 0, name: { zh: '通用神像', en: 'General idols' } }, ...FILTER_CLASSES];
  const classCards = classes.map(c => {
    const bases = FILTER_IDOL_BASES.filter(base => c.bit ? !!(base.classRequirement & c.bit) : !base.classRequirement);
    const count = bases.filter(base => selected.idolBaseKeys.includes(base.key)).length;
    return `<details class="panel filter-idol-exclusions"><summary><label><input type="checkbox" data-filter-exclude-class="${c.id}" ${count === bases.length ? 'checked' : ''}><strong>${escape(local(c.name,language))}</strong></label><span class="filter-count">${count} / ${bases.length}</span></summary><div class="panel-body filter-type-grid">${bases.map(base => `<label class="filter-type-choice"><input type="checkbox" data-filter-exclude-base="${base.key}" ${selected.idolBaseKeys.includes(base.key) ? 'checked' : ''}><span>${escape(local(base.name,language))}</span></label>`).join('')}</div></details>`;
  }).join('');
  const player = FILTER_CLASSES.find(c => c.id === draft.build.classId);
  return `<div class="filter-intro"><h2>${text(language,'隐藏不需要的类型','Hide unwanted types')}</h2><p>${text(language,'勾选即优先隐藏，包含该类型的暗金、套装和配装需求。未勾选的类型继续按后续规则筛选。','Checked types are hidden first, including uniques, sets and build targets. Other types continue through the remaining rules.')}</p></div><div class="filter-pool-toolbar"><p class="small-note">${text(language,`已选 ${selected.equipmentTypeIds.length} 种装备、${selected.idolTypeIds.length} 种神像形状、${selected.idolBaseKeys.length} 种神像底材`,`${selected.equipmentTypeIds.length} equipment types, ${selected.idolTypeIds.length} idol shapes and ${selected.idolBaseKeys.length} idol bases selected`)}</p><button type="button" class="text-button" id="filter-clear-exclusions">${text(language,'取消全部隐藏','Clear hidden types')}</button></div><h3 class="filter-section-title">${text(language,'装备类型','Equipment types')}</h3><div class="filter-pool-grid">${equipment}</div><div class="filter-pool-toolbar"><h3 class="filter-section-title">${text(language,'按职业选择神像','Idols by class')}</h3>${player ? `<button type="button" class="outline-button" id="filter-hide-other-class-idols">${text(language,`隐藏其他职业神像（当前：${local(player.name,language)}）`,`Hide other-class idols (current: ${local(player.name,language)})`)}</button>` : ''}</div><div class="filter-pool-grid">${classCards}</div><section class="panel filter-idol-section"><div class="panel-head"><h2>${text(language,'按形状隐藏全部神像','Hide all idols of a shape')}</h2></div><div class="panel-body filter-type-grid">${FILTER_IDOL_TYPES.map(type => typeChoice(type,'idolTypeIds')).join('')}</div></section>`;
}

function groupView(state) {
  const { language, filterDraft: draft } = state, ui = uiState(state);
  let output, error;
  try { output = generateValueFilter({ ...draft, language }); } catch (problem) { error = problem.message; }
  const generated = new Map((output?.groups || []).map(group => [group.id,group]));
  const warnings = [...new Map((output?.warnings || draft.analysis?.warnings || []).map(warning => [warningText(warning,language), warning])).values()];
  const colors = palette.colors || palette;
  const families = [
    ['equipment','装备','Equipment'], ['idol','神像','Idols'], ['unique','暗金','Uniques'],
    ['set','套装','Set items'], ['resources','锻造材料与钥匙','Crafting materials & keys'], ['altar','神像祭坛','Idol altars'],
  ];
  const groupCard = group => {
    const style = draft.groups[group.id], summary = generated.get(group.id), title = local(group.name,language), id = escape(group.id);
    return `<section class="filter-group-card ${style.show ? '' : 'is-hidden'}"><div class="filter-group-copy"><div class="filter-group-title"><h3>${escape(title)}</h3></div><p>${escape(local(group.description,language))}</p><span class="filter-count" data-filter-group-rule-count="${id}">${summary ? text(language,`${summary.ruleCount} 条规则`,`${summary.ruleCount} rules`) : '—'}</span></div><div class="filter-group-controls"><label class="filter-field"><span>${text(language,'显示方式','Visibility')}</span><select class="text-input" data-filter-group-show="${id}"><option value="show" ${style.show ? 'selected' : ''}>${text(language,'显示','Show')}</option><option value="hide" ${style.show ? '' : 'selected'}>${text(language,'隐藏','Hide')}</option></select></label><label class="filter-field"><span>${text(language,'颜色','Color')}</span><span class="filter-color-control"><span class="filter-color-swatch" aria-hidden="true" style="--loot-color:${colorOf(style.color)}" data-filter-group-swatch="${id}"></span><select class="text-input" data-filter-group-color="${id}">${colors.map(color => `<option value="${color.id}" ${color.id === Number(style.color) ? 'selected' : ''}>${escape(local(color.name,language))}</option>`).join('')}</select></span></label><div class="filter-preview-field"><div class="filter-preview-heading"><span>${text(language,'颜色预览','Color preview')}</span></div><div class="filter-loot-preview ${style.emphasized ? 'emphasized' : ''}" style="--loot-color:${colorOf(style.color)}" data-filter-group-preview="${id}">${escape(title)}</div></div><label class="filter-emphasis"><input type="checkbox" data-filter-group-emphasis="${id}" ${style.emphasized ? 'checked' : ''}>${text(language,'强调','Emphasize')}</label></div></section>`;
  };
  const familyCards = families.map(([id,zh,en]) => {
    const groups = VALUE_FILTER_GROUPS.filter(group => id === 'resources' ? ['glyph','rune','shard','key'].includes(group.id) : group.id === id || group.id.startsWith(`${id}_`));
    const visibleGroups = groups.filter(group => group.id !== 'equipment_other');
    const hidden = visibleGroups.filter(group => !draft.groups[group.id].show).length;
    const open = ui.families?.[id] ?? id === 'equipment';
    const status = text(language,`${visibleGroups.length} 组 · ${hidden} 组隐藏`,`${visibleGroups.length} groups · ${hidden} hidden`);
    return `<details class="panel filter-group-family" data-filter-family="${id}" ${open ? 'open' : ''}><summary><strong>${text(language,zh,en)}</strong><span>${status}</span></summary><div>${visibleGroups.map(groupCard).join('')}</div></details>`;
  }).join('');
  return `<div class="filter-intro"><h2>${text(language,'分组与导出','Groups & export')}</h2></div><div class="filter-group-list">${familyCards}</div><section class="panel filter-export"><div class="panel-head"><h2>${text(language,'命名与下载','Name & download')}</h2><span class="filter-count" id="filter-rule-count">${output ? output.rules.length : "—"} / 200</span></div><div class="panel-body"><label class="filter-field"><span>${text(language,'过滤器名称','Filter name')}</span><input class="text-input" id="filter-name" maxlength="100" value="${escape(draft.name)}"></label><p id="filter-export-error" class="error-inline" role="alert" ${error ? '' : 'hidden'}>${escape(error || '')}</p>${warnings.length ? `<details class="warning-box"><summary>${text(language,'生成说明与限制','Generation notes and limits')} (${warnings.length})</summary>${warnings.map(warning => `<p>${escape(warningText(warning,language))}</p>`).join('')}</details>` : ''}<div class="filter-download-row"><p class="small-note">${text(language,'下载后在游戏内导入。','Download and import in game.')}</p><button type="button" class="primary-button" id="filter-download" ${error ? 'disabled' : ''}>${text(language,'下载过滤器 XML','Download filter XML')}</button></div></div></section>`;
}
export function renderFilterWorkbench(state) {
  const { filterDraft: draft, language } = state;
  if (!draft) return `<section class="filter-empty"><h2>${text(language,'从一个 Build 开始','Start with a build')}</h2><p>${text(language,'输入分享链接后即可确认价值池，无需读取存档。','Enter a build link to confirm value pools. No save file is needed.')}</p></section>`;
  uiState(state);
  const step = Math.max(1, Math.min(5, Number(state.filterStep) || 1));
  const views = [uniqueView, highView, mediumView, exclusionsView, groupView];
  return `<div class="filter-workbench"><nav class="filter-steps" aria-label="${text(language,'过滤器构造阶段','Filter creation stages')}">${stages.map((title,index) => `<button type="button" data-filter-step="${index+1}" class="${step === index+1 ? 'current' : ''}" ${step === index+1 ? 'aria-current="step"' : ''}><span>${index+1}</span><strong>${title[language === 'en' ? 1 : 0]}</strong></button>`).join('')}</nav>${views[step-1](state)}<div class="filter-stage-actions">${step > 1 ? `<button type="button" class="outline-button" data-filter-step="${step-1}">← ${text(language,'上一步','Back')}</button>` : '<span></span>'}${step < 5 ? `<button type="button" class="primary-button" data-filter-step="${step+1}">${text(language,'下一步','Next')} →</button>` : ''}</div></div>`;
}

export function bindFilterWorkbench(state, { render, notify, downloadFile }) {
  if (state.tab !== 'filterTab' || !state.filterDraft) return;
  const draft = state.filterDraft, ui = uiState(state);
  const changed = () => { state.filterDirty = true; render(); };
  const refreshExportStatus = () => {
    const button = document.querySelector('#filter-download'), error = document.querySelector('#filter-export-error');
    if (!button || !error) return;
    try {
      const output = generateValueFilter({ ...draft, language: state.language }); button.disabled = false; error.hidden = true; error.textContent = '';
      document.querySelector('#filter-rule-count').textContent = `${output.rules.length} / 200`;
      for (const group of output.groups) {
        const count = document.querySelector(`[data-filter-group-rule-count="${group.id}"]`);
        if (count) count.textContent = group.enabled === false ? text(state.language,'已停用','Disabled') : text(state.language,`${group.ruleCount} 条自动规则`,`${group.ruleCount} automatic rules`);
      }
    } catch (problem) {
      button.disabled = true; error.hidden = false; error.textContent = problem.message;
      document.querySelector('#filter-rule-count').textContent = '— / 200';
      document.querySelectorAll('[data-filter-group-rule-count]').forEach(count => { count.textContent = '—'; });
    }
  };
  const setSelected = (pool, ids, checked) => {
    const field = fields[pool];
    if (checked) {
      const allowed = pool === 'medium' ? ids.filter(id => !draft.highAffixIds.includes(id)) : ids;
      draft[field] = unique([...draft[field], ...allowed]);
      if (pool === 'high') {
        draft.mediumAffixIds = draft.mediumAffixIds.filter(id => !ids.includes(id));
        ui.pending.medium = (ui.pending.medium || []).filter(id => !ids.includes(id));
      }
    } else draft[field] = draft[field].filter(id => !ids.includes(id));
  };
  document.querySelectorAll('[data-filter-step]').forEach(button => button.onclick = () => { state.filterStep = Number(button.dataset.filterStep); render(); document.querySelector('.filter-steps')?.scrollIntoView({ block: 'start', behavior: 'instant' }); });
  document.querySelectorAll('[data-filter-toggle]').forEach(input => input.onchange = () => { setSelected(input.dataset.filterToggle,[Number(input.dataset.affixId)],input.checked); changed(); });
  document.querySelectorAll('[data-filter-remove]').forEach(button => button.onclick = () => {
    const pool = button.dataset.filterRemove, id = Number(button.dataset.affixId);
    setSelected(pool,[id],false); ui.candidates[pool] = ui.candidates[pool].filter(value => value !== id); changed();
  });
  document.querySelectorAll('[data-filter-bulk]').forEach(button => button.onclick = () => {
    const pool = button.dataset.filterBulk, category = button.dataset.filterCategory;
    const ids = category ? categorized(state,pool).find(group => group.id === category)?.ids || [] : poolCandidates(state,pool);
    setSelected(pool,ids,button.dataset.filterChoice === 'all'); changed();
  });
  const pendingCount = pool => {
    const count = (ui.pending[pool] || []).length;
    const caption = document.querySelector(`#filter-pending-count-${pool}`), button = document.querySelector(`[data-filter-add-selected="${pool}"]`);
    if (caption) caption.textContent = text(state.language,`已选 ${count} 项`,`${count} selected`);
    if (button) button.disabled = count === 0;
  };
  const bindSearchResults = () => document.querySelectorAll('[data-filter-pending]').forEach(input => input.onchange = () => {
    const pool = input.dataset.filterPending, id = Number(input.dataset.affixId);
    ui.pending[pool] = input.checked ? unique([...(ui.pending[pool] || []),id]) : (ui.pending[pool] || []).filter(value => value !== id);
    pendingCount(pool);
  });
  document.querySelectorAll('[data-filter-picker]').forEach(details => details.ontoggle = () => { ui.open[details.dataset.filterPicker] = details.open; });
  document.querySelectorAll('[data-filter-family]').forEach(details => details.ontoggle = () => { (ui.families ||= {})[details.dataset.filterFamily] = details.open; });
  document.querySelectorAll('[data-filter-search]').forEach(input => input.oninput = () => {
    const pool = input.dataset.filterSearch; ui.query[pool] = input.value;
    document.querySelector(`#filter-results-${pool}`).innerHTML = searchResults(state,pool); bindSearchResults();
  });
  bindSearchResults();
  document.querySelectorAll('[data-filter-add-selected]').forEach(button => button.onclick = () => {
    const pool = button.dataset.filterAddSelected, ids = ui.pending[pool] || [];
    ui.candidates[pool] = unique([...ui.candidates[pool], ...ids]); setSelected(pool,ids,true); ui.pending[pool] = []; ui.open[pool] = true; changed();
  });
  const idolById = id => draft.idols.find(idol => idol.id === id);
  document.querySelector('#filter-add-idol')?.addEventListener('click', () => {
    let id; do { id = `idol-custom-${++ui.idolSequence}`; } while (idolById(id));
    draft.idols.push({ id, baseTypeId: 25, subTypeId: 0, affixIds: [], enabled: true }); changed();
  });
  document.querySelectorAll('[data-filter-idol-enabled]').forEach(input => input.onchange = () => { idolById(input.dataset.filterIdolEnabled).enabled = input.checked; changed(); });
  document.querySelectorAll('[data-filter-idol-remove]').forEach(button => button.onclick = () => { draft.idols = draft.idols.filter(idol => idol.id !== button.dataset.filterIdolRemove); changed(); });
  document.querySelectorAll('[data-filter-idol-shape]').forEach(input => input.onchange = () => {
    const idol = idolById(input.dataset.filterIdolShape); idol.baseTypeId = Number(input.value); idol.subTypeId = 0;
    idol.affixIds = idol.affixIds.filter(id => catalog.affixes[id]?.canRollOn.includes(idol.baseTypeId)); changed();
  });
  document.querySelectorAll('[data-filter-idol-affix]').forEach(input => input.onchange = () => {
    if (input.value === '') return;
    const idol = idolById(input.dataset.filterIdolAffix);
    idol.affixIds = unique([...idol.affixIds, Number(input.value)]); changed();
  });
  document.querySelectorAll('[data-filter-idol-affix-remove]').forEach(button => button.onclick = () => {
    const idol = idolById(button.dataset.filterIdolAffixRemove);
    idol.affixIds = idol.affixIds.filter(id => id !== Number(button.dataset.affixId)); changed();
  });

  document.querySelectorAll('[data-filter-exclude]').forEach(input => input.onchange = () => {
    const field = input.dataset.filterExclude, id = Number(input.dataset.typeId);
    draft.exclusions[field] = input.checked ? unique([...draft.exclusions[field], id]) : draft.exclusions[field].filter(value => value !== id); changed();
  });
  document.querySelectorAll('[data-filter-exclude-family]').forEach(button => button.onclick = () => {
    const family = equipmentFamilies.find(f => f[0] === button.dataset.filterExcludeFamily);
    draft.exclusions.equipmentTypeIds = unique([...draft.exclusions.equipmentTypeIds, ...family[3]]); changed();
  });
  document.querySelectorAll('[data-filter-exclude-base]').forEach(input => input.onchange = () => {
    const key = input.dataset.filterExcludeBase;
    draft.exclusions.idolBaseKeys = input.checked ? [...new Set([...draft.exclusions.idolBaseKeys, key])] : draft.exclusions.idolBaseKeys.filter(value => value !== key); changed();
  });
  document.querySelectorAll('[data-filter-exclude-class]').forEach(input => {
    const c = FILTER_CLASSES.find(c => String(c.id) === input.dataset.filterExcludeClass);
    const keys = FILTER_IDOL_BASES.filter(base => c ? !!(base.classRequirement & c.bit) : !base.classRequirement).map(base => base.key);
    const count = keys.filter(key => draft.exclusions.idolBaseKeys.includes(key)).length;
    input.indeterminate = count > 0 && count < keys.length;
    input.onclick = event => event.stopPropagation?.();
    input.onchange = () => {
      draft.exclusions.idolBaseKeys = input.checked ? [...new Set([...draft.exclusions.idolBaseKeys, ...keys])] : draft.exclusions.idolBaseKeys.filter(key => !keys.includes(key)); changed();
    };
  });
  document.querySelector('#filter-hide-other-class-idols')?.addEventListener('click', () => {
    draft.exclusions.idolBaseKeys = [...new Set([...draft.exclusions.idolBaseKeys, ...getOtherClassIdolKeys(draft.build.classId)])]; changed();
  });
  document.querySelector('#filter-clear-exclusions')?.addEventListener('click', () => {
    draft.exclusions = { equipmentTypeIds: [], idolTypeIds: [], idolBaseKeys: [] }; changed();
  });

  const groupStyle = id => draft.groups[id];
  document.querySelectorAll('[data-filter-group-show]').forEach(input => input.onchange = () => { groupStyle(input.dataset.filterGroupShow).show = input.value === 'show'; changed(); });
  const refreshGroupPreview = id => {
    const style = groupStyle(id), preview = document.querySelector(`[data-filter-group-preview="${id}"]`);
    preview.style.setProperty('--loot-color', colorOf(style.color));
    preview.classList.toggle('emphasized', style.emphasized);
    document.querySelector(`[data-filter-group-swatch="${id}"]`).style.setProperty('--loot-color', colorOf(style.color));
    state.filterDirty = true; refreshExportStatus();
  };
  document.querySelectorAll('[data-filter-group-color]').forEach(input => input.oninput = input.onchange = () => { const id = input.dataset.filterGroupColor; groupStyle(id).color = Number(input.value); refreshGroupPreview(id); });
  document.querySelectorAll('[data-filter-group-emphasis]').forEach(input => input.onchange = () => { const id = input.dataset.filterGroupEmphasis; groupStyle(id).emphasized = input.checked; refreshGroupPreview(id); });
  document.querySelector('#filter-name')?.addEventListener('input', event => {
    draft.name = event.target.value; state.filterDirty = true;
    refreshExportStatus();
  });
  document.querySelector('#filter-download')?.addEventListener('click', () => {
    try {
      const output = generateValueFilter({ ...draft, language: state.language });
      const name = (draft.name || 'LastEpoch-Filter').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').slice(0,100);
      downloadFile(output.xml,`${name}.xml`,'application/xml;charset=utf-8'); state.filterDirty = false;
      notify(text(state.language,'过滤器已下载，可在游戏内导入。','Filter downloaded. Import it in the game.'));
    } catch (error) { notify(error.message,true); }
  });
}
