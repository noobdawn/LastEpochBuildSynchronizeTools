import './styles.css';
import { messages, classes, masteries } from './i18n.js';
import { icon } from './icons.js';
import { parseSave, serializeSave, applySaveEdits, getEditableFields, diffSave, createSaveArchive, toDisplayValue } from './core/save.js';
import { fetchPlannerBuild, summarizeBuild, applyPlannerBuild } from './core/planner.js';
import { getEquipment, applyEquipmentEdit } from './core/equipment.js';
import { saveToPlannerBuild } from './core/reverse-planner.js';
import { createValueFilterDraft as createFilterDraft } from './core/value-filter.js';
import { renderFilterWorkbench, bindFilterWorkbench } from './filter-workbench.js';

const EXAMPLE = 'https://www.lastepochtools.com/planner/zh/om6w3Ypq';
const app = document.querySelector('#app');
let renderedTab;
let rememberedLanguage;
try { rememberedLanguage = localStorage.getItem('epoch-workshop-language'); } catch { /* Storage is optional. */ }
const state = {
  language: rememberedLanguage === 'en' ? 'en' : 'zh', tab: 'workspace', files: new Map(), active: null,
  build: null, buildUrl: '', loading: false, request: null, buildError: '', search: '', group: '',
  buildMode: 'sync', loadedBuildUrl: '', filterDraft: null, filterStep: 1, filterSelected: null, filterDirty: false,
  options: { equipment: true, idols: true, blessings: true, passives: true, skills: true, skillBar: true, weaverTree: false, class: false, level: false },
  fieldDrafts: new Map(), equipmentDrafts: new Map(), selectedEquipment: null, equipmentGroup: 'equipment', warnings: [], toast: null,
};
const t = key => messages[state.language][key] || key;
const errorText = error => state.language==='en' && error.messageEn ? error.messageEn : error.message;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const number = value => Number(String(value ?? 0));
const display = value => {
  if (value === undefined || value === null) return t('empty');
  if (typeof value === 'boolean') return t(value ? 'enabled' : 'disabled');
  try { const readable=toDisplayValue(value); return readable && typeof readable==='object' ? JSON.stringify(readable,null,2) : String(readable); } catch { return String(value); }
};
const localized = value => typeof value === 'object' && value !== null ? value[state.language] || value.en || value.zh || '' : t(String(value));
const current = () => state.files.get(state.active);
const pathKey = path => JSON.stringify(path);
const currentFields = () => current() ? getEditableFields(current().doc) : [];
const currentEquipment = () => current()?.doc.kind==='character' ? getEquipment(current().doc.data) : [];
const fileChanges = entry => diffSave(entry.original, entry.doc);
const allChanges = () => [...state.files.values()].map(entry => ({ entry, changes: fileChanges(entry) })).filter(item => item.changes.length);
const totalChanges = () => allChanges().reduce((sum, item) => sum + item.changes.length, 0);
const className = (classId, masteryId = 0) => masteries[state.language][number(classId)]?.[number(masteryId)] || classes[state.language][number(classId)] || t('unrecognized');
const fileTitle = doc => doc.kind === 'character' ? String(doc.data.characterName || doc.name) : doc.name;
const plannerUrl = () => state.language === 'zh' ? 'https://www.lastepochtools.com/planner/zh/' : 'https://www.lastepochtools.com/planner/';
const warningText = warning => {
  if (typeof warning !== 'string') return localized(warning);
  const parts = warning.split(' / ');
  if (parts.length!==2) return warning;
  const prefix = parts[0].match(/^[A-Za-z0-9]+: /)?.[0] || '';
  return state.language==='zh' ? parts[0] : prefix + parts[1];
};
function reviewValue(value) {
  if (!value || typeof value!=='object') return esc(display(value));
  if (Array.isArray(value) && value.every(item=>item===null || typeof item!=='object')) return esc(value.map(display).join(', '));
  const count = Array.isArray(value) ? value.length : Object.keys(value).length;
  return `<details class="review-details"><summary>${count} ${t('entries')} · ${t('showDetails')}</summary><pre>${esc(display(value))}</pre></details>`;
}
function reviewField(entry, path) {
  const parts = Array.isArray(path) ? path : [path];
  const field = getEditableFields(entry.doc).find(field=>pathKey(field.path)===pathKey(parts));
  const section = {savedItems:'items',savedCharacterTree:'passives',savedSkillTrees:'skills',abilityBar:'skillBar'}[parts[0]];
  return `${esc(field ? localized(field.label) : section ? t(section) : parts.join('.'))}<small class="review-path">${esc(parts.join('.'))}</small>`;
}
function reviewWarnings(changedFiles) {
  const warnings = [...new Set(changedFiles.flatMap(({entry})=>entry.warnings || []))];
  return warnings.length ? `<details class="warning-box" open><summary>${t('syncNotes')} (${warnings.length})</summary><ul>${warnings.map(warning=>`<li>${esc(warningText(warning))}</li>`).join('')}</ul></details>` : '';
}
function itemEditSummary(entry) {
  return entry.itemEdits?.size ? `<ul class="item-edit-summary">${[...entry.itemEdits.values()].map(edit=>`<li><strong>${esc(localized(edit.itemName))}</strong> · ${esc(localized(edit.label))}<span>${esc(edit.before)} → ${esc(edit.after)}</span></li>`).join('')}</ul>` : '';
}

