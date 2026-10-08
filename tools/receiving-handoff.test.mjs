// Actual application receiving flow after removal of receiving handoff; order engine tests remain in tests/.
import test from 'node:test';
import assert from 'node:assert/strict';
import {phone,createCloud,root,path,settle,json} from './handoff-harness.mjs';
const alive=[];const make=(c=createCloud(),o={})=>{const p=phone(c,o);alive.push(p);return p;};
test.afterEach(()=>{while(alive.length)alive.pop().stop();});
const id=p=>p.run('receiptDraftId');
const save=p=>p.run("finishDraft('receiving',receiptDraftId,{items:receiptList,noDoc:true})");
const ready=p=>p.run("receiptNoDoc=true;receiptDupConfirmed=true;finishReceipt()");

test('local edits, render, scan and connectivity events create no receiving cloud draft or listener',async()=>{
 const c=createCloud(),a=make(c),listeners=a.client.listenerCount();a.receipt();a.run("setReceiptQty('milk','4');renderReceiving();handoffChanged('receiving')");a.fire('online');await settle();
 assert.equal(a.run('draftHandoffs.receiving'),undefined);assert.equal(a.client.listenerCount(),listeners);assert.deepEqual(c.paths('handoff_tnuva_receiving_'),[]);assert.equal(c.transactions,0);
 assert.equal(JSON.parse(a.storage.get('tn_receipt_draft')).items[0].qty,4);assert.match(a.node('draftHandoffBanner').innerHTML,/באותו טלפון/);
 const b=make(c);await settle();assert.equal(id(b),null);assert.equal(b.run('receiptList.length'),0);
});
test('paid result and manual comparison corrections survive same-phone reload with no extra OCR',async()=>{
 const c=createCloud(),a=make(c);await a.scan();a.run("openReconcile();reconcileSetRecvLive('milk','4');reconcileSetPriceLive('milk','6');reconcileSetNoteLive('milk','12');setView('receiving');addReceiptQtyToTop(products[1],3);saveReceiptDraft()");
 const b=make(c,{storage:new Map(a.storage)});b.run('openReconcile()');assert.equal(b.run("reconcileData.find(x=>x.productId==='milk').received"),4);assert.equal(b.run("reconcileData.find(x=>x.productId==='coffee').received"),3);assert.equal(b.requests.length,0);assert.deepEqual(c.paths('handoff_tnuva_receiving_'),[]);
});
test('final transaction creates receipt and log once while other-phone local receipt stays unchanged',async()=>{
 const c=createCloud(),a=make(c),b=make(c);a.receipt(9);b.receipt(4);const other=id(b),sid=id(a);ready(a);await a.run('confirmReceipt()');
 assert.equal(c.paths('/receipts/').length,1);assert.equal(c.paths('/actionLog/').length,1);assert.equal(c.get(root+'receipts/'+sid).items[0].qty,9);assert.equal(id(a),null);assert.equal(id(b),other);assert.equal(b.run('receiptList[0].qty'),4);assert.deepEqual(c.paths('handoff_tnuva_receiving_'),[]);
});
test('offline final retains whole local receipt and never queues a blind record overwrite',async()=>{
 const c=createCloud(),a=make(c);a.receipt();const before=a.storage.get('tn_receipt_draft');a.online(false);ready(a);await a.run('confirmReceipt()');assert.equal(a.run('receiptList[0].qty'),9);assert.equal(JSON.parse(a.storage.get('tn_receipt_draft')).draftId,JSON.parse(before).draftId);assert.equal(c.paths('/receipts/').length,0);assert.equal(a.run('cloudFailedWrites.length'),0);
});
test('lost reply is confirmed from server and leaves one receipt',async()=>{
 const c=createCloud(),a=make(c);a.receipt();ready(a);c.loseReplyAfterCommit=true;await a.run('confirmReceipt()');assert.equal(id(a),null);assert.equal(c.paths('/receipts/').length,1);assert.equal(c.paths('/actionLog/').length,1);
});
test('storage failure before final blocks every cloud write and retains in-memory edits',async()=>{
 const c=createCloud(),a=make(c);a.receipt();ready(a);a.context.localStorage.setItem=()=>{throw Error('quota')};await a.run('confirmReceipt()');assert.equal(a.run('receiptList[0].qty'),9);assert.equal(c.paths('/receipts/').length,0);assert.match(a.toasts.at(-1),/מקום|נשמרו/);
});
test('failure to clear acknowledged local draft leaves data visible and retry safely completes cleanup',async()=>{
 const c=createCloud(),a=make(c);a.receipt();ready(a);const original=a.context.localStorage.setItem;
 a.context.localStorage.setItem=(key,text)=>{if(key==='tn_receipt_draft'&&JSON.parse(text).draftId===null)throw Error('quota');return original(key,text);};
 await a.run('confirmReceipt()');assert.equal(a.run('receiptList[0].qty'),9);assert.equal(c.paths('/receipts/').length,1);assert.equal(a.run('localReceiptPending()'),true);a.context.localStorage.setItem=original;await a.run('retryLocalReceiptFinish()');assert.equal(id(a),null);assert.equal(c.paths('/receipts/').length,1);
});
test('existing final receipt is never overwritten by a stale local copy with same ID',async()=>{
 const c=createCloud(),a=make(c);a.receipt(17);const sid=id(a);c.put(root+'receipts/'+sid,{items:[{qty:9}],newer:true});assert.equal(await save(a),false);assert.equal(a.run('receiptList[0].qty'),17);assert.equal(c.get(root+'receipts/'+sid).items[0].qty,9);
});
test('legacy transferred or canceled draft is blocked at final without cloud draft mutation',async()=>{
 for(const state of ['open','canceled','saved']){const c=createCloud(),a=make(c);a.receipt();const sid=id(a),legacy={state,deviceId:'other',gen:2,payload:'old'};c.put(path('receiving',sid),legacy);assert.equal(await save(a),false);assert.deepEqual(c.get(path('receiving',sid)),legacy);assert.equal(c.paths('/receipts/').length,0);assert.equal(a.run('receiptList[0].qty'),9);}
});
test('owner legacy local draft can finalize without changing cloud ownership document',async()=>{
 const c=createCloud(),a=make(c);a.receipt();const sid=id(a),legacy={state:'open',deviceId:a.storage.get('tn_device_id'),gen:1,payload:'old'};c.put(path('receiving',sid),legacy);assert.equal(await save(a),true);assert.deepEqual(c.get(path('receiving',sid)),legacy);assert.equal(c.paths('/receipts/').length,1);
});
test('history attachment carries expected receipt and refuses stale edits atomically',async()=>{
 const c=createCloud(),a=make(c),record={id:'saved',noDoc:true,items:[{productId:'milk',qty:9}],timestamp:1};c.put(root+'receipts/saved',record);a.context.saved=record;a.run('receipts=[saved];reopenReceiptForDoc(saved.id)');c.put(root+'receipts/saved',{...record,changed:true});assert.equal(await save(a),false);assert.equal(c.get(root+'receipts/saved').changed,true);assert.equal(c.paths('/actionLog/').length,0);
});
test('price CAS and action log are atomic with final receipt',async()=>{
 const c=createCloud(),a=make(c);a.receipt();c.put(root+'products/milk',{price:7});a.run("handoffFinishPlans.receiving={prices:[{id:'milk',expected:5,price:6}]}");assert.equal(await save(a),false);assert.equal(c.paths('/receipts/').length,0);assert.equal(c.paths('/actionLog/').length,0);assert.equal(c.get(root+'products/milk').price,7);
});
test('old side copies and queued finalized data stay visible and are never replayed or deleted',async()=>{
 const c=createCloud(),a=make(c);a.context.oldTasks=[{id:'old',actionName:'save receipt before clearing draft',task:{op:'set',path:(root+'receipts/old').split('/'),data:{items:[{productId:'milk',qty:17}],totalExVat:85}}}];a.run('cloudFailedWrites=oldTasks;quarantineLegacyDraftWrites()');await a.run('recoverLegacyDraftWrites()');assert.equal(a.run('cloudFailedWrites.length'),0);assert.equal(JSON.parse(a.storage.get('tn_handoff_legacy_writes')).length,1);assert.match(a.run('localReceiptBannerHtml()'),/לעיון בלבד/);await a.run('openLocalReceiptRecovery(0)');assert.equal(id(a),null);assert.equal(c.paths('/receipts/').length,0);
});
test('local side recovery refuses active draft and storage errors without losing either copy',async()=>{
 const c=createCloud(),a=make(c);a.receipt(17);const payload=a.run('JSON.stringify(receiptDraftPayload(true))');a.storage.set('tn_handoff_receiving_side',JSON.stringify([{sessionId:'side',payload}]));await a.run('openLocalReceiptRecovery(0)');assert.equal(a.run('receiptList[0].qty'),17);a.run("handoffEmpty('receiving')");const original=a.context.localStorage.setItem;a.context.localStorage.setItem=()=>{throw Error('quota')};await a.run('openLocalReceiptRecovery(0)');assert.equal(id(a),null);a.context.localStorage.setItem=original;await a.run('openLocalReceiptRecovery(0)');assert.equal(a.run('receiptList[0].qty'),17);assert.equal(JSON.parse(a.storage.get('tn_handoff_receiving_side')).length,1);
});
test('successful final closes old quantity and confirmation callbacks',async()=>{
 const a=make();a.receipt();let quantity='';Object.defineProperty(a.node('qtyVal'),'value',{get:()=>quantity,set:v=>{quantity=String(v);}});a.run("promptQty(products[0],'receipt');$('qtyVal').value='99';showConfirm('old','old','old',()=>{receiptList=[{qty:999}]})");ready(a);await a.run('confirmReceipt()');a.run('commitQty(false);if(confirmCb)confirmCb()');assert.equal(id(a),null);assert.equal(a.run('receiptList.length'),0);
});
test('archive waits for unfinished paper scan instead of dropping images or result',()=>{
 const a=make();a.receipt();a.run("aiScanBusy=true;archiveLocalReceipt()");assert.equal(id(a)!==null,true);assert.equal(a.run('confirmCb'),null);assert.match(a.toasts.at(-1),/להשלים/);
});
test('orders retain handoff and returns retain the separate event engine',async()=>{
 const c=createCloud(),a=make(c);a.receipt();a.change("returnsList=[{productId:'milk',name:'בדיקה',qty:3}];saveReturnsDraft();orderState={milk:{amount:'5',unit:'unit'}};saveDraft()");await a.sync('order');assert.equal(c.paths('handoff_tnuva_').length,1);assert.equal(a.run('draftHandoffs.receiving'),undefined);assert.equal(a.run('returnsEvents.view().slots.weekly.items[0].qty'),3);
});

test('full storage cannot bypass recursive quarantine through an unnamed old receiving batch',async()=>{
 const c=createCloud(),a=make(c);a.context.legacyQueue=[{id:'old-batch',actionName:'old autosave label',task:{op:'batch',writes:[{op:'set',path:(root+'drafts/receipt').split('/'),data:{items:[{qty:4}]}},{op:'set',path:(root+'receipts/old-final').split('/'),data:{items:[{qty:4}]}}]}}];
 a.run('cloudFailedWrites=legacyQueue');a.context.localStorage.setItem=()=>{throw Error('quota')};let executions=0;a.context.executeCloudTask=async()=>{executions++;};await a.run('retryCloudFailedWrites()');assert.equal(executions,0);assert.equal(a.run('cloudFailedWrites.length'),1);assert.equal(c.paths('/receipts/').length,0);
});
test('direct nested legacy receiving draft writes are rejected before any batch execution',async()=>{
 const a=make();a.context.oldTask={op:'batch',writes:[{op:'set',path:(root+'drafts/receipt').split('/'),data:{items:[{qty:4}]}}]};await assert.rejects(a.run('executeCloudTask(oldTask)'),/כתיבת סנכרון ישנה/);
});
