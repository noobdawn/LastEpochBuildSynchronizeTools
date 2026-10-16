import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import catalog from '../web/src/data/filter-catalog.json' with { type: 'json' };
import palette from '../web/src/data/filter-palette.json' with { type: 'json' };
import * as filterCore from '../web/src/core/value-filter.js';

const { createValueFilterDraft, generateValueFilter, COMMON_AFFIX_GROUPS, VALUE_FILTER_GROUPS } = filterCore;
const build = JSON.parse(readFileSync(new URL('./fixtures/planner-om6w3Ypq.json', import.meta.url), 'utf8'));
const plain = value => JSON.parse(JSON.stringify(value));
const decode = value => String(value).replace(/&(?:amp|lt|gt|quot|#39);/g, token => ({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"})[token]);
function attributes(source) {
  return Object.fromEntries([...source.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(match => [match[1],decode(match[2] ?? '')]));
}
// This harness interprets only controls; production rendering, handlers and generation run unchanged.
class Control {
  constructor(document, tag, attrs, content='') {
    this.document=document; this.attributes=attrs; this.tagName=tag.toUpperCase(); this.id=attrs.id;
    this.dataset=Object.fromEntries(Object.entries(attrs).filter(([key])=>key.startsWith('data-')).map(([key,value])=>[key.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase()),value]));
    this.value=attrs.value ?? ''; this.checked=Object.hasOwn(attrs,'checked'); this.disabled=Object.hasOwn(attrs,'disabled'); this.hidden=Object.hasOwn(attrs,'hidden'); this.open=Object.hasOwn(attrs,'open'); this.listeners={};
    const properties=new Map((attrs.style??'').split(';').filter(Boolean).map(entry=>entry.split(':').map(value=>value.trim())));
    this.style={setProperty:(name,value)=>properties.set(name,value),getPropertyValue:name=>properties.get(name)??''};
    this.classList={toggle:(name,on)=>{const names=new Set((attrs.class??'').split(' ').filter(Boolean));on?names.add(name):names.delete(name);attrs.class=[...names].join(' ');},contains:name=>(attrs.class??'').split(' ').includes(name)};
    if(tag==='select') { const options=[...content.matchAll(/<option\b([^>]*)>/g)].map(match=>attributes(match[1])); this.value=(options.find(option=>Object.hasOwn(option,'selected'))||options[0])?.value ?? ''; }
  }
  addEventListener(type,listener) { (this.listeners[type]??=[]).push(listener); }
  emit(type,value) {
    if(type==='click'&&this.disabled)return;
    if(value!==undefined)this.value=String(value);
    const event={target:this,currentTarget:this}; this[`on${type}`]?.(event);
    for(const listener of this.listeners[type]??[])listener(event);
  }
  scrollIntoView() {}
  focus() { this.document.activeElement=this; }
  set innerHTML(html) {
    assert.match(this.id,/^filter-results-/);
    const pool=this.id.slice('filter-results-'.length);
    this.document.controls=this.document.controls.filter(control=>control.dataset.filterPending!==pool);
    this.document.controls.push(...this.document.parse(html)); this.document.resultsHtml[pool]=html;
  }
}
class DocumentStub {
  controls=[]; resultsHtml={};
  parse(html) {
    return [...html.matchAll(/<(button|input|select|div|nav|p|span|details|output)\b([^>]*)>/g)].map(match=>{
      const attrs=attributes(match[2]);
      const content=match[1]==='select'?html.slice(match.index+match[0].length,html.indexOf('</select>',match.index)):'';
      return new Control(this,match[1],attrs,content);
    });
  }
  setHtml(html) { this.html=html; this.controls=this.parse(html); this.resultsHtml={}; this.renderCount=(this.renderCount??0)+1; this.activeElement=null; }
  querySelectorAll(selector) {
    if(selector.startsWith('#'))return this.controls.filter(control=>control.id===selector.slice(1));
    if(selector.startsWith('.'))return this.controls.filter(control=>(control.attributes.class??'').split(' ').includes(selector.slice(1)));
    const match=selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/); assert.ok(match,`Unsupported selector: ${selector}`);
    return this.controls.filter(control=>Object.hasOwn(control.attributes,match[1])&&(match[2]===undefined||control.attributes[match[1]]===match[2]));
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0]??null; }
}
function workbench({step=1,language='zh',patch={},useDefaultScoring=false}={}) {
  const draft=createValueFilterDraft(build);
  Object.assign(draft,patch);
  const state={tab:'filterTab',filterDraft:draft,filterStep:step,filterDirty:false,language,build};
  const document=new DocumentStub(), downloads=[], notices=[];
  const context=vm.createContext({...filterCore,catalog,palette,document,structuredClone});
  const source=readFileSync(new URL('../web/src/filter-workbench.js',import.meta.url),'utf8').replace(/^import[^\n]*\r?\n/gm,'').replace(/^export\s+/gm,'');
  vm.runInContext(source+'\nglobalThis.api={renderFilterWorkbench,bindFilterWorkbench};',context,{filename:'filter-workbench.js'});
  const render=()=>{document.setHtml(context.api.renderFilterWorkbench(state));context.api.bindFilterWorkbench(state,{render,notify:(...args)=>notices.push(args),downloadFile:(...args)=>downloads.push(args)});};
  const control=selector=>{const found=document.querySelector(selector);assert.ok(found,`Expected control ${selector}`);return found;};
  const click=selector=>control(selector).emit('click');
  const check=(element,checked)=>{assert.ok(element,'Expected checkbox');element.checked=checked;element.emit('change');};
  const inPool=(attr,pool,id)=>document.querySelectorAll(`[data-filter-${attr}]`).find(element=>element.dataset[`filter${attr[0].toUpperCase()+attr.slice(1)}`]===pool&&Number(element.dataset.affixId)===id);
  const search=(pool,query)=>control(`[data-filter-search="${pool}"]`).emit('input',query);
  render();
  return {state,document,render,control,click,check,inPool,search,downloads,notices};
}