function notify(message, error = false) {
  state.toast = { message, error };
  renderToast();
}
function renderToast() {
  document.querySelector('.toast')?.remove();
  if (!state.toast) return;
  const toast = document.createElement('div');
  toast.className = `toast ${state.toast.error ? 'error' : ''}`;
  toast.setAttribute('role', state.toast.error ? 'alert' : 'status');
  toast.innerHTML = `<span>${esc(state.toast.message)}</span><button aria-label="${esc(t('close'))}">×</button>`;
  toast.querySelector('button').onclick = () => { state.toast = null; toast.remove(); };
  document.body.append(toast);
}

function nav() {
  return [['workspace','grid'],['buildTab','sword'],['filterTab','list'],['equipmentTab','box'],['editTab','sliders'],['reviewTab','list']].map(([key, symbol]) => `<button type="button" class="nav-item ${state.tab === key ? 'active' : ''}" data-tab="${key}" ${state.tab === key ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${t(key)}</span>${key === 'reviewTab' && totalChanges() ? `<span class="nav-count">${totalChanges()}</span>` : ''}</button>`).join('');
}
function fileList() {
  return [...state.files.values()].map(({doc}) => `<div class="file-row ${state.active === doc.name ? 'active' : ''}"><button type="button" class="file-select" data-file="${esc(doc.name)}">${icon(doc.kind === 'character' ? 'file' : 'box')}<span><span class="file-name">${esc(fileTitle(doc))}${fileChanges(state.files.get(doc.name)).length ? '<span class="file-dot">•</span>' : ''}</span><span class="file-type">${t(`kind_${doc.kind}`)}</span></span></button><button class="icon-button" data-remove="${esc(doc.name)}" aria-label="${esc(t('remove'))}" title="${esc(t('remove'))}">${icon('close')}</button></div>`).join('') || `<div class="sidebar-empty">${t('noFiles')}</div>`;
}
function workflow() {
  return `<div class="workflow">${['step1','step2','step3'].map((key,index) => {
    const done = index === 0 ? !!state.build : index === 1 ? !!totalChanges() : false;
    const active = index === 0 ? !state.build : index === 1 ? state.build && !totalChanges() : !!totalChanges();
    return `<div class="workflow-step ${done ? 'done' : ''} ${active ? 'current' : ''}"><span class="step-number">0${index+1}</span><span class="step-text">${t(key)}</span>${done ? icon('check').replace('<svg','<svg class="check"') : ''}</div>`;
  }).join('')}</div>`;
}
function dropPanel() {
  return `<section class="panel"><div class="panel-head"><div class="panel-head-title">${icon('file')}<h2>${t('dropTitle')}</h2></div><span class="panel-tag">LOCAL FILES</span></div><div class="panel-body"><div class="drop-area" id="drop-area"><div class="drop-symbol">${icon('upload')}</div><div class="drop-title">${t('dropLead')}</div><div class="small-note">${t('dropHint')}</div><button class="primary-button" data-choose>${icon('plus')}${t('chooseFiles')}</button></div><div class="path-note">${t('saveLocation')}<br><code>${esc(t('location'))}</code></div><div class="footnote">${icon('shield')}<span>${t('backupNote')}</span></div></div></section>`;
}
function buildDetails() {
  if (!state.build) return `<div class="build-empty">${icon('sword')}<span>${t('noBuild')}</span></div>`;
  const summary = summarizeBuild(state.build);
  return `<div class="build-summary"><div class="build-bio"><div class="class-crest">${esc(classes.en[number(summary.classId)]?.slice(0,1) || 'E')}</div><div><div class="build-name">${esc(className(summary.classId, summary.masteryId))}</div><div class="build-meta">${t('level')} ${esc(summary.level)} · ${esc(state.build.dataVersion || '')}</div></div></div><div class="build-metrics">${[[summary.equipmentCount,'equipped'],[summary.idolCount,'idolCount'],[summary.passivePoints,'points'],[summary.skillCount,'skillCount']].map(([value,key])=>`<div class="metric"><strong>${esc(value ?? 0)}</strong><span>${t(key)}</span></div>`).join('')}</div><div class="build-source"><span><span class="status-dot"></span> ${t(state.build.data?.workshopReadOnly?'saveBuildReady':'buildReady')}</span>${state.build.sourceUrl?`<a class="text-button" href="${esc(state.build.sourceUrl)}" target="_blank" rel="noopener noreferrer">${t('viewSource')} ↗</a>`:''}</div></div>`;
}
function buildPanel() {
  return `<section class="panel"><div class="panel-head"><div class="panel-head-title">${icon('link')}<h2>${t('buildTitle')}</h2></div><span class="panel-tag">LASTEPOCHTOOLS</span></div><div class="panel-body"><form id="build-form"><label for="build-url" class="input-label">${t('buildLead')}</label><div class="url-row"><input type="url" id="build-url" class="text-input" placeholder="${t('buildPlaceholder')}" value="${esc(state.buildUrl)}" required spellcheck="false" autocomplete="off"></div><div class="build-actions"><button type="submit" name="intent" value="sync" class="outline-button" ${state.loading ? 'disabled' : ''}>${t(state.loading ? 'importing' : 'syncRoute')}${state.loading ? '' : icon('arrow')}</button><button type="submit" name="intent" value="filter" class="primary-button" ${state.loading ? 'disabled' : ''}>${t('filterRoute')}${icon('arrow')}</button></div><p class="small-note">${t('filterNoSave')}</p></form><p class="small-note build-intro">${t('linkHint')}</p><button type="button" class="text-button" id="example-build" ${state.loading ? 'disabled' : ''}>${t('example')} ↗</button>${state.loading ? '<div class="progress-meter" role="progressbar" aria-label="Loading"></div>' : ''}${state.buildError ? `<p class="error-inline" role="alert">${esc(state.buildError)}</p>` : ''}${buildDetails()}</div></section>`;
}
function selectedBanner() {
  const entry = current();
  if (!entry) return '';
  const doc = entry.doc;
  const details = doc.kind === 'character' ? `${className(doc.data.characterClass,doc.data.chosenMastery)} · ${t('level')} ${display(doc.data.level)}` : t(`kind_${doc.kind}`);
  return `<div class="selected-banner"><div><div class="selected-name">${esc(fileTitle(doc))}</div><div class="selected-meta">${esc(details)} · ${esc(doc.name)}</div></div><div class="selected-actions"><button class="text-button" id="backup-file">${t('originalBackup')}</button><button class="text-button" id="reset-file" ${fileChanges(entry).length ? '' : 'disabled'}>${t('resetFile')}</button></div></div>`;
}
function emptyState(message='chooseFirst') {
  return `<section class="panel empty-state">${icon('file')}<h2>${t('noFiles')}</h2><p class="small-note">${t(message)}</p><button class="primary-button" data-choose>${icon('plus')}${t('chooseFiles')}</button></section>`;
}
function syncPanel() {
  const characters = [...state.files.values()].filter(({doc})=>doc.kind==='character');
  return `<section class="panel"><div class="panel-head"><div class="panel-head-title">${icon('sword')}<h2>${t('syncTitle')}</h2></div></div><div class="panel-body"><p class="small-note">${t('syncHint')}</p><label class="input-label" for="sync-character">${t('selectCharacter')}</label><select class="text-input" id="sync-character"><option value="">${t('noCharacter')}</option>${characters.map(({doc})=>`<option value="${esc(doc.name)}" ${state.active===doc.name ? 'selected' : ''}>${esc(fileTitle(doc))} · ${esc(className(doc.data.characterClass,doc.data.chosenMastery))}</option>`).join('')}</select><div class="option-grid">${['equipment','idols','blessings','passives','skills','skillBar'].map(key=>`<label class="check-option"><input type="checkbox" data-sync="${key}" ${state.options[key]?'checked':''}><span>${t(key)}</span></label>`).join('')}</div><p class="small-note">${t('weaverUnavailable')}</p><hr class="subtle-divider"><div class="small-note">${t('syncExtra')}</div><div class="option-grid">${[['class','syncClass'],['level','syncLevel']].map(([key,label])=>`<label class="check-option"><input type="checkbox" data-sync="${key}" ${state.options[key]?'checked':''}><span>${t(label)}</span></label>`).join('')}</div>${state.warnings.map(warning=>`<div class="warning-box">${esc(localized(warning))}</div>`).join('')}<div class="sync-actions"><button class="primary-button" id="apply-build" ${state.build && !state.build.data?.workshopReadOnly && !state.loading && current()?.doc.kind==='character' ? '' : 'disabled'}>${icon('check')}${t('applyBuild')}</button></div></div></section>`;
}
function renderField(field,index) {
  const key = pathKey(field.path);
  const value = state.fieldDrafts.has(key) ? state.fieldDrafts.get(key) : field.value;
  const fieldId = `field-${index}`;
  const label = localized(field.label) || field.path.join('.');
  let input;
  if (field.type === 'boolean') input = `<input type="checkbox" id="${fieldId}" data-field="${index}" ${value ? 'checked' : ''}>`;
  else if (field.options?.length) input = `<select id="${fieldId}" data-field="${index}">${field.options.map(option=>`<option value="${esc(option.value??option)}" ${String(option.value??option)===String(value)?'selected':''}>${esc(localized(option.label??option))}</option>`).join('')}</select>`;
  else input = `<input id="${fieldId}" data-field="${index}" type="text" ${field.type==='integer'?'inputmode="numeric"':''} value="${esc(Array.isArray(value)?value.join(', '):value)}" ${field.maxLength ? `maxlength="${field.maxLength}"` : ''} autocomplete="off" spellcheck="false" ${field.type==='integer-list'?`placeholder="${esc(t('integerList'))}"`:''}>`;
  return `<div class="field-control ${state.fieldDrafts.has(key)?'edited':''}"><label for="${fieldId}">${esc(label)}</label>${input}<small>${esc(field.path.join('.'))}</small></div>`;
}
function fieldsContent() {
  const fields = currentFields();
  const groups = new Map();
  const search = state.search.toLowerCase();
  fields.forEach((field,index)=>{
    if (state.group && state.group!==field.group) return;
    if (search && !(localized(field.label)+' '+field.path.join('.')).toLowerCase().includes(search)) return;
    const group = field.group || 'general';
    if (!groups.has(group)) groups.set(group,[]);
    groups.get(group).push({field,index});
  });
  if (!fields.length) return `<div class="empty-state">${t('noEditable')}</div>`;
  if (!groups.size) return `<div class="empty-state">${t('noResults')}</div>`;
  return [...groups].map(([group,items],index)=>`<details class="field-group" ${index<2||search||state.group?'open':''}><summary>${esc(t(`group_${group}`) !== `group_${group}` ? t(`group_${group}`) : t(group))}<span>${items.length}</span></summary><div class="field-grid">${items.map(({field,index})=>renderField(field,index)).join('')}</div></details>`).join('');
}
function editor() {
  if (!current()) return emptyState();
  const groups = [...new Set(currentFields().map(field=>field.group||'general'))];
  return `${selectedBanner()}<section class="panel"><div class="panel-head"><div><h2>${t('fieldsTitle')}</h2><p class="small-note">${t('fieldsHint')}</p></div></div><div class="editor-toolbar"><input id="field-search" class="text-input" type="search" placeholder="${t('searchFields')}" value="${esc(state.search)}" aria-label="${t('searchFields')}"><select id="group-filter" aria-label="${t('allFields')}"><option value="">${t('allFields')}</option>${groups.map(group=>`<option value="${esc(group)}" ${state.group===group?'selected':''}>${esc(t(`group_${group}`)!==`group_${group}`?t(`group_${group}`):t(group))}</option>`).join('')}</select></div><div id="editor-groups" class="editor-groups">${fieldsContent()}</div><div class="sticky-edit-actions"><span class="small-note" id="draft-count">${state.fieldDrafts.size ? `${state.fieldDrafts.size} ${t('changes')}` : ''}</span><button class="primary-button" id="save-edits" ${state.fieldDrafts.size?'':'disabled'}>${icon('check')}${t('applyEdits')}</button></div></section>`;
}
function equipmentEditor() {
  if (!current() || current().doc.kind!=='character') return emptyState('needCharacter');
  const all = currentEquipment();
  const items = all.filter(item=>item.group===state.equipmentGroup);
  const selected = items.find(item=>item.index===state.selectedEquipment) || items[0];
  if (selected) state.selectedEquipment=selected.index;
  return `${selectedBanner()}<section class="panel equipment-intro"><div><h2>${t('equipmentFromSave')}</h2><p class="small-note">${t('equipmentIntro')}</p></div><div class="row-actions"><button class="outline-button" id="read-save-build">${t('saveBuildOverview')}</button><button class="outline-button" id="export-current-save">${icon('download')}${t('exportForPlanner')}</button></div><p class="small-note planner-return">${t('nativeImportHint')} <a href="${plannerUrl()}" target="_blank" rel="noopener noreferrer">${t('openPlanner')} ↗</a></p></section><div class="equipment-groups">${['equipment','idols','blessings','inventory'].map(group=>`<button class="${state.equipmentGroup===group?'selected':''}" data-equipment-group="${group}">${t(group)} <span>${all.filter(item=>item.group===group).length}</span></button>`).join('')}</div><div class="equipment-layout"><section class="equipment-list">${items.map(item=>`<button class="equipment-card ${selected?.index===item.index?'selected':''}" data-equipment="${item.index}"><span class="equipment-slot">${esc(localized(item.slotLabel))}</span><strong>${esc(localized(item.name))}</strong><span class="small-note">${item.readOnly?t('readOnlyItem'):`${item.fields.length} ${t('editableValues')}`}</span></button>`).join('') || `<div class="panel empty-state">${t('noItems')}</div>`}</section><section class="panel equipment-detail">${selected?`<div class="panel-head"><div><span class="equipment-slot">${esc(localized(selected.slotLabel))}</span><h2>${esc(localized(selected.name))}</h2></div></div><div class="panel-body">${selected.readOnly?`<div class="warning-box">${esc(localized(selected.reason) || t('readOnlyItem'))}</div>`:`<p class="small-note">${t('rollHint')}</p><div class="equipment-fields">${selected.fields.map((field,index)=>{
    const value=state.equipmentDrafts.has(pathKey(field.path))?state.equipmentDrafts.get(pathKey(field.path)):field.value;
    return `<div class="field-control ${state.equipmentDrafts.has(pathKey(field.path))?'edited':''}"><label for="equipment-field-${index}">${esc(localized(field.label))}</label><div class="equipment-value"><input id="equipment-field-${index}" type="text" inputmode="numeric" data-equipment-field="${index}" value="${esc(value)}" autocomplete="off"><span data-roll-percent="${index}">${field.type==='roll'&&Number.isFinite(Number(value))?`${(Number(value)/255*100).toFixed(1)}%`:''}</span></div><small>${esc(field.min)}–${esc(field.max)}</small></div>`;
  }).join('')}</div><div class="equipment-actions"><button class="outline-button" id="max-equipment-rolls">${t('maxItemRolls')}</button><button class="primary-button" id="save-equipment" ${state.equipmentDrafts.size?'':'disabled'}>${t('saveItem')}</button></div>`}</div>`:''}</section></div>`;
}
function review() {
  const changedFiles = allChanges();
  if (!changedFiles.length) return `<section class="panel empty-state">${icon('list')}<h2>${t('noChanges')}</h2><p class="small-note">${t('noChangesHint')}</p></section>`;
  return `<div style="margin-bottom:20px"><h2>${t('reviewTitle')}</h2><p class="small-note">${t('reviewHint')}</p></div>${reviewWarnings(changedFiles)}${changedFiles.map(({entry,changes})=>`<section class="panel review-file"><div class="review-file-title"><span>${esc(fileTitle(entry.doc))} <span class="small-note">${esc(entry.doc.outputName||entry.doc.name)}</span></span><span class="small-note">${changes.length} ${t('changes')}</span></div>${itemEditSummary(entry)}<div class="table-scroll"><table class="diff-table"><thead><tr><th>${t('field')}</th><th>${t('before')}</th><th>${t('after')}</th></tr></thead><tbody>${changes.map(change=>`<tr><td>${reviewField(entry,change.path)}</td><td>${reviewValue(change.before)}</td><td>${reviewValue(change.after)}</td></tr>`).join('')}</tbody></table></div></section>`).join('')}`;
}
function exportPanel() {
  const count = totalChanges();
  return `<section class="export-card"><div class="export-copy">${icon('download')}<div><h3>${t('exportTitle')}</h3><p>${t('exportHint')}</p></div></div><div class="export-actions"><div class="change-total"><strong>${count}</strong><span>${t('changes')}</span></div><button class="primary-button" id="export-saves" ${count||state.fieldDrafts.size||state.equipmentDrafts.size?'':'disabled'}>${icon('download')}${t('download')}</button></div></section>`;
}
function render() {
  document.documentElement.lang = state.language==='zh'?'zh-CN':'en';
  document.title = `Epoch Workshop · ${t('app')}`;
  app.innerHTML = `<header class="app-header"><a href="#" class="brand" id="home-link" aria-label="${t('app')}"><div class="sigil"><span>E</span></div><div><div class="brand-name">${t('app')}</div><div class="brand-sub">${t('subtitle')}</div></div></a><div class="header-actions"><span class="privacy-pill">${icon('lock')}${t('local')}</span><button class="header-link" id="help-button">${t('guide')}</button><div class="language" aria-label="Language"><button data-language="zh" class="${state.language==='zh'?'selected':''}" lang="zh-CN" aria-pressed="${state.language==='zh'}">中文</button><button data-language="en" class="${state.language==='en'?'selected':''}" lang="en" aria-pressed="${state.language==='en'}">English</button></div></div></header><div class="app-body"><aside class="sidebar"><div class="rail-label">WORKSPACE</div><nav aria-label="${t('workspace')}">${nav()}</nav><div class="sidebar-divider"></div><div class="file-heading"><span>${t('filesTitle')} ${state.files.size?`(${state.files.size})`:''}</span><button class="icon-button" data-choose title="${t('addFiles')}" aria-label="${t('addFiles')}">${icon('plus')}</button></div><div class="file-list">${fileList()}</div><div class="sidebar-bottom"><div class="version"><span class="status-dot"></span>${t('gameVersion')}</div><p>${t('privacy')}</p></div></aside><main class="main"><div class="hero"><div><div class="breadcrumb">${t('eyebrow')}</div><h1>${state.tab==='workspace'?t('title'):t(state.tab)}</h1><p class="intro">${state.tab==='workspace'?t('intro'):t('versionNote')}</p></div><a class="outline-button" href="${plannerUrl()}" target="_blank" rel="noopener noreferrer">${t('openPlanner')}${icon('external')}</a></div>${state.tab==='workspace'?`${workflow()}${current()?selectedBanner():''}<div class="overview-grid">${dropPanel()}${buildPanel()}</div>`:state.tab==='buildTab'?`<div class="sync-grid">${buildPanel()}${syncPanel()}</div>`:state.tab==='filterTab'?`${buildPanel()}${renderFilterWorkbench(state)}`:state.tab==='equipmentTab'?equipmentEditor():state.tab==='editTab'?editor():review()}${state.tab==='filterTab'?'':exportPanel()}<footer class="footer"><span>${t('footer')}</span><span>${t('importLocal')}</span></footer></main></div><input type="file" id="save-input" class="visually-hidden" multiple aria-label="${t('chooseFiles')}"><dialog class="dialog" id="help-dialog"><div class="dialog-head"><h2>${t('helpTitle')}</h2><button class="icon-button" id="close-help" aria-label="${t('close')}">${icon('close')}</button></div><ol>${['help1','help2','help3','help4'].map(key=>`<li>${t(key)}</li>`).join('')}</ol><p>${t('helpNote')}</p></dialog>`;
  bindEvents();
  renderToast();
  if (state.tab!==renderedTab) { renderedTab=state.tab; window.scrollTo(0,0); }
}

