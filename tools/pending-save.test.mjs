// v166 — שמירה שלא אושרה אינה משאירה את הקליטה נעולה ובלי הסבר (כמו ברמן 156–157).
// 26.11.2026, 9:37, בעל העסק, עם צילום של מסך הקליטה ו"שמירת הקליטה עדיין נבדקת. הנתונים נשארו בטלפון הזה.": "עכשיו אני חסום
// לא יודע מה קורה פה". "אשר וקלוט" נשלח לענן ולא הגיע אישור; מאז כל לחיצה אמרה "יש שמירת קליטה שעדיין נבדקת. לחץ על בדיקת השמירה
// למעלה" — וגם "אשר וקלוט" עצמו נבלע בשומר הלחיצות, בזמן שהפס שלמעלה מוסתר מאחורי חלון הסיכום.
// הלחיצות כאן עוברות דרך שומר הלחיצות (guardDraftEvent), כמו בטלפון — לא קריאה ישירה ל-confirmReceipt.
// 1. "אשר וקלוט" אחרי שמירה בלי תשובה: הלחיצה מגיעה, בודקת, שומרת פעם אחת והחלון נסגר.
// 2. הפס שלמעלה: מה קרה, שלא אבד כלום ומה לוחצים; "בודק ושומר…" בזמן הבדיקה; כפתור אחר — אותו הסבר; "בדוק ונסה לשמור שוב" שומר.
// 3. עדיין אין חיבור: נשאר נעול, בלי שמירה, וההודעה אומרת ללחוץ שוב.
// 4. הניסיון הישן לא הגיע לענן והקליטה השתנתה מאז: הוא יורד, ו"אשר וקלוט" שומר את מה שיש עכשיו — באותה לחיצה, פעם אחת.
// 5. הניסיון הישן כן נשמר והקליטה השתנתה מאז: "כבר נשמרה", בלי שמירה שנייה, והקליטה נפתחת לבדיקה.
// 6. בלי תשובה מהשרת על הניסיון הישן: לא מוותרים עליו — נשאר תלוי עד שיש תשובה.
// 7. (v167) סגירה ופתיחה של האפליקציה עם ניסיון תלוי: טביעת הקליטה ונתוני הצילום נשארים, ו"בדוק ונסה לשמור שוב" שומר — גם כשהשמירה
//    כבר הגיעה לענן ורק התשובה אבדה. וגם: הפס שנשאר על המסך אחרי שמירה שלא אושרה הוא הפס עם הכפתור (lostSave).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as harness from './receipt-scan-harness.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle(n = 40) { for (let i = 0; i < n; i++) await tick(); }
const strip = s => String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const OLD = /לחץ על בדיקת השמירה למעלה|שמירת הקליטה עדיין נבדקת/;
const LOCKED = 'הקליטה נעולה עד שהשמירה תאושר. לחץ "בדוק ונסה לשמור שוב" בפס הכחול שלמעלה.';
const saved = cloud => [...cloud.documents.entries()].filter(([key]) => key.includes('/receipts/')).map(([, value]) => value);
const items = rc => rc.items.map(item => [item.productId, item.qty, item.noteQty]);
const banner = r => { r.run('renderDraftHandoffBanner()'); return strip(r.node('draftHandoffBanner').innerHTML); };
const summaryOpen = r => !r.node('receiptSummaryModal').classList.contains('hidden');
const JOURNAL = "HANDOFF_PREFIX+'_receiving_final_v1'";

// לחיצה כמו בטלפון: קודם שומר הלחיצות שעל המסמך, ורק אם הוא לא עצר — המאזין של הכפתור עצמו.
async function tap(r, { id = '', role = '', inside }) {
  let stopped = false;
  const el = { id, dataset: role ? { role } : {} };
  el.closest = selector => (selector === '[id]' && id) || (selector === '[data-role]' && role) || selector.split(',').includes(inside) ? el : null;
  r.context.__tap = { type: 'click', target: el, preventDefault() {}, stopImmediatePropagation() { stopped = true; } };
  r.run('guardDraftEvent(__tap)');
  if (stopped) return 'blocked';
  if (id) await r.events.get(id + ':click')?.();
  else if (role) await r.events.get('app:click')?.({ target: el });
  await settle();
  return 'ran';
}
const confirmTap = r => tap(r, { id: 'rs_ok', inside: '#receiptSummaryModal' });
async function bannerRetry(r) {
  r.events.get('draftHandoffBanner:click')({ target: { closest: s => s === '[data-local-receipt]' ? { dataset: { localReceipt: 'retry' } } : null } });
  for (let i = 0; i < 20 && r.run('receiptFinalizing'); i++) await settle();
}