test('five stages confirm merged Build targets instead of editing low-level rule purposes',()=>{
  const ui=workbench();
  assert.equal(ui.document.querySelectorAll('.current').length,1);
  assert.match(ui.document.html,/需求暗金/); assert.match(ui.document.html,/需求套装/);
  assert.equal(ui.document.querySelectorAll('[data-filter-toggle]').filter(input=>input.dataset.filterToggle==='unique').length,new Set(ui.state.filterDraft.uniqueIds).size);
  for(const step of [2,3,4,5]) {ui.click(`[data-filter-step="${step}"]`);assert.equal(ui.state.filterStep,step);}
  assert.equal(ui.document.querySelectorAll('[data-filter-group-show]').length,VALUE_FILTER_GROUPS.length-1);
  assert.equal(ui.document.querySelectorAll('[data-filter-family]').length,6);
  assert.equal(ui.control('[data-filter-family="equipment"]').open,true);
  assert.equal(ui.control('[data-filter-family="resources"]').open,false);
  assert.doesNotMatch(ui.document.html,/data-filter-row-field|data-filter-row-number|传奇供体|拆解碎片|编辑需求/);
});

test('Chinese multiselect search keeps pending choices across queries and separates sets from uniques',()=>{
  const ui=workbench({patch:{uniqueIds:[],setIds:[]}});
  ui.search('unique','红戒指'); ui.check(ui.inPool('pending','unique',277),true);
  ui.search('unique','66'); ui.check(ui.inPool('pending','unique',66),true);
  assert.equal(ui.control('[data-filter-add-selected="unique"]').disabled,false);
  ui.click('[data-filter-add-selected="unique"]');
  assert.deepEqual(plain(ui.state.filterDraft.uniqueIds),[277,66]);
  assert.equal(ui.state.filterUi.pending.unique.length,0);
  ui.search('set','79'); ui.check(ui.inPool('pending','set',79),true); ui.click('[data-filter-add-selected="set"]');
  assert.deepEqual(plain(ui.state.filterDraft.setIds),[79]);
  ui.search('unique',catalog.uniques[79].name.zh);
  assert.equal(ui.inPool('pending','unique',79),undefined);
  ui.search('set','红戒指');assert.equal(ui.inPool('pending','set',277),undefined);
  ui.inPool('remove','unique',277).emit('click');assert.deepEqual(plain(ui.state.filterDraft.uniqueIds),[66]);
});

