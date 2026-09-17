import test from 'node:test';
import assert from 'node:assert/strict';
import {runtime, fixture, supplier, fakeCloud} from './receipt-scan-harness.mjs';
const suppliers=[supplier];
const scanCount=c=>c.requests.filter(r=>r.url.endsWith('/scan')).length;
const raw=c=>c.run('aiScanResponse && aiScanResponse.scan.documents.length');
const reload=(s,c)=>runtime(s,{storage:c.storage});
const pause=()=>new Promise(r=>setImmediate(r));
for(const s of suppliers) {
  test(s+': HEALTHY initial scan -> count -> reload -> finish retains shortage and requests no new OCR',async()=>{
    const a=runtime(s);await a.scan();assert.equal(scanCount(a),1);
    const b=reload(s,a);assert.equal(b.run('receiptPaperScanState'),'ok');
    b.run('finishReceipt()');assert.equal(b.run('currentView'),'reconcile');
    assert.equal(b.run('aiScanReused'),true);assert.equal(b.run('aiScanEvaluation.errors.length'),0);
    assert.equal(b.run('aiScanEvaluation.findings.some(f=>f.type==="shortage"&&f.productId==="milk"&&f.qty===1)'),true);
    assert.match(b.node('app').innerHTML,/חסר 1/);assert.equal(scanCount(b),0);
  });
  // v102: נפילת רשת בחנות אינה מאפסת תעודה. שני הכשלים שנצפו ב-17.9 כאן:
  // ניסיון יחיד שנשבר על העלאה שנקטעה, ועוגן מאומת שנמחק בגלל סריקה שנכשלה.
  // v107: הניסיון החוזר מבקש קודם לאסוף את הסריקה שכבר רצה (בקשה זעירה עם אותו
  // מפתח), ורק שרת שאינו מכיר את המפתח גורר העלאה מלאה מחדש. בשטח זה ההבדל בין
  // "צלם הכול שוב" לבין לאסוף סריקה בת שתי דקות ששולמה כבר במלואה.
  test(s+': HEALTHY a dropped upload is retried instead of failing the whole document',async()=>{
    const a=runtime(s);let calls=0;const original=a.context.fetch;
    a.context.fetch=async(...args)=>{if(args[0].endsWith('/scan')&&++calls===1)throw Error('Load failed');return original(...args)};
    await a.scan();
    assert.equal(calls,3,'the upload died, the collect attempt found nothing, and the photos were sent again');
    const bodies=a.requests.filter(r=>r.url.endsWith('/scan')).map(r=>JSON.parse(r.body));
    assert.equal(bodies.length,2,'only the attempts that reached the service are counted');
    assert.equal(bodies[0].resume,true,'the retry asks to collect before it re-uploads anything');
    assert.equal(bodies[0].documents,undefined,'and it carries no photos');
    assert.equal(bodies[1].scanKey,bodies[0].scanKey,'the full send keeps the same key, so it stays collectable');
    assert.equal(a.run('receiptPaperScanState'),'ok');
    assert.equal(raw(a),1);
  });
  // זה בדיוק מה שקרה בחנות ב-17.9: הצילומים הגיעו, השירות קרא ושילם דקה וחצי,
  // והקו של הטלפון מת לפני שהתשובה חזרה. עד v106 זה היה "הסריקה לא הצליחה"
  // והכול נזרק; מעכשיו הניסיון החוזר אוסף את אותה סריקה עצמה.
  test(s+': HEALTHY the photos arrived and the answer did not: the scan is collected, not repaid',async()=>{
    const a=runtime(s);const original=a.context.fetch;let dead=true;
    a.context.fetch=async(url,options)=>{
      if(!String(url).endsWith('/scan')) return original(url,options);
      const answer=await original(url,options);              // ההעלאה הגיעה והשירות קרא
      if(dead&&!JSON.parse(options.body).resume){dead=false;throw Error('Load failed');} // ורק התשובה מתה על קו סגור
      return answer;
    };
    await a.scan();
    const bodies=a.requests.filter(r=>r.url.endsWith('/scan')).map(r=>JSON.parse(r.body));
    assert.equal(bodies.length,2,'שתי בקשות: הצילומים פעם אחת, ואחריהם איסוף');
    assert.equal(bodies[1].resume,true);
    assert.equal(bodies[1].scanKey,bodies[0].scanKey);
    assert.equal(a.run('receiptPaperScanState'),'ok');
    assert.equal(raw(a),1);
  });
  // המפתח שייך לבקשה המדויקת: אותם צילומים ואותם עוגנים. עוגן שהוקלד מחדש הוא
  // בקשה לקריאה חדשה, ולא איסוף של קריאה שרצה על סכום אחר.
  test(s+': HEALTHY the collect key belongs to the exact request, photos and typed anchors alike',()=>{
    const a=runtime(s);
    const fp=(url,expected)=>a.run(`aiScanPagesFingerprint([{dataUrl:${JSON.stringify(url)}}],${JSON.stringify(expected)})`);
    assert.equal(fp('data:image/jpeg;base64,AAAA',{amount:50,lines:3}),fp('data:image/jpeg;base64,AAAA',{amount:50,lines:3}));
    assert.notEqual(fp('data:image/jpeg;base64,AAAA',{amount:50,lines:3}),fp('data:image/jpeg;base64,AAAA',{amount:60,lines:3}));
    assert.notEqual(fp('data:image/jpeg;base64,AAAA',{amount:50,lines:3}),fp('data:image/jpeg;base64,AAAA',{amount:50,lines:4}));
    assert.notEqual(fp('data:image/jpeg;base64,AAAA',{amount:50,lines:3}),fp('data:image/jpeg;base64,BBBB',{amount:50,lines:3}));
    assert.notEqual(fp('data:image/jpeg;base64,AAAA',null),fp('data:image/jpeg;base64,AAAAA',null));
  });
  // ואם גם האיסוף לא מצליח כי הרשת כולה מתה — הסריקה נכשלת, אבל המפתח נשמר,
  // ולחיצה נוספת על "סרוק" אוספת אותה במקום לצלם ולשלם מחדש.
  test(s+': HEALTHY a scan the line died on is collected by the next attempt, not paid for again',async()=>{
    const a=runtime(s);const original=a.context.fetch;let dead=true;
    a.context.fetch=async(url,options)=>{
      if(!String(url).endsWith('/scan')) return original(url,options);
      const answer=await original(url,options);
      if(dead) throw Error('Load failed');
      return answer;
    };
    await a.scan();
    assert.equal(a.run('receiptPaperScanState'),'failed','שלוש נפילות רצופות הן כישלון');
    assert.equal(a.run('receiptScanHistory[receiptScanHistory.length-1].code'),'network_error');
    assert.match(a.run('receiptScanHistory[receiptScanHistory.length-1].error'),/הסריקה עצמה ממשיכה בשרת/);
    dead=false;
    await a.run(s+'StartPaperScan()');
    const collected=a.requests.filter(r=>r.url.endsWith('/scan')).map(r=>JSON.parse(r.body));
    assert.equal(collected[collected.length-1].resume,true,'הסריקה החוזרת אספה ולא שלחה צילומים מחדש');
    assert.equal(a.run('receiptPaperScanState'),'ok');
    assert.equal(raw(a),1);
  });
  test(s+': HEALTHY a failed rescan keeps the verified read itself, marked as the previous photo',async()=>{
    const a=runtime(s);await a.scan();assert.equal(raw(a),1);
    const original=a.context.fetch;
    a.context.fetch=async(...args)=>{if(args[0].endsWith('/scan'))throw Error('Load failed');return original(...args)};
    a.run("aiScanDocuments[0].pages=[{dataUrl:'data:image/jpeg;base64,Yg==',orientationConfirmed:true}];aiScanDocuments[0].cachedPages=null;");
    await a.run(s+'StartPaperScan()');
    assert.equal(raw(a),1,'the verified read is still there');
    assert.equal(a.run('aiScanDocuments[0].scanResult.staleAfterFailure'),true);
    assert.equal(a.run('receiptPaperScanState'),'ok');
    assert.match(a.run('tnuvaPaperStatusHtml()'),/הצילום האחרון לא נקרא, ולכן מוצגת הקריאה הקודמת/);
    // וגם אחרי טעינה מחדש הקריאה עדיין שם.
    assert.equal(raw(reload(s,a)),1);
  });
  test(s+': HEALTHY a failed rescan keeps the anchor a previous read already verified',async()=>{
    const a=runtime(s);await a.scan();
    assert.equal(a.run('receiptNoteTotal'),50);
    // המצב שנוצר ב-17.9: הקריאה עצמה כבר אבדה מהטיוטה, והעוגן של המסמך שרד.
    const original=a.context.fetch;
    a.context.fetch=async(...args)=>{if(args[0].endsWith('/scan'))throw Error('Load failed');return original(...args)};
    a.run(`aiScanDocuments[0].pages=[{dataUrl:'data:image/jpeg;base64,Yg==',orientationConfirmed:true}];
      aiScanDocuments[0].cachedPages=null; aiScanDocuments[0].cachedResult=null; aiScanDocuments[0].scanResult=null;
      receiptNotes=[]; recomputeNoteTotal(); receiptRebuildScanResponse();`);
    await a.run(s+'StartPaperScan()');
    assert.equal(a.run('receiptPaperScanState'),'failed');
    assert.equal(a.run('receiptNoteTotal'),50,'the verified money anchor is still on screen');
    assert.equal(a.run('receiptNotes.length'),1);
    assert.equal(a.run('receiptPaperScanProblems.some(p=>p.includes("מקריאה קודמת נשמרו"))'),true);
  });
  test(s+': HEALTHY quantity changes recompute findings from same saved paper',async()=>{
    const a=runtime(s);await a.scan();const b=reload(s,a);
    b.run('receiptList[0].qty=11;saveReceiptDraft();finishReceipt()');
    assert.equal(b.run('aiScanEvaluation.findings.some(f=>f.type==="surplus"&&f.qty===1)'),true);
    assert.equal(scanCount(b),0);
  });
  test(s+': HEALTHY matching money with a different product still exposes shortage and surplus after reload',async()=>{
    const a=runtime(s);await a.scan();a.run("receiptList=[{productId:'coffee',name:'קפה בדיקה',qty:10}];saveReceiptDraft()");
    const b=reload(s,a);b.run('finishReceipt()');
    assert.equal(b.run('aiScanEvaluation.findings.some(f=>f.type==="shortage"&&f.productId==="milk")'),true);
    assert.equal(b.run('aiScanEvaluation.findings.some(f=>f.type==="surplus"&&f.productId==="coffee")'),true);
    assert.equal(scanCount(b),0);
  });
  test(s+': HEALTHY multiple documents retain original page counts and evaluate after reload',async()=>{
    const a=runtime(s);await a.scan(2);a.run(`
      aiScanDocuments[0].pages.push({...aiScanDocuments[0].pages[0]});
      aiScanResponse.scan.documents[0].pageCount=2;
      if(aiScanResponse.scan.documents[0].__tnuvaPaper) aiScanResponse.scan.documents[0].__tnuvaPaper.pageCount=2;
      saveReceiptDraft();`);
    const b=reload(s,a);assert.deepEqual(Array.from(b.run('aiScanDocuments.map(d=>d.restoredPageCount)')),[2,1]);
    b.run('finishReceipt()');assert.equal(b.run('aiScanReused'),true);
    assert.equal(b.run('aiScanEvaluation.errors.some(e=>e.includes("מספר העמודים"))'),false);
    assert.equal(scanCount(b),0);
  });
  test(s+': HEALTHY partial two-document failure retains first result and retries only the missing document',async()=>{
    const a=runtime(s);let calls=0;const original=a.context.fetch;
    // הרשת נופלת על המסמך השני ונשארת נופלת — גם אחרי הניסיונות החוזרים.
    a.context.fetch=async(...args)=>{if(args[0].endsWith('/scan')&&++calls>=2)throw Error('network failure');return original(...args)};
    await a.scan(2);assert.equal(raw(a),1);assert.equal(a.run('receiptPaperScanState'),'failed');
    const b=reload(s,a);b.run("aiScanDocuments[1].pages=[{dataUrl:'data:image/jpeg;base64,YQ==',orientationConfirmed:true}]");
    await b.run(s+'StartPaperScan()');assert.equal(scanCount(b),1);assert.equal(raw(b),2);
    assert.equal(b.run('receiptPaperScanState'),'ok');
  });
  test(s+': HEALTHY cancellation rejects a late response',async()=>{
    const a=runtime(s);let release;const original=a.context.fetch;
    a.context.fetch=(url,options)=>url.endsWith('/scan')?new Promise(r=>{release=()=>original(url,options).then(r)}):original(url,options);
    const running=a.scan();await pause();a.run(`${s}ResetPhotoReceipt();aiScanResponse=null;aiScanDocuments=[];`);
    release();await running;assert.equal(raw(a),null);assert.equal(a.run('receiptPaperScanState'),'');
  });
  test(s+': HEALTHY reload during pending scan reports interruption and sends nothing automatically',async()=>{
    const a=runtime(s);a.run(`receiptOpened=true;receiptPaperScanState='running';
      aiScanDocuments=[{amount:null,units:null,pages:[{dataUrl:'data:image/jpeg;base64,YQ=='}]}];saveReceiptDraft()`);
    const b=reload(s,a);assert.equal(b.run('receiptPaperScanState'),'interrupted');assert.equal(scanCount(b),0);
  });
  test(s+': HEALTHY failed final write keeps draft and parsed result',async()=>{
    const cloud=fakeCloud(),a=runtime(s,{cloud});await cloud.tick();await a.scan();a.run('finishReceipt();aiApplyInvoiceResult();saveReconciledReceipt();runCloudTask=async()=>false');
    assert.equal(a.run('!!pendingReceipt'),true);await a.run('confirmReceipt()');
    assert.equal(raw(a),1);assert.equal(raw(reload(s,a)),1);
  });
  test(s+': HEALTHY legacy manual receipt without scan retains manual completion',()=>{
    const a=runtime(s);a.run(`receiptEntryMode='manual';receiptAnchorSource='manual';receiptOpened=true;
      receiptList=[{productId:'milk',name:'חלב בדיקה',qty:10}];receiptNotes=[{amount:50,units:10,lines:1}];recomputeNoteTotal();saveReceiptDraft()`);
    const b=reload(s,a);b.run('finishReceipt()');assert.equal(b.run('receiptEntryMode'),'manual');assert.equal(scanCount(b),0);
  });
  test(s+': removed photo remains invalid after reload',async()=>{
    const a=runtime(s);await a.scan();a.run('finishReceipt()');assert.match(a.node('app').innerHTML,/data-role="ai-edit-images"/);a.click('ai-edit-images');a.click('ai-remove-page',null,{doc:'0',page:'0'});
    assert.equal(raw(a),null);const b=reload(s,a);assert.equal(raw(b),null);
    assert.equal(b.run(s+'CachedDoc(aiScanDocuments[0])'),false);
    assert.equal(b.run('receiptPaperScanState'),'failed');
    b.run('finishReceipt()');assert.equal(b.run('aiScanEvaluation'),null);
  });
  test(s+': editing one document keeps the other result and only the changed document needs OCR',async()=>{
    const a=runtime(s);await a.scan(2);a.run('finishReceipt()');a.click('ai-edit-images');a.click('ai-remove-page',null,{doc:'1',page:'0'});
    assert.equal(a.run(s+'CachedDoc(aiScanDocuments[0])'),true);
    a.click('rc-recon-cancel');a.click('rc-plus','milk');const b=reload(s,a);
    assert.equal(raw(b),1);assert.equal(b.run(s+'CachedDoc(aiScanDocuments[0])'),true);
    assert.equal(b.run('receiptPaperScanState'),'failed');assert.equal(b.run(s+'PhotoReady()'),false);
    b.run("aiScanDocuments[1].pages=[{dataUrl:'data:image/jpeg;base64,YQ==',orientationConfirmed:true}]");
    await b.run(s+'StartPaperScan()');assert.equal(scanCount(b),1);assert.equal(raw(b),2);
  });
  test(s+': removed document stays removed and remaining anchors are recomputed',async()=>{
    const a=runtime(s);await a.scan(2);a.click('rc-notes-edit');a.click('rc-photo-capture');a.click('rc-photo-remove-doc',null,{doc:'0'});
    assert.equal(a.run('aiScanDocuments.length'),1);const b=reload(s,a);
    assert.equal(b.run('aiScanDocuments.length'),1);assert.equal(raw(b),1);
    assert.equal(b.run('receiptNoteTotal'),50);assert.equal(b.run('receiptPaperScanState'),'ok');
  });
  test(s+': added unfinished document survives reload',async()=>{
    const a=runtime(s);await a.scan();a.click('rc-notes-edit');a.click('rc-photo-capture');a.click('rc-photo-add-doc');
    assert.equal(a.run('aiScanDocuments.length'),2);const b=reload(s,a);
    assert.equal(b.run('aiScanDocuments.length'),2);assert.equal(raw(b),1);
    assert.equal(b.run('receiptPaperScanState'),'failed');
  });
  test(s+': storage fallback warns immediately and preserves counted quantities',async()=>{
    const a=runtime(s);await a.scan();a.context.persist=(k,v)=>a.storage.set(k,v);a.toasts.length=0;
    a.run(`localStorage.setItem=(k,v)=>{if(JSON.parse(v).aiScan)throw Error('QuotaExceededError');persist(k,v)};saveReceiptDraft()`);
    assert.equal(a.toasts.length,1);assert.match(a.toasts[0],/אין מקום לפענוח/);const b=reload(s,a);assert.equal(raw(b),null);
    assert.equal(b.run('receiptList.length'),1);assert.equal(b.run('receiptPaperScanState'),'failed');
    b.run('finishReceipt()');assert.match(b.toasts.at(-1),/השלם צילום/);
  });
  test(s+': complete storage failure warns without claiming that recent changes are saved',async()=>{
    const a=runtime(s);await a.scan();a.toasts.length=0;
    a.run(`localStorage.setItem=()=>{throw Error('QuotaExceededError')};receiptList[0].qty=12;saveReceiptDraft()`);
    assert.equal(a.toasts.length,1);const b=reload(s,a);
    assert.equal(b.run('receiptList[0].qty'),9);
  });
  test(s+': legacy manual confirmation metadata is persisted',async()=>{
    const a=runtime(s);await a.scan();a.run(`Object.assign(aiScanResponse.scan.documents[0].rows[0],{
      description:'משקה בדיקה',barcode:null,barcodeObserved:null,barcodeReadType:'unreadable',barcodeMatchMethod:'suggested_name_multiple',
      catalogCandidateHintIds:['milk','coffee'],barcodeSuggestedCandidates:[{productId:'milk',barcode:'7290000000008'},{productId:'coffee',barcode:'7290000000015'}]});
      saveReceiptDraft();finishReceipt()`);
    assert.equal(a.run('aiConfirmNameCandidate(0,0,"milk")'),true);
    assert.equal(a.run('aiScanResponse.scan.documents[0].rows[0].barcodeMatchMethod'),'user_confirmed');
    const b=reload(s,a);assert.equal(b.run('aiScanResponse.scan.documents[0].rows[0].barcodeMatchMethod'),'user_confirmed');
    assert.equal(b.run('aiConfirmedMappingsAudit().length'),1);
    b.run('finishReceipt()');assert.equal(b.run('app.innerHTML.includes(\"data-role=\\\"ai-confirm-name-candidate\\\"\")'),false);
  });
  test(s+': successful final write retains the complete parsed source',async()=>{
    const cloud=fakeCloud(),a=runtime(s,{cloud});await cloud.tick();await a.scan();a.run('finishReceipt();aiApplyInvoiceResult();saveReconciledReceipt()');await a.run('confirmReceipt()');
    const d=a.writes[0].data;assert.ok(d.scanAudit);assert.ok(d.aiAudit);assert.ok(d.aiAudit.findings.length);
    assert.ok(d.paperScan);a.context.packed=d.paperScan;
    assert.equal((await a.run('unpackReceiptValue(packed)')).scan.documents[0].rows[0].quantity,10);
    assert.equal(typeof d.aiAudit.documents[0].rows,'number');assert.equal(raw(reload(s,a)),null);
  });
  test(s+': active scan and count resume on another device without another OCR request',async()=>{
    const cloud=fakeCloud(),a=runtime(s,{cloud});await cloud.tick();await a.scan();
    assert.equal(await a.run('flushReceiptDraftToCloud()'),true);
    const otherDevice=runtime(s,{cloud});await cloud.tick();assert.equal(raw(otherDevice),1);
    assert.equal(otherDevice.run('receiptList[0].qty'),9);otherDevice.run('finishReceipt()');
    assert.equal(otherDevice.run('aiScanEvaluation.findings.some(f=>f.type==="shortage"&&f.qty===1)'),true);assert.equal(scanCount(otherDevice),0);
  });
  test(s+': unchanged discrepancies reuse text analysis without resending photos',async()=>{
    const a=runtime(s);await a.scan();a.run('aiRunAnalyzer=auditOriginalAnalyzer;finishReceipt()');await pause();
    a.click('rc-recon-cancel');a.run('finishReceipt()');await pause();
    const uploads=a.requests.filter(r=>r.body&&JSON.parse(r.body).mode!=='analyze');
    const analyses=a.requests.filter(r=>r.body&&JSON.parse(r.body).mode==='analyze');
    assert.equal(uploads.length,1);assert.equal(analyses.length,s==='tnuva'?1:0);
  });
}