// הנייר (ה-fixture של ה-harness): חלב ×10 ב-₪5, נספרו 9 — "חסר 1". עד חלון הסיכום, כמו בטלפון.
// קריאה מהשרת (getDocFromServer) עוברת דרך עטיפה, כדי שבדיקה תוכל לומר "השרת לא עונה" (readFailure).
async function toSummary() {
  const cloud = harness.fakeCloud();
  const r = harness.runtime('tnuva', { cloud });
  await cloud.tick();
  const read = r.context.getDocFromServer;
  r.context.getDocFromServer = (...args) => r.context.readFailure ? Promise.reject(Object.assign(new Error('offline'), { code: 'unavailable' })) : read(...args);
  r.run('openScanner=()=>{}; closeScanner=()=>{}; scanBeep=()=>{}; buzz=()=>{}; refreshScanHost=()=>{};');
  await r.scan(1);
  r.run('finishReceipt()'); await settle();
  r.click('ai-confirm-findings'); r.click('ai-apply'); await settle();
  assert.ok(r.run('!!pendingReceipt') && summaryOpen(r), 'חלון הסיכום פתוח');
  return { r, cloud };
}
// "אשר וקלוט" והענן לא עונה — המקרה של 26.11: הניסיון נשאר תלוי והקליטה נעולה.
async function lostSave(r) {
  r.context.networkFailure = true;
  assert.equal(await confirmTap(r), 'ran');
  r.context.networkFailure = false;
  assert.equal(r.run('localReceiptPending()'), true, 'הניסיון תלוי');
  assert.equal(r.run("canEditDraft('receiving', true)"), false, 'הקליטה נעולה');
  // v167: הפס כמו שנשאר על המסך (בלי ציור יזום של הבדיקה) — עם הכפתור. ב-166 הוא נשאר על "בודק ושומר…" בלי כפתור,
  // כי שמירה שלא אושרה ציירה אותו בזמן שהדגל של השמירה עוד דלק; הבדיקות ציירו אותו בעצמן לפני שקראו, ולא ראו.
  const left = strip(r.node('draftHandoffBanner').innerHTML);
  assert.ok(left.startsWith('השמירה נשלחה, ועוד לא הגיע אישור מהענן.') && left.includes('בדוק ונסה לשמור שוב') && !left.includes('בודק ושומר'), left);
}
// הקליטה השתנתה אחרי הניסיון: הטביעה של הניסיון השמור כבר אינה הטביעה של עכשיו (והנתונים שלו — לא מה שעל המסך).
function changedSince(r) {
  r.run(`{ const list = JSON.parse(localStorage.getItem(${JOURNAL})), a = list[localReceiptSession()];
    a.fingerprint = 'changed-since'; a.data.items[0].qty = 4; localStorage.setItem(${JOURNAL}, JSON.stringify(list)); }`);
}