test('high-value promotion removes a medium selection and clearing keeps candidates available',()=>{
  const ui=workbench({step:2,patch:{highAffixIds:[],mediumAffixIds:[36]}});
  ui.search('high','复合生命');ui.check(ui.inPool('pending','high',36),true);ui.click('[data-filter-add-selected="high"]');
  assert.deepEqual(plain(ui.state.filterDraft.highAffixIds),[36]);assert.deepEqual(plain(ui.state.filterDraft.mediumAffixIds),[]);
  ui.click('[data-filter-step="3"]');assert.equal(ui.inPool('toggle','medium',36),undefined,'high selection must not also appear in medium');
  ui.click('[data-filter-step="2"]');ui.check(ui.inPool('toggle','high',36),false);
  assert.ok(ui.inPool('toggle','high',36),'unchecking retains the visible candidate');
  ui.click('[data-filter-step="3"]');ui.check(ui.inPool('toggle','medium',36),true);
  assert.deepEqual(plain(ui.state.filterDraft.highAffixIds),[]);assert.deepEqual(plain(ui.state.filterDraft.mediumAffixIds),[36]);
});

test('medium categories start selected except high conflicts and support category and whole-pool changes',()=>{
  const ui=workbench({step:3});
  const expected=[...new Set(COMMON_AFFIX_GROUPS.flatMap(group=>group.affixIds))].filter(id=>!ui.state.filterDraft.highAffixIds.includes(id));
  assert.deepEqual([...ui.state.filterDraft.mediumAffixIds].sort((a,b)=>a-b),expected.sort((a,b)=>a-b));
  const category='common-resistances';
  const bulk=choice=>ui.document.querySelectorAll('[data-filter-bulk]').find(button=>button.dataset.filterCategory===category&&button.dataset.filterChoice===choice);
  bulk('none').emit('click');
  assert.ok(COMMON_AFFIX_GROUPS.find(group=>group.id==='resistances').affixIds.every(id=>!ui.state.filterDraft.mediumAffixIds.includes(id)));
  bulk('all').emit('click');
  assert.ok(COMMON_AFFIX_GROUPS.find(group=>group.id==='resistances').affixIds.every(id=>ui.state.filterDraft.highAffixIds.includes(id)||ui.state.filterDraft.mediumAffixIds.includes(id)));
  const clearAll=ui.document.querySelectorAll('[data-filter-bulk]').find(button=>!button.dataset.filterCategory&&button.dataset.filterChoice==='none');clearAll.emit('click');
  assert.equal(ui.state.filterDraft.mediumAffixIds.length,0);
  assert.ok(ui.document.querySelectorAll('[data-filter-toggle]').length>30,'cleared defaults stay visible for reconsideration');
});

test('catalog search shares the generator domain, includes special affixes, and excludes inherent unique variants',()=>{
  const ui=workbench({step:2,patch:{highAffixIds:[]}});
  const special=Object.values(catalog.affixes).find(a=>a.specialAffixType===6&&filterCore.isValueEquipmentAffix(a));
  assert.ok(special);ui.search('high',String(special.id));assert.ok(ui.inPool('pending','high',special.id));
  const inherent=Object.values(catalog.affixes).find(a=>a.specialAffixType===7);
  assert.ok(inherent);ui.search('high',String(inherent.id));assert.equal(ui.inPool('pending','high',inherent.id),undefined);
  const idolOnly=Object.values(catalog.affixes).find(a=>a.canRollOn.every(type=>type>=25&&type<=33));
  ui.search('high',String(idolOnly.id));assert.equal(ui.inPool('pending','high',idolOnly.id),undefined);
});

