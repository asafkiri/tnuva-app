import test from 'node:test';import assert from 'node:assert/strict';
import {phone,createCloud,root,settle} from './returns-events-harness.mjs';
const alive=[];test.afterEach(()=>{while(alive.length)alive.pop().stop();});
async function setup({saved=false,other=false,qty=4}={}){
 const c=createCloud();
 const payload={schemaVersion:1,draftId:'return-133',slot:'weekly',items:[{productId:'milk',name:'בדיקה',qty}],date:'2026-10-06',note:'בדיקה'};
 c.put(root+'drafts/handoff_tnuva_returns_weekly_return-133',{handoff:1,app:'tnuva',kind:'returns_weekly',openKey:'tnuva:returns_weekly',sessionId:'return-133',recordId:'return-133',deviceId:'B',gen:2,state:'open',payload:JSON.stringify(payload)});
 c.put(root+'drafts/returns',{schemaVersion:2,draftIds:{weekly:other?'different':'return-133'},slots:{weekly:[{productId:'milk',qty:other?2:9}],daily:[]},dates:{},active:'weekly',updatedAt:1});
 if(saved)c.put(root+'returns/return-133',{items:[{productId:'milk',qty:4}]});
 const storage=new Map([['tn_handoff_returns_weekly_away',JSON.stringify({sessionId:'return-133',away:'moved',gen:2})],['tn_returns_draft',JSON.stringify({draftIds:{weekly:'return-133'},slots:{weekly:[{productId:'milk',qty:9}],daily:[]}})]]);
 const p=await phone(c,{storage,start:false});alive.push(p);return {c,p};
}
test('v133 transfer imports the current owner into events and retains the older local copy',async()=>{
 const {c,p}=await setup();await p.run('startReturnsLive()');assert.equal(c.get(root+'drafts/returns').slots.weekly[0].qty,9,'legacy is read-only');assert.equal(p.run('returnsList[0].qty'),4);assert.equal(c.get(root+'drafts/handoff_tnuva_returns_weekly_return-133').state,'canceled');assert.equal(p.run("returnsRecoveryLocal()['local_return-133'].items[0].qty"),9);assert.match(p.run('returnsRecoveryHtml()'),/לעיון בלבד/);assert.equal(p.requests.length,0);
});
test('an independent live draft is preserved, and the v133 draft remains recoverable',async()=>{
 const {c,p}=await setup({other:true});await p.run('startReturnsLive()');assert.equal(p.run('returnsList[0].qty'),2);assert.equal(p.run("returnsRecoveryLocal()['return-133'].items[0].qty"),4);assert.equal(c.get(root+'drafts/returns').slots.weekly[0].qty,2);
});
test('offline and full storage do not discard or close a conflicting v133 draft',async()=>{
 const {c,p}=await setup({other:true});p.online(false);await p.run('startReturnsLive()');assert.equal(p.run("returnsRecoveryLocal()['local_return-133'].items[0].qty"),9);p.online(true);p.context.localStorage.setItem=()=>{throw Error('quota')};await p.run('startReturnsLive()');assert.equal(c.get(root+'drafts/handoff_tnuva_returns_weekly_return-133').state,'open');assert.equal(c.get(root+'drafts/returns_events_tnuva_v1'),null);
});
test('two phones migrating concurrently preserve a later live edit with a transaction retry',async()=>{
 const {c,p}=await setup();let release;c.commitGate=new Promise(r=>release=r);const running=p.run('startReturnsLive()');await settle();c.put(root+'drafts/returns',{schemaVersion:2,slots:{weekly:[{productId:'milk',qty:7}],daily:[]},draftIds:{weekly:'new-live'},updatedAt:2});release();await running;assert.equal(c.get(root+'drafts/returns').slots.weekly[0].qty,7);assert.equal(p.run('returnsList[0].qty'),7);assert.equal(p.run("returnsRecoveryLocal()['return-133'].items[0].qty"),4);assert.ok(c.transactionRetries>0);
});
test('a record already finalized in v133 is never reopened as an event draft',async()=>{const {c,p}=await setup({saved:true});await p.run('startReturnsLive()');assert.equal(c.get(root+'drafts/returns').slots.weekly.length,1,'legacy snapshot is untouched');assert.equal(p.run('returnsList.length'),0);assert.equal(c.paths('/returns/').length,1);});