test('1. "אשר וקלוט" אחרי שמירה בלי תשובה: הלחיצה מגיעה, בודקת, שומרת פעם אחת והחלון נסגר (עד 165 נבלעה)', async () => {
  const { r, cloud } = await toSummary();
  await lostSave(r);
  assert.ok(summaryOpen(r), 'אחרי שמירה בלי תשובה החלון נשאר פתוח');
  assert.equal(r.toasts.at(-1), 'אין אישור מהענן — כנראה נפל החיבור. שום דבר לא אבד: הקליטה שמורה בטלפון. לחץ שוב כדי לנסות לשמור.');
  assert.equal(saved(cloud).length, 0);
  r.toasts.length = 0;
  assert.equal(await confirmTap(r), 'ran', 'שומר הלחיצות מעביר את "אשר וקלוט"');
  assert.equal(r.run('localReceiptPending()'), false);
  assert.equal(saved(cloud).length, 1, 'נשמרה פעם אחת');
  assert.deepEqual(items(saved(cloud)[0]), [['milk', 9, 10]]);
  assert.equal(summaryOpen(r), false);
  assert.equal(r.run('currentView'), 'receiptsHistory');
  assert.equal(r.run('receiptList.length'), 0);
  assert.ok(r.toasts.includes('התעודה נשמרה ✓'), r.toasts.join(' | '));
  assert.ok(!r.toasts.some(t => OLD.test(t)), r.toasts.join(' | '));
});

test('2. הפס שלמעלה: מה קרה, שלא אבד כלום ומה לוחצים; "בודק ושומר…" בזמן הבדיקה; כפתור אחר — אותו הסבר; "בדוק ונסה לשמור שוב" שומר', async () => {
  const { r, cloud } = await toSummary();
  await lostSave(r);
  // כמו בטלפון של 26.11: "חזרה" בחלון ו"חזור לסריקה" — מסך הקליטה, הפס למעלה.
  assert.equal(await tap(r, { id: 'rs_cancel', inside: '#receiptSummaryModal' }), 'ran');
  r.run('hideReceiptSummary()');
  assert.equal(await tap(r, { role: 'rc-recon-cancel', inside: '#app' }), 'ran');
  assert.equal(r.run('currentView'), 'receiving');
  let text = banner(r);
  assert.ok(text.startsWith('השמירה נשלחה, ועוד לא הגיע אישור מהענן. שום דבר לא אבד — הקליטה שמורה בטלפון הזה. עד שהשמירה תאושר, הקליטה נעולה. בדוק ונסה לשמור שוב לא עובר? סגור את האפליקציה, פתח אותה שוב ולחץ כאן שוב.'), text);
  assert.doesNotMatch(text, OLD);
  // כפתור אחר במסך — נחסם, עם אותו הסבר
  r.toasts.length = 0;
  assert.equal(await tap(r, { role: 'rc-quantity-lines', inside: '#app' }), 'blocked');
  assert.equal(r.toasts.at(-1), LOCKED);
  // "בדוק ונסה לשמור שוב" כשהענן איטי: הפס אומר "בודק ושומר…", בלי כפתור
  let release; cloud.commitGate = new Promise(resolve => { release = resolve; });
  r.events.get('draftHandoffBanner:click')({ target: { closest: s => s === '[data-local-receipt]' ? { dataset: { localReceipt: 'retry' } } : null } });
  await settle();
  assert.equal(r.run('receiptFinalizing'), true);
  text = strip(r.node('draftHandoffBanner').innerHTML);
  assert.ok(text.startsWith('בודק ושומר… זה לוקח פחות מדקה. שום דבר לא אבד — הקליטה שמורה בטלפון הזה.'), text);
  assert.ok(!r.node('draftHandoffBanner').innerHTML.includes('data-local-receipt="retry"'), 'בזמן הבדיקה — בלי כפתור');
  r.toasts.length = 0;
  assert.equal(await tap(r, { role: 'rc-quantity-lines', inside: '#app' }), 'blocked');
  assert.equal(r.toasts.at(-1), 'הקליטה נשמרת עכשיו — רגע אחד.');
  release(); cloud.commitGate = null;
  for (let i = 0; i < 20 && r.run('receiptFinalizing'); i++) await settle();
  assert.equal(saved(cloud).length, 1);
  assert.deepEqual(items(saved(cloud)[0]), [['milk', 9, 10]]);
  assert.equal(r.run('localReceiptPending()'), false);
  assert.equal(r.run('currentView'), 'receiptsHistory');
  assert.ok(r.toasts.includes('התעודה נשמרה ✓'), r.toasts.join(' | '));
});