test('idol needs use compatible prefix and suffix selections and clear incompatible affixes after shape changes',()=>{
  const ui=workbench({step:2,patch:{idols:[]}});ui.click('#filter-add-idol');
  const idol=ui.state.filterDraft.idols[0];
  const affixInput=type=>ui.document.querySelectorAll('[data-filter-idol-affix]').find(input=>Number(input.dataset.affixType)===type);
  affixInput(0).emit('change','108');affixInput(1).emit('change','114');
  assert.deepEqual(plain(idol.affixIds),[108,114]);
  ui.control(`[data-filter-idol-shape="${idol.id}"]`).emit('change','28');assert.deepEqual(plain(idol.affixIds),[]);
  affixInput(0).emit('change','107');affixInput(1).emit('change','117');
  assert.deepEqual(plain(idol.affixIds),[107,117]);
  ui.click('[data-filter-step="5"]');assert.equal(ui.control('#filter-download').disabled,false);ui.click('#filter-download');
  assert.match(ui.downloads[0][0],/<EquipmentType>IDOL_1x2<\/EquipmentType>/);
  ui.click('[data-filter-step="2"]');ui.control(`[data-filter-idol-remove="${idol.id}"]`).emit('click');assert.equal(ui.state.filterDraft.idols.length,0);
});

test('group visibility and styles persist with language, stage and disclosure changes and affect real XML',()=>{
  const ui=workbench({step:5});
  const family=ui.control('[data-filter-family="resources"]');family.open=true;family.emit('toggle');
  ui.control('[data-filter-group-show="glyph"]').emit('change','hide');
  assert.equal(ui.control('[data-filter-family="resources"]').open,true);
  ui.control('[data-filter-group-color="unique_needed"]').emit('change','9');
  ui.check(ui.control('[data-filter-group-emphasis="unique_needed"]'),false);
  const before=plain(ui.state.filterDraft);
  ui.click('[data-filter-step="1"]');ui.state.language='en';ui.render();ui.click('[data-filter-step="5"]');
  assert.deepEqual(plain(ui.state.filterDraft),before);
  ui.control('#filter-name').emit('input','Skeleton / value');ui.click('#filter-download');
  assert.equal(ui.downloads.length,1);assert.equal(ui.downloads[0][1],'Skeleton _ value.xml');assert.equal(ui.state.filterDirty,false);
  assert.match(ui.downloads[0][0],/Needed uniques/);
  const rules=generateValueFilter({...ui.state.filterDraft,language:'en'}).rules;
  const glyph=rules.find(rule=>rule.groupId==='glyph');assert.equal(glyph.type,'HIDE');
  const needed=rules.find(rule=>rule.groupId==='unique_needed');assert.equal(needed.style.color,9);assert.equal(needed.style.emphasized,false);
});

test('all additional idol affixes remain visible and can be removed independently',()=>{
  const extra=Object.values(catalog.affixes).find(a=>a.id!==108&&a.type===0&&filterCore.isValueIdolAffix(a,25));
  assert.ok(extra);
  const idol={id:'three-affix-idol',baseTypeId:25,subTypeId:0,affixIds:[108,114,extra.id],enabled:true};
  const ui=workbench({step:2,patch:{idols:[idol]}});
  assert.equal(ui.document.querySelectorAll('[data-filter-idol-affix-remove]').length,3);
  const remove=ui.document.querySelectorAll('[data-filter-idol-affix-remove]').find(button=>Number(button.dataset.affixId)===extra.id);
  remove.emit('click');assert.deepEqual(plain(idol.affixIds),[108,114]);
  assert.equal(ui.document.querySelectorAll('[data-filter-idol-affix-remove]').length,2);
});

