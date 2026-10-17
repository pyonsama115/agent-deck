'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function load() {
  const storage = new Map();
  const context = { console, Date, Math, matchMedia: () => ({ matches: false }), localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v) }, document: { body: { dataset: {} }, dispatchEvent() {} }, CustomEvent: class { constructor(type,options){this.type=type;this.detail=options.detail;} } };
  context.window = context;
  vm.createContext(context);
  for (const name of ['actors.js','scenes.js','motion-scenes.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../public',name),'utf8'),context,{filename:name});
  return context;
}
function sound(svg) {
  assert.match(svg,/^<svg\b/);
  assert.match(svg,/<\/svg>$/);
  assert.doesNotMatch(svg,/\b(?:NaN|undefined|Infinity)\b/);
  assert.doesNotMatch(svg,/<(?:script|foreignObject)\b/i);
  const stack = [];
  for (const match of svg.matchAll(/<\/?([a-zA-Z][\w:-]*)\b[^>]*>/g)) {
    const tag=match[0], name=match[1];
    if(tag.startsWith('</')) assert.equal(stack.pop(),name,`unbalanced ${name}`);
    else if(!tag.endsWith('/>')) stack.push(name);
  }
  assert.equal(stack.length,0,'all SVG elements must close');
}
test('every authored scene and character renders for both providers',()=>{
  const c=load(), entries=c.MotionScenes.catalogue, models=c.MotionActors.models;
  assert.ok(entries.length >= 60);
  for(const state of Object.keys(c.MotionScenes.stateNames)) assert.ok(entries.filter(e=>e.state===state).length>=4);
  assert.equal(models.length,16);
  assert.equal(new Set(models.map(m=>m.id)).size,models.length);
  assert.equal(new Set(entries.map(e=>`${e.state}:${e.id}`)).size,entries.length);
  for(const provider of ['claude','codex']) for(const entry of entries) for(const model of models) {
    const svg=c.Scenes.buildScene(provider,entry.state,{variant:entry.index,look:model.index,minis:3,seed:'test'});
    sound(svg);
    assert.match(svg,new RegExp(`data-scene="${entry.state}"`));
    if(entry.index>0){assert.match(svg,new RegExp(`data-look="${model.index}"`));assert.match(svg,new RegExp(`data-variant="${entry.id}"`));}
  }
});
test('selection stays stable for the same session and respects explicit model and scene',()=>{
  const c=load();c.MotionScenes.configure({rotation:'off'});
  const first=JSON.stringify(c.MotionScenes.selection('edit','session-1'));
  assert.equal(JSON.stringify(c.MotionScenes.selection('edit','session-1')),first);
  for(let look=0;look<16;look++) for(let variant=0;variant<4;variant++) {
    const selection=c.MotionScenes.selection('edit','session-1',{look,variant});
    assert.equal(selection.look,look);assert.equal(selection.variant,variant);
  }
});
test('unknown session metadata falls back to a valid scene',()=>{
  const c=load();
  for(const variant of [0,1,2,3]) sound(c.Scenes.buildScene('unknown','unknown',{variant,look:0}));
});
test('observed crew count is capped visually without inventing active workers',()=>{
  const c=load();
  for(const provider of ['claude','codex']) for(const variant of [0,1,2,3]) for(const count of [null,0,1,3,7,24]) {
    const svg=c.Scenes.buildScene(provider,'agent',{variant,look:2,minis:count});sound(svg);
    const visible=(svg.match(/class="mini job-/g)||[]).length;
    assert.equal(visible,Math.min(6,count||0),`${provider} variant ${variant}, observed ${count}`);
    if(variant>0 && count>6) assert.match(svg,new RegExp(`実働 ${count}体`));
  }
});
test('idle companions never claim to be observed subagents',()=>{
  const c=load();
  for(const variant of [1,2,3]){
    const svg=c.Scenes.buildScene('claude','standby',{variant,look:4,minis:9});
    assert.match(svg,/待機中の仲間 · 演出/);assert.doesNotMatch(svg,/実働/);
  }
});


