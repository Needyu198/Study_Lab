import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadProgress, saveProgressItem } from '../src/lib/progress.js';
function storage(){const data = new Map(); return { getItem:key=>data.get(key)??null, setItem:(key,value)=>data.set(key,value) };}
test('local progress survives a reload and keeps unrelated answers',()=>{
 const local = storage();
 assert.deepEqual(loadProgress(local),{});
 saveProgressItem('topic:history',1,local);
 saveProgressItem('question:history:0',2,local);
 assert.deepEqual(loadProgress(local),{'topic:history':1,'question:history:0':2});
});
test('rejects invalid progress values without changing storage',()=>{
 const local = storage();
 assert.throws(()=>saveProgressItem('topic:history',2,local));
 assert.throws(()=>saveProgressItem('unknown',1,local));
 assert.deepEqual(loadProgress(local),{});
});
test('storage errors propagate so the UI can report unsaved changes',()=>{
 assert.throws(()=>saveProgressItem('topic:history',1,{getItem:()=>null,setItem:()=>{throw new Error('Quota exceeded')}}),/Quota exceeded/);
});