function saveDrafts() {
  if ((!state.fieldDrafts.size && !state.equipmentDrafts.size) || !current()) return true;
  try {
    const edits = [...state.fieldDrafts].map(([key,value])=>({path:JSON.parse(key),value}));
    let doc = applySaveEdits(current().doc,edits);
    let equipmentResult, itemName;
    if (state.equipmentDrafts.size) {
      itemName=currentEquipment().find(item=>item.index===state.selectedEquipment)?.name;
      equipmentResult=applyEquipmentEdit(doc.data,state.selectedEquipment,[...state.equipmentDrafts].map(([key,value])=>({path:JSON.parse(key),value})));
      doc={...doc,data:equipmentResult.data};
    }
    current().doc=doc;
    if (equipmentResult) {
      current().itemEdits ||= new Map();
      for (const change of equipmentResult.changes) {
        const key=pathKey(change.path), previous=current().itemEdits.get(key);
        const summary={...change,itemName,before:previous?.before??change.before};
        if (String(summary.before)===String(summary.after)) current().itemEdits.delete(key);
        else current().itemEdits.set(key,summary);
      }
    }
    state.fieldDrafts.clear();
    state.equipmentDrafts.clear();
    return true;
  } catch (error) { notify(`${t('error')}: ${errorText(error)}`,true); return false; }
}
function switchFile(name) {
  if (!saveDrafts()) return;
  state.active = name; state.group = ''; state.search = ''; state.warnings = []; state.selectedEquipment=null; render();
}
async function loadFiles(files) {
  if (!saveDrafts()) return;
  const incoming = [...files];
  if (incoming.length>100 || incoming.reduce((sum,file)=>sum+file.size,0)>128*1024*1024) {
    notify(state.language==='zh'?'一次最多载入100个文件，总计128MB。':'Choose up to 100 files, with a combined size of 128 MB.',true); return;
  }
  const errors = []; let added = 0;
  for (const file of incoming) {
    try {
      if (file.size>32*1024*1024) throw new Error('File exceeds 32 MB.');
      if (state.files.has(file.name)) throw new Error(t('duplicate'));
      const text = await file.text();
      const original = parseSave(text,file.name);
      if ([...state.files.values()].some(entry=>entry.doc.outputName.toLowerCase()===original.outputName.toLowerCase())) throw new Error(t('duplicate'));
      const doc = parseSave(text,file.name);
      state.files.set(file.name,{original,doc}); added++;
      if ((!state.active || current()?.doc.kind!=='character' && doc.kind==='character') && saveDrafts()) { state.active = file.name; state.selectedEquipment=null; }
    } catch (error) { errors.push(`${file.name}: ${errorText(error)}`); }
  }
  if (added && current()?.doc.kind==='character') state.tab='equipmentTab';
  render();
  notify(`${added} ${t('imported')}${errors.length?`\n${t('fileReadError')}: ${errors.join('\n')}`:''}`,!!errors.length);
}
async function importBuild(input, mode = 'sync') {
  if (!saveDrafts()) return;
  state.buildMode = mode;
  if (state.build && !state.loading && input.trim() === state.loadedBuildUrl) {
    if (mode === 'filter') {
      if (!state.filterDraft) state.filterDraft = createFilterDraft(state.build);
      state.tab = 'filterTab';
    } else state.tab = 'buildTab';
    render(); return;
  }
  state.request?.abort();
  const controller = new AbortController(); state.request=controller;
  state.loading=true; state.buildUrl=input.trim(); state.buildError=''; state.build=null;
  state.filterDraft=null; state.filterStep=1; state.filterSelected=null; state.filterDirty=false;
  render();
  try {
    const build = await fetchPlannerBuild(input,{signal:controller.signal});
    if (state.request!==controller) return;
    state.build=build; state.loadedBuildUrl=input.trim(); state.warnings=[];
    if (mode === 'filter') { state.filterDraft=createFilterDraft(build); state.tab='filterTab'; }
    else state.tab='buildTab';
    notify(t('loaded'));
  } catch (error) {
    if (state.request!==controller) return;
    state.buildError=errorText(error); notify(`${t('error')}: ${errorText(error)}`,true);
  } finally {
    if (state.request===controller) { state.loading=false; state.request=null; render(); }
  }
}
function downloadFile(bytes,name,type='application/octet-stream') {
  const url=URL.createObjectURL(new Blob([bytes],{type}));
  const anchor=document.createElement('a'); anchor.href=url;anchor.download=name;document.body.append(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function applyBuild() {
  if (state.loading) return notify(t('importing'),true);
  if (!saveDrafts()) return;
  if (!current() || current().doc.kind!=='character') return notify(t('needCharacter'),true);
  if (!state.build) return notify(t('needBuild'),true);
  try {
    const result=applyPlannerBuild(current().doc.data,state.build,{...state.options});
    current().doc={...current().doc,data:result.data}; state.warnings=result.warnings||[]; current().warnings=state.warnings; current().itemEdits?.clear();
    state.tab='reviewTab'; render(); notify(t('applied'));
  } catch(error) { state.warnings=[errorText(error)]; render(); notify(`${t('error')}: ${errorText(error)}`,true); }
}
function bindFields() {
  document.querySelectorAll('[data-field]').forEach(input=>{
    input.addEventListener('input',()=>{
      const field=currentFields()[Number(input.dataset.field)];
      if (!field) return;
      const value=field.type==='boolean'?input.checked:input.value;
      const originalValue=Array.isArray(field.value)?field.value.join(', '):String(field.value);
      if (String(value)===originalValue) state.fieldDrafts.delete(pathKey(field.path)); else state.fieldDrafts.set(pathKey(field.path),value);
      input.closest('.field-control').classList.toggle('edited',state.fieldDrafts.has(pathKey(field.path)));
      document.querySelector('#save-edits').disabled=!state.fieldDrafts.size;
      document.querySelector('#draft-count').textContent=state.fieldDrafts.size?`${state.fieldDrafts.size} ${t('changes')}`:'';
    });
  });
}
function bindEquipment() {
  const selected = () => currentEquipment().find(item=>item.index===state.selectedEquipment);
  document.querySelectorAll('[data-equipment]').forEach(button=>button.onclick=()=>{
    if(!saveDrafts())return;
    state.selectedEquipment=Number(button.dataset.equipment);render();
  });
  document.querySelectorAll('[data-equipment-group]').forEach(button=>button.onclick=()=>{
    if(!saveDrafts())return;
    state.equipmentGroup=button.dataset.equipmentGroup;state.selectedEquipment=null;render();
  });
  document.querySelectorAll('[data-equipment-field]').forEach(input=>input.oninput=()=>{
    const field=selected()?.fields[Number(input.dataset.equipmentField)];if(!field)return;
    if(input.value===String(field.value))state.equipmentDrafts.delete(pathKey(field.path));else state.equipmentDrafts.set(pathKey(field.path),input.value);
    input.closest('.field-control').classList.toggle('edited',state.equipmentDrafts.has(pathKey(field.path)));
    document.querySelector('#save-equipment').disabled=!state.equipmentDrafts.size;
    document.querySelector('#export-saves').disabled=!(totalChanges()||state.equipmentDrafts.size);
    const percent=document.querySelector(`[data-roll-percent="${input.dataset.equipmentField}"]`);
    if(field.type==='roll')percent.textContent=Number.isFinite(Number(input.value))?`${(Number(input.value)/255*100).toFixed(1)}%`:'—';
  });
  document.querySelector('#save-equipment')?.addEventListener('click',()=>{if(saveDrafts()){render();notify(t('itemSaved'));}});
  document.querySelector('#max-equipment-rolls')?.addEventListener('click',()=>{
    for(const field of selected()?.fields || [])if(field.type==='roll')state.equipmentDrafts.set(pathKey(field.path),String(field.max));
    render();
  });
  document.querySelector('#export-current-save')?.addEventListener('click',()=>{
    if(!saveDrafts())return;
    downloadFile(serializeSave(current().doc),current().doc.outputName);notify(t('nativeImportHint'));
  });
  document.querySelector('#read-save-build')?.addEventListener('click',()=>{
    if(!saveDrafts())return;
    try{
      const result=saveToPlannerBuild(current().doc.data);
      state.request?.abort();state.request=null;state.loading=false;state.buildError='';
      state.filterDraft=null;state.filterStep=1;state.filterSelected=null;state.filterDirty=false;state.buildMode='sync';state.loadedBuildUrl='';
      state.build=result.build;state.buildUrl='';state.warnings=result.warnings||[];state.tab='buildTab';render();notify(t('saveBuildLoaded'));
    }catch(error){notify(`${t('error')}: ${errorText(error)}`,true);}
  });
}
function bindEvents() {
  document.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>{if(!saveDrafts())return;state.tab=button.dataset.tab;render();});
  document.querySelector('#home-link').onclick=event=>{event.preventDefault();if(!saveDrafts())return;state.tab='workspace';render();};
  document.querySelectorAll('[data-language]').forEach(button=>button.onclick=()=>{
    // Draft field values remain intact when the interface language changes.
    state.language=button.dataset.language;try{localStorage.setItem('epoch-workshop-language',state.language);}catch{}render();
  });
  document.querySelectorAll('[data-choose]').forEach(button=>button.onclick=()=>document.querySelector('#save-input').click());
  document.querySelector('#save-input').onchange=event=>loadFiles(event.target.files);
  document.querySelectorAll('[data-file]').forEach(button=>button.onclick=()=>switchFile(button.dataset.file));
  document.querySelectorAll('[data-remove]').forEach(button=>button.onclick=()=>{
    const name=button.dataset.remove;const entry=state.files.get(name);
    if ((fileChanges(entry).length || state.active===name&&(state.fieldDrafts.size||state.equipmentDrafts.size)) && !confirm(t('removeConfirm'))) return;
    state.files.delete(name); if(state.active===name){state.active=state.files.keys().next().value||null;state.fieldDrafts.clear();state.equipmentDrafts.clear();state.selectedEquipment=null;}render();
  });
  const drop=document.querySelector('#drop-area');
  if(drop){drop.ondragover=event=>{event.preventDefault();drop.classList.add('dragging');};drop.ondragleave=()=>drop.classList.remove('dragging');drop.ondrop=event=>{event.preventDefault();drop.classList.remove('dragging');loadFiles(event.dataTransfer.files);};}
  const form=document.querySelector('#build-form');
  if(form){form.onsubmit=event=>{event.preventDefault();importBuild(document.querySelector('#build-url').value, event.submitter?.value || 'sync');};document.querySelector('#build-url').oninput=event=>state.buildUrl=event.target.value;document.querySelector('#example-build').onclick=()=>importBuild(EXAMPLE,state.tab==='filterTab'?'filter':state.buildMode);}
  document.querySelectorAll('[data-sync]').forEach(input=>input.onchange=()=>state.options[input.dataset.sync]=input.checked);
  const character=document.querySelector('#sync-character');if(character)character.onchange=()=>switchFile(character.value||null);
  document.querySelector('#apply-build')?.addEventListener('click',applyBuild);
  document.querySelector('#backup-file')?.addEventListener('click',()=>downloadFile(current().original.originalText,current().original.name));
  document.querySelector('#reset-file')?.addEventListener('click',()=>{if(!confirm(t('resetConfirm')))return;current().doc=parseSave(current().original.originalText,current().original.name);state.fieldDrafts.clear();state.equipmentDrafts.clear();state.warnings=[];current().warnings=[];current().itemEdits?.clear();render();});
  document.querySelector('#save-edits')?.addEventListener('click',()=>{if(saveDrafts()){render();notify(t('changesSaved'));}});
  document.querySelector('#field-search')?.addEventListener('input',event=>{state.search=event.target.value;document.querySelector('#editor-groups').innerHTML=fieldsContent();bindFields();});
  document.querySelector('#group-filter')?.addEventListener('change',event=>{state.group=event.target.value;document.querySelector('#editor-groups').innerHTML=fieldsContent();bindFields();});
  bindFields();
  bindEquipment();
  bindFilterWorkbench(state, { render, notify, downloadFile });
  const exportSaves=document.querySelector('#export-saves');
  if(exportSaves) exportSaves.onclick=()=>{
    if(!saveDrafts())return;
    try{const docs=[...state.files.values()].map(entry=>entry.doc);const bytes=createSaveArchive(docs,{includeBackups:true});downloadFile(bytes,`LastEpoch-offline-${new Date().toISOString().replace(/[:.]/g,'-')}.zip`,'application/zip');notify(t('exportDone'));}
    catch(error){notify(`${t('error')}: ${errorText(error)}`,true);}
  };
  document.querySelector('#help-button').onclick=()=>document.querySelector('#help-dialog').showModal();
  document.querySelector('#close-help').onclick=()=>document.querySelector('#help-dialog').close();
}
window.addEventListener('beforeunload',event=>{if(totalChanges()||state.fieldDrafts.size||state.equipmentDrafts.size||state.filterDirty){event.preventDefault();event.returnValue='';}});
render();