test('3. עדיין אין חיבור: נשאר נעול, בלי שמירה, וההודעה אומרת ללחוץ שוב; הפס חוזר עם הכפתור', async () => {
  const { r, cloud } = await toSummary();
  await lostSave(r);
  r.context.networkFailure = true;
  r.toasts.length = 0;
  assert.equal(await confirmTap(r), 'ran');
  assert.equal(r.run('localReceiptPending()'), true);
  assert.equal(saved(cloud).length, 0);
  assert.ok(summaryOpen(r));
  assert.equal(r.toasts.at(-1), 'אין אישור מהענן — כנראה נפל החיבור. שום דבר לא אבד: הקליטה שמורה בטלפון. לחץ שוב כדי לנסות לשמור.');
  assert.ok(banner(r).includes('בדוק ונסה לשמור שוב'));
  r.context.networkFailure = false;
  await bannerRetry(r);
  assert.equal(saved(cloud).length, 1);
  assert.equal(r.run('localReceiptPending()'), false);
});

test('4. הניסיון הישן לא הגיע לענן והקליטה השתנתה מאז: הוא יורד, ו"אשר וקלוט" שומר את מה שיש עכשיו — באותה לחיצה, פעם אחת', async () => {
  const { r, cloud } = await toSummary();
  await lostSave(r);
  changedSince(r);
  r.toasts.length = 0;
  assert.equal(await confirmTap(r), 'ran');
  assert.ok(r.toasts.includes('השמירה הקודמת לא הגיעה לענן, והקליטה השתנתה מאז. הקליטה פתוחה שוב — בדוק ולחץ "אשר וקלוט".'), r.toasts.join(' | '));
  assert.equal(saved(cloud).length, 1, 'נשמרה פעם אחת');
  assert.deepEqual(items(saved(cloud)[0]), [['milk', 9, 10]], 'מה שעל המסך — לא הנתונים של הניסיון הישן (4)');
  assert.equal(r.run('localReceiptPending()'), false);
  assert.equal(summaryOpen(r), false);
  assert.equal(r.run('currentView'), 'receiptsHistory');
});

test('5. הניסיון הישן כן נשמר והקליטה השתנתה מאז: "כבר נשמרה", בלי שמירה שנייה, והקליטה נפתחת לבדיקה', async () => {
  const { r, cloud } = await toSummary();
  // נכתב בשרת, התשובה אבדה, וגם הבדיקה מהשרת לא ענתה — הניסיון תלוי, והתעודה כבר בענן
  cloud.loseReplyAfterCommit = true; r.context.readFailure = true;
  assert.equal(await confirmTap(r), 'ran');
  cloud.loseReplyAfterCommit = false; r.context.readFailure = false;
  assert.equal(r.run('localReceiptPending()'), true);
  assert.equal(saved(cloud).length, 1);
  const token = saved(cloud)[0].localFinal.token;
  r.run(`{ const list = JSON.parse(localStorage.getItem(${JOURNAL})); list[localReceiptSession()].fingerprint = 'changed-since'; localStorage.setItem(${JOURNAL}, JSON.stringify(list)); }`);
  r.toasts.length = 0;
  assert.equal(await confirmTap(r), 'ran');
  assert.ok(r.toasts.includes('התעודה כבר נשמרה בענן. מה ששונה כאן אחרי השמירה נשאר בטלפון לבדיקה — אפשר "לשמור עותק בצד ולפנות את המסך".'), r.toasts.join(' | '));
  assert.equal(saved(cloud).length, 1, 'לא נשמרה פעם שנייה');
  assert.equal(saved(cloud)[0].localFinal.token, token, 'ולא נדרסה');
  assert.equal(r.run('localReceiptPending()'), false);
  assert.equal(r.run("canEditDraft('receiving', true)"), true, 'הקליטה פתוחה לבדיקה');
});