test('correcting the filter name immediately restores download and escaping cannot inject controls',()=>{
  const ui=workbench({step:5});ui.control('#filter-name').emit('input','');
  assert.equal(ui.control('#filter-download').disabled,true);assert.equal(ui.control('#filter-export-error').hidden,false);
  ui.control('#filter-name').emit('input','价值 <input> & 中文');
  assert.equal(ui.control('#filter-download').disabled,false);assert.equal(ui.control('#filter-export-error').hidden,true);
  ui.render();assert.match(ui.document.html,/价值 &lt;input&gt; &amp; 中文/);
  ui.click('#filter-download');assert.equal(ui.downloads.length,1);assert.match(ui.downloads[0][0],/<name>价值 &lt;input&gt; &amp; 中文<\/name>/);
});

test('replacing a build resets only the value wizard UI candidate state',()=>{
  const ui=workbench({patch:{uniqueIds:[],setIds:[]}});ui.search('unique','红戒指');
  ui.check(ui.inPool('pending','unique',277),true);ui.click('[data-filter-add-selected="unique"]');
  assert.ok(ui.state.filterUi.candidates.unique.includes(277));
  const replacement=createValueFilterDraft(build);ui.state.filterDraft=replacement;ui.render();
  assert.deepEqual(plain(ui.state.filterUi.candidates.unique),replacement.uniqueIds);
  assert.equal(ui.state.filterUi.query.unique,undefined);
});



test('fixed categories have no score, threshold, add, delete or rename controls',()=>{
  const ui=workbench({step:5});
  for(const name of ['核心词缀崇高装备','有效词缀崇高装备','考虑打造装备','开荒过渡装备'])assert.match(ui.document.html,new RegExp(name));
  assert.equal(ui.document.querySelectorAll('[data-filter-group-show]').filter(c=>c.dataset.filterGroupShow.startsWith('equipment_')).length,4);
  assert.doesNotMatch(ui.document.html,/data-filter-score|data-filter-equipment|filter-add-equipment-group|词缀评分|近似过滤/);
  ui.control('[data-filter-group-show="equipment_leveling"]').emit('change','hide');
  ui.click('#filter-download');
  assert.equal(ui.downloads.length,1);
  const rules=generateValueFilter(ui.state.filterDraft).rules;
  assert.equal(rules.find(r=>r.groupId==='equipment_leveling').type,'HIDE');
});

test('hidden-types page changes equipment families and exact class idols and preserves them across navigation',()=>{
  const ui=workbench({step:4});
  ui.state.filterDraft.build.classId=1;ui.render();
  ui.click('[data-filter-exclude-family="twohand"]');
  assert.deepEqual(plain(ui.state.filterDraft.exclusions.equipmentTypeIds),[12,13,14,15,16]);
  ui.check(ui.control('[data-filter-exclude-class="4"]'),true);
  assert.ok(ui.state.filterDraft.exclusions.idolBaseKeys.includes('30:4'));
  assert.ok(!ui.state.filterDraft.exclusions.idolBaseKeys.includes('30:1'));
  ui.check(ui.control('[data-filter-exclude-base="30:4"]'),false);
  assert.equal(ui.control('[data-filter-exclude-class="4"]').indeterminate,true);
  ui.click('#filter-hide-other-class-idols');
  assert.ok(ui.state.filterDraft.exclusions.idolBaseKeys.includes('30:4'));
  assert.ok(!ui.state.filterDraft.exclusions.idolBaseKeys.includes('30:1'));
  const before=plain(ui.state.filterDraft.exclusions);
  ui.click('[data-filter-step="5"]');ui.state.language='en';ui.render();
  assert.deepEqual(plain(ui.state.filterDraft.exclusions),before);
  ui.click('#filter-download');assert.equal(ui.downloads.length,1);
  const output=generateValueFilter(ui.state.filterDraft);
  assert.equal(output.rules[0].type,'HIDE');assert.equal(output.rules[0].groupId,'excluded');
  ui.click('[data-filter-step="4"]');ui.click('#filter-clear-exclusions');
  assert.deepEqual(plain(ui.state.filterDraft.exclusions),{equipmentTypeIds:[],idolTypeIds:[],idolBaseKeys:[]});
});
