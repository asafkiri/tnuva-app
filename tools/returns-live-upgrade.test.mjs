import test from 'node:test';import assert from 'node:assert/strict';
import {phone,createCloud,root,json} from './handoff-harness.mjs';
const alive=[];test.afterEach(()=>{while(alive.length)alive.pop().stop();});
function setup({saved=false,other=false,qty=4}={}){
 const c=createCloud(),p=phone(c,{start:false});alive.push(p);p.context.setTimeout=(fn,ms)=>{const t=setTimeout(fn,ms);t.unref();return t;};p.context.clearTimeout=clearTimeout;
 const payload={schemaVersion:1,draftId:'return-133',slot:'weekly',items:[{productId:'milk',name:'בדיקה',qty}],date:'2026-10-06',note:'בדיקה'};
 c.put(root+'drafts/handoff_tnuva_returns_weekly_return-133',{handoff:1,app:'tnuva',kind:'returns_weekly',openKey:'tnuva:returns_weekly',sessionId:'return-133',recordId:'return-133',deviceId:'B',gen:2,state:'open',payload:JSON.stringify(payload)});
 c.put(root+'drafts/returns',{schemaVersion:2,draftIds:{weekly:other?'different':'return-133'},slots:{weekly:[{productId:'milk',qty:other?2:9}],daily:[]},dates:{},active:'weekly',updatedAt:1});
 if(saved)c.put(root+'returns/return-133',{items:[{productId:'milk',qty:4}]});
 p.storage.set('tn_handoff_returns_weekly_away',JSON.stringify({sessionId:'return-133',away:'moved',gen:2}));
 p.run("returnsDraftIds.weekly='return-133';returnsList=[{productId:'milk',qty:9}];returnsSlots.weekly=returnsList;saveReturnsDraft()");
 p.context.getDocsFromServer=async q=>({docs:c.paths(q.path+'/').map(k=>({id:k.split('/').at(-1),data:()=>c.get(k)})).filter(d=>q.wheres.every(w=>d.data()[w.field]===w.value))});
 return {c,p};
}
test('v133 transfer imports the current owner into live returns and retains the older local copy',async()=>{
 const {c,p}=setup();await p.run('migrateReturns133()');assert.equal(c.get(root+'drafts/returns').slots.weekly[0].qty,4);assert.equal(p.run('returnsList[0].qty'),4);assert.equal(c.get(root+'drafts/handoff_tnuva_returns_weekly_return-133').state,'canceled');assert.equal(json(p,'returnsRecoveryLocal()')['local_return-133'].items[0].qty,9);assert.match(p.run('returnsRecoveryHtml()'),/פתח את העותק/);assert.equal(p.requests.length,0);
});
test('an independent live draft is preserved, and the v133 draft remains recoverable',async()=>{
 const {c,p}=setup({other:true});await p.run('migrateReturns133()');const d=c.get(root+'drafts/returns');assert.equal(d.slots.weekly[0].qty,2);assert.equal(d.v133Recovery['return-133'].items[0].qty,4);
});
test('offline and full storage do not close or replace a v133 draft',async()=>{
 const {c,p}=setup();p.online(false);await assert.rejects(()=>p.run('migrateReturns133()'));assert.equal(p.run('returnsList[0].qty'),9);p.online(true);p.context.localStorage.setItem=()=>{throw Error('quota')};await assert.rejects(()=>p.run('migrateReturns133()'));assert.equal(c.get(root+'drafts/handoff_tnuva_returns_weekly_return-133').state,'open');
});
test('two phones migrating concurrently cannot overwrite a later live edit',async()=>{
 const {c,p}=setup();let release;c.commitGate=new Promise(r=>release=r);const running=p.run('migrateReturns133()');await new Promise(r=>setTimeout(r,20));c.put(root+'drafts/returns',{schemaVersion:2,slots:{weekly:[{productId:'milk',qty:7}],daily:[]},draftIds:{weekly:'new-live'},updatedAt:2});release();await assert.rejects(()=>running);assert.equal(c.get(root+'drafts/returns').slots.weekly[0].qty,7);assert.equal(p.run('returnsList[0].qty'),9);
});

test('a record already finalized in v133 is never reopened as a live draft',async()=>{const {c,p}=setup({saved:true});await p.run('migrateReturns133()');assert.equal(c.get(root+'drafts/returns').slots.weekly.length,0);assert.equal(p.run('returnsList.length'),0);assert.equal(c.paths('/returns/').length,1);});