test('6. בלי תשובה מהשרת על הניסיון הישן: לא מוותרים עליו — נשאר תלוי עד שיש תשובה, ואז יורד ונשמר מה שיש עכשיו', async () => {
  const { r, cloud } = await toSummary();
  await lostSave(r);
  changedSince(r);
  r.context.readFailure = true;
  assert.equal(await confirmTap(r), 'ran');
  assert.equal(r.run('localReceiptPending()'), true, 'בלי תשובה — נשאר תלוי');
  assert.equal(saved(cloud).length, 0);
  assert.equal(r.run(`JSON.parse(localStorage.getItem(${JOURNAL}))[localReceiptSession()].fingerprint`), 'changed-since', 'הניסיון הישן נשמר כמו שהיה');
  r.context.readFailure = false;
  assert.equal(await confirmTap(r), 'ran');
  assert.equal(saved(cloud).length, 1);
  assert.deepEqual(items(saved(cloud)[0]), [['milk', 9, 10]]);
  assert.equal(r.run('localReceiptPending()'), false);
});

test('7. סגירה ופתיחה של האפליקציה עם ניסיון תלוי (מה שהפס מציע כשזה "לא עובר"): הטביעה ונתוני הצילום נשארים, ו"בדוק ונסה לשמור שוב" שומר (166: הקליטה נפתחה מחדש במקום להישמר)', async () => {
  const a = await toSummary();
  await lostSave(a.r);
  const fingerprint = a.r.run("handoffFingerprint('receiving')");
  // אותו טלפון, אחרי סגירה ופתיחה: אותו זיכרון ואותו ענן, דף חדש — בלי הצילומים, שאינם נשמרים
  const storage = a.r.storage;
  const b = harness.runtime('tnuva', { cloud: a.cloud, storage });
  await a.cloud.tick();
  assert.equal(b.run('aiScanDocuments[0].pages.length'), 0, 'הצילומים לא חזרו');
  assert.equal(b.run("handoffFingerprint('receiving')"), fingerprint, 'טביעת הקליטה לא משתנה בפתיחה מחדש');
  assert.deepEqual(JSON.parse(b.run('JSON.stringify(SCAN_PAGE_AUDIT_FIELDS.map(f => aiScanResponse.perDocument[0][f]))')), [1, ['?'], [null], [null], ['ok']], 'נתוני הצילום נשארו עם הקריאה');
  assert.equal(b.run('localReceiptPending()'), true, 'הניסיון התלוי נשאר אחרי הפתיחה');
  assert.ok(banner(b).startsWith('השמירה נשלחה, ועוד לא הגיע אישור מהענן.'), banner(b));
  await bannerRetry(b);
  assert.equal(b.run('localReceiptPending()'), false);
  assert.equal(b.run('currentView'), 'receiptsHistory');
  assert.equal(saved(a.cloud).length, 1, 'נשמרה פעם אחת');
  assert.deepEqual(items(saved(a.cloud)[0]), [['milk', 9, 10]]);
  assert.ok(b.toasts.includes('התעודה נשמרה ✓'), b.toasts.join(' | '));
  // ואם השמירה כן הגיעה לענן ורק התשובה אבדה: אחרי הפתיחה הכפתור מזהה שזו אותה תעודה — נסגר, בלי כפילות ובלי "מה ששונה כאן"
  const c = await toSummary();
  c.cloud.loseReplyAfterCommit = true; c.r.context.readFailure = true;
  assert.equal(await confirmTap(c.r), 'ran');
  c.cloud.loseReplyAfterCommit = false;
  assert.equal(c.r.run('localReceiptPending()'), true);
  assert.equal(saved(c.cloud).length, 1);
  const d = harness.runtime('tnuva', { cloud: c.cloud, storage: c.r.storage });
  await c.cloud.tick();
  await bannerRetry(d);
  assert.equal(d.run('localReceiptPending()'), false);
  assert.equal(d.run('currentView'), 'receiptsHistory');
  assert.equal(saved(c.cloud).length, 1, 'לא נשמרה פעם שנייה');
  assert.ok(d.toasts.includes('התעודה נשמרה ✓'), d.toasts.join(' | '));
});

test('8. הגרסה (167), כולל ההערה ב-service worker', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /const APP_VERSION = '167'/);
  assert.match(fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), /^\/\/ גרסה 167 — /);
});
