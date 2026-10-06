import test from 'node:test';
import assert from 'node:assert/strict';
import {phone,createCloud,root,settle} from './returns-events-harness.mjs';
const qty=(p,id='milk')=>p.items().find(x=>x.productId===id)?.qty||0;
const records=c=>c.paths(root+'returns/').map(path=>({id:path.split('/').at(-1),...c.get(path)}));
const pair=async()=>{const c=createCloud(),a=await phone(c),b=await phone(c);return {c,a,b};};
test('offline scan and another online phone both survive reconnect',async()=>{
 const {c,a,b}=await pair();a.online(false);a.scan('milk',2);b.scan('coffee',3);await b.flush();a.online(true);await a.flush();await settle();assert.equal(qty(a),2);assert.equal(qty(a,'coffee'),3);assert.equal(qty(b),2);a.stop();b.stop();
});
test('simultaneous same-second scans of the same product add their quantities',async()=>{
 const {c,a,b}=await pair();a.scan('milk',2);b.scan('milk',3);await Promise.all([a.flush(),b.flush()]);await settle();assert.equal(qty(a),5);assert.equal(qty(b),5);a.stop();b.stop();
});
test('phone clocks hours apart cannot discard any quantity',async()=>{
 const {a,b}=await pair();a.run('Date.now=()=>1800000000000+36000000');b.run('Date.now=()=>1800000000000-36000000');a.scan('milk',2);await a.flush();b.scan('coffee',3);await b.flush();assert.equal(qty(a),2);assert.equal(qty(a,'coffee'),3);assert.equal(qty(b),2);a.stop();b.stop();
});
test('send followed immediately by remote scan leaves only new scan and immutable earlier record',async()=>{
 const {c,a,b}=await pair();a.scan('milk',2);await a.flush();b.online(false);await a.send();const first=records(c)[0];assert.equal(first.items.find(x=>!x.isDeposit).qty,2);b.scan('milk',1);b.online(true);await b.flush();assert.equal(qty(a),1);assert.deepEqual(records(c)[0],first);await a.send();assert.equal(records(c).length,2);assert.deepEqual(records(c).find(x=>x.id===first.id),first);a.stop();b.stop();
});
test('two phones pressing send create exactly one return record',async()=>{
 const {c,a,b}=await pair();a.scan('milk',2);await a.flush();a.run('openReturnsSend()');b.run('openReturnsSend()');await Promise.all([a.run('saveReturnsWithoutSending()'),b.run('saveReturnsWithoutSending()')]);await settle();assert.equal(records(c).length,1);assert.equal(c.writes.filter(w=>w.path.startsWith(root+'returns/')&&w.op==='set').length,1,'create once; no second overwrite');assert.equal(qty(a),0);assert.equal(qty(b),0);a.stop();b.stop();
});
test('week-old phone can scan offline without resurrecting last week items',async()=>{
 const {c,a,b}=await pair();a.scan('milk',2);await a.flush();const storage=new Map(b.storage);b.stop();await a.send();const stale=await phone(c,{storage,online:false});stale.scan('coffee',1);stale.online(true);await stale.flush();assert.equal(qty(stale),0);assert.equal(qty(stale,'coffee'),1);assert.equal(records(c).length,1);a.stop();stale.stop();
});
test('manual rows, date, note, daily crates, discount and deposit are preserved in server-built record',async()=>{
 const {c,a,b}=await pair();a.run("products[0].deposit=0.3;returnsDocDate='2026-10-05';returnsDraftNotes.weekly='הערת בדיקה';saveReturnsDraft()");a.scan('milk',2);a.run("returnsList.push({productId:'manual_test',name:'ידני בדיקה',manual:true,unitPrice:7,qty:3});saveReturnsDraft();switchReturnsSlot('daily')");a.scan('coffee',4);await a.flush();a.run("switchReturnsSlot('weekly')");await a.send();const r=records(c)[0];assert.equal(r.docDate,'2026-10-05');assert.equal(r.note,'הערת בדיקה');assert.equal(r.items.find(x=>x.isDeposit).qty,2);assert.equal(r.items.find(x=>x.name==='ידני בדיקה').unitPrice,7);assert.equal(a.run('returnsSlots.daily[0].qty'),4);a.stop();b.stop();
});
test('remote scan after send summary opens is included by transaction server read',async()=>{
 const {c,a,b}=await pair();a.scan('milk',1);await a.flush();a.run('openReturnsSend()');b.scan('coffee',2);await b.flush();await a.run('saveReturnsWithoutSending()');assert.equal(records(c)[0].items.filter(x=>!x.isDeposit).reduce((s,x)=>s+x.qty,0),3);a.stop();b.stop();
});
test('legacy migration happens once and ignores closed draft and old local cache',async()=>{
 const c=createCloud();c.put(root+'drafts/returns',{schemaVersion:2,draftIds:{weekly:'old_return'},slots:{weekly:[{productId:'milk',qty:9}],daily:[{productId:'coffee',qty:3}]}});c.put(root+'returns/old_return',{items:[{productId:'milk',qty:9}]});
 const storage=new Map([['tn_returns_draft',JSON.stringify({slots:{weekly:[{productId:'milk',qty:200}],daily:[]},draftIds:{weekly:'stale'}})]]);
 const [a,b]=await Promise.all([phone(c,{storage}),phone(c)]);assert.equal(qty(a),0);assert.equal(a.run('returnsSlots.daily[0].qty'),3);assert.equal(b.run('returnsSlots.daily[0].qty'),3);assert.equal(a.run("returnsRecoveryLocal().local_stale.items[0].qty"),200);assert.equal(c.get(root+'drafts/returns').slots.weekly[0].qty,9);a.stop();b.stop();
});
test('old queue is archived and cannot replace the event stream or final record',async()=>{
 const c=createCloud();const old=[{id:'legacyq',actionName:'save returns draft',task:{op:'set',path:(root+'drafts/returns').split('/'),data:{items:[{productId:'milk',qty:200}]}}}];const a=await phone(c,{storage:new Map([['tn_cloud_failed_writes_v1',JSON.stringify(old)]])});assert.equal(a.run('cloudFailedWrites.length'),0);assert.ok(a.storage.get('tn_returns_legacy_writes_v137'));a.scan('milk',1);await a.flush();assert.equal(c.get(root+'drafts/returns'),null);a.stop();
});
test('returning rejected items from history adds events atomically with reducing the original record',async()=>{
 const {c,a,b}=await pair();const record={items:[{name:'חלב בדיקה',barcode:'7290000000008',qty:4,unitPrice:5,lineTotal:20},{name:'פיקדון · חלב בדיקה',isDeposit:true,qty:4,unitPrice:.3,lineTotal:1.2}],credited:false,vatPct:18,totalExVat:21.2,totalIncVat:25.016};c.put(root+'returns/prior',record);
 for(const p of [a,b]){p.context.returnFixture=record;p.run("returns=[{id:'prior',...structuredClone(returnFixture)}]");}
 await Promise.all([a.run("retReturnApply('prior',returns[0].items.filter(x=>!x.isDeposit),[2],null)"),b.run("retReturnApply('prior',returns[0].items.filter(x=>!x.isDeposit),[2],null)")]);await settle();assert.equal(c.get(root+'returns/prior').items[0].qty,2);assert.equal(c.get(root+'returns/prior').items[1].qty,2);assert.equal(qty(a),2);a.stop();b.stop();
});
test('lost reply during history-to-draft movement can be retried without a second movement',async()=>{
 const {c,a,b}=await pair();const record={items:[{name:'חלב בדיקה',barcode:'7290000000008',qty:4,unitPrice:5,lineTotal:20}],credited:false,vatPct:18};c.put(root+'returns/prior',record);a.context.returnFixture=record;a.run("returns=[{id:'prior',...structuredClone(returnFixture)}]");c.loseReplyAfterCommit=true;
 await a.run("retReturnApply('prior',returns[0].items,[2],null)");c.loseReplyAfterCommit=false;await a.run("retReturnApply('prior',returns[0].items,[2],null)");await settle();assert.equal(c.get(root+'returns/prior').items[0].qty,2);assert.equal(qty(a),2);a.stop();b.stop();
});
test('storage failure never overwrites the only copy of a legacy local return',async()=>{
 const c=createCloud(),a=await phone(c);a.stop();const legacy=JSON.stringify({slots:{weekly:[{productId:'milk',qty:97}],daily:[]}});a.storage.set('tn_returns_draft',legacy);a.context.localStorage.setItem=()=>{throw Error('quota')};a.run('returnsEvents=null;restoreReturnsDraft()');assert.equal(a.storage.get('tn_returns_draft'),legacy);
});
test('opening and sending from a stale input never overwrites a remote date or note',async()=>{
 const {c,a,b}=await pair();a.scan('milk',1);await a.flush();a.node('retDocDate').value='2026-09-01';b.run("returnsDocDate='2026-10-06';returnsDraftNotes.weekly='הערה חדשה';saveReturnsDraft()");await b.flush();a.node('retDocDate').value='2026-09-01';a.node('orderNote').value='ישן';await a.send();assert.equal(records(c)[0].docDate,'2026-10-06');assert.equal(records(c)[0].note,'הערה חדשה');a.stop();b.stop();
});
test('bulk backup restore cannot delete or replay the ledger or overwrite an event-saved return',async()=>{
 const {c,a,b}=await pair();a.scan('milk',2);await a.flush();await a.send();const record=records(c)[0],ledger=c.get(root+'drafts/returns_events_tnuva_v1');
 a.context.getDocs=async ref=>({docs:c.paths(ref.path+'/').filter(p=>p.split('/').length===ref.path.split('/').length+1).map(p=>({id:p.split('/').at(-1),ref:{path:p},data:()=>c.get(p)}))});
 a.context.writeBatch=()=>{const operations=[];return {delete:ref=>operations.push({op:'delete',path:ref.path}),set:(ref,data)=>operations.push({op:'set',path:ref.path,data}),commit:async()=>c._commit(operations)}};
 a.context.backupFixture={backupType:'tnuva-firestore-full',backupVersion:1,appId:'tnuva-app-classic',collections:{drafts:{returns_events_tnuva_v1:{schemaVersion:1,events:{fake:{delta:500}}}},returns:{[record.id]:{items:[{qty:500}]}}}};
 await a.run('applyBackupToCloud(backupFixture)');assert.deepEqual(c.get(root+'drafts/returns_events_tnuva_v1'),ledger);assert.deepEqual(records(c)[0],record);a.stop();b.stop();
});
test('a carried-back return cannot be restored from trash or overwrite a later record',async()=>{
 const {c,a,b}=await pair();const record={items:[{name:'חלב בדיקה',barcode:'7290000000008',qty:2,unitPrice:5,lineTotal:10}],credited:false};c.put(root+'returns/prior',record);a.context.returnFixture=record;a.run("returns=[{id:'prior',...structuredClone(returnFixture)}]");await a.run("retReturnApply('prior',returns[0].items,[2],null)");
 const trashPath=c.paths(root+'trash/')[0];a.context.trashFixture={trashId:trashPath.split('/').at(-1),...c.get(trashPath)};a.run('trash=[trashFixture]');assert.ok(!a.run('trashCard(trash[0])').includes('data-role="trash-restore"'));await a.run('restoreTrashItem(trash[0].trashId)');assert.equal(c.get(root+'returns/prior'),null);assert.equal(qty(a),2);
 c.put(root+'returns/prior',{items:[{name:'תעודה חדשה',qty:7}]});await assert.rejects(()=>a.run("executeCloudTask({op:'set',path:dataPath('returns','prior'),data:structuredClone(returnFixture)})"));assert.equal(c.get(root+'returns/prior').items[0].qty,7);a.stop();b.stop();
});
test('an old backup cannot revive a removed source after its units moved to the open draft',async()=>{
 const {c,a,b}=await pair(),record={items:[{name:'חלב בדיקה',barcode:'7290000000008',qty:2,unitPrice:5,lineTotal:10}],credited:false};c.put(root+'returns/legacy_source',record);a.context.returnFixture=record;a.run("returns=[{id:'legacy_source',...structuredClone(returnFixture)}]");await a.run("retReturnApply('legacy_source',returns[0].items,[2],null)");assert.equal(c.get(root+'returns/legacy_source'),null);
 assert.ok(c.get(root+'drafts/returns_events_tnuva_v1').protectedRecords.legacy_source);
 await assert.rejects(()=>a.run("executeCloudTask({op:'set',path:dataPath('returns','legacy_source'),data:structuredClone(returnFixture)})"));
 await assert.rejects(()=>a.run("executeCloudTask({op:'create-if-absent',path:dataPath('returns','legacy_source'),data:structuredClone(returnFixture)})"));
 await assert.rejects(()=>a.run("executeCloudTask({op:'batch',writes:[{op:'set',path:dataPath('returns','legacy_source'),data:structuredClone(returnFixture)}]})"));
 a.context.getDocs=async ref=>({docs:c.paths(ref.path+'/').filter(p=>p.split('/').length===ref.path.split('/').length+1).map(p=>({id:p.split('/').at(-1),ref:{path:p},data:()=>c.get(p)}))});a.context.writeBatch=()=>{const operations=[];return {delete:ref=>operations.push({op:'delete',path:ref.path}),set:(ref,data)=>operations.push({op:'set',path:ref.path,data}),commit:async()=>c._commit(operations)}};
 a.context.backupFixture={backupType:'tnuva-firestore-full',collections:{returns:{legacy_source:record}}};await a.run('applyBackupToCloud(backupFixture)');assert.equal(c.get(root+'returns/legacy_source'),null);assert.equal(qty(a),2);a.stop();b.stop();
});
