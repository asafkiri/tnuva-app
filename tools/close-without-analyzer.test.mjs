// v166 — סגירת התעודה אינה מחכה למנתח.
// 26.11.2026, בעל העסק, עם צילום מסך של "המנתח מסביר את הפער…" מעל "סגור תעודה עם החוסרים": "עד שהמנתח לא מסיים להסביר לי את
// החוסר האפליקציה לא נותנת לסגור את התעודה וזה מעצבן. הרי כאן אני לא צריך את ההסבר של המנתח". בגיבוי של אותו בוקר: שלוש לחיצות
// על "סגור תעודה עם החוסרים" בתוך 70 שניות, ובכל אחת "יש להמתין לסיום בדיקת התעודה" — על חוסר אחד (2 יח׳) שהמנוע כבר סגר בדיוק.
// כאן הכול אמיתי חוץ מגבולות הדפדפן, Firebase והרשת (receipt-scan-harness): הסריקה, ההשוואה, המנתח החי שרץ לבד כשמסך ההשוואה
// נפתח — כמו בטלפון — הסיכום והשמירה. רק התשובה של שירות המנתח מוחזקת, עד שהבדיקה משחררת אותה.
// 1. "סגור תעודה עם החוסרים" נשמרת מיד בזמן שהמנתח רץ; התשובה שלו, כשהיא מגיעה, אינה משנה דבר.
// 2. כשהמנתח עונה לפני הסגירה — הוא מוביל, כמו עד היום, והתעודה נשמרת עם אותן כמויות.
// 3. "אפשר לסגור את התעודה בלי לחכות לו" — רק כשהסגירה פתוחה.
// 4. שמירה שלא עברה: הטיוטה נשארת, התשובה המאוחרת אינה נוגעת בה, ושמירה חוזרת עוברת.
// 5. ריצה של המנתח שנותקה אינה מאפסת ריצה חדשה.
// 6. הגרסה.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as harness from './receipt-scan-harness.mjs';

const WAIT = 'יש להמתין לסיום בדיקת התעודה.';
const NO_WAIT = 'אפשר לסגור את התעודה בלי לחכות לו';
const SPINNER = 'המנתח מסביר את הפער…';
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle(n = 20) { for (let i = 0; i < n; i++) await tick(); }
const analyses = r => r.requests.filter(q => q.body && JSON.parse(q.body).mode === 'analyze').length;
const savedReceipts = cloud => [...cloud.documents.entries()].filter(([key]) => key.includes('/receipts/')).map(([, value]) => value);
const items = rc => rc.items.map(item => [item.productId, item.qty, item.noteQty]);

// הנייר (ה-fixture של ה-harness): חלב ×10 ב-₪5. נספרו 9 — המנוע אומר "חסר 1" ונסגר בדיוק על הכסף.
// תשובת המנתח שמוחזקת היא הסבר שנסגר בדיוק (בדיקה 2 מראה שהוא היה מוביל), כדי שיהיה ברור שגם תשובה "טובה" אינה נוגעת בתעודה שנסגרה.
const CLAIMS = [{ kind: 'shortage', productId: 'milk', quantity: 1, amountExVat: 5, evidence: 'שורה 1: 10 יח׳' }];
async function analyzerRunning() {
  const cloud = harness.fakeCloud();
  const r = harness.runtime('tnuva', { cloud });
  await cloud.tick();
  r.run('openScanner=()=>{}; closeScanner=()=>{}; scanBeep=()=>{}; buzz=()=>{}; refreshScanHost=()=>{};');
  const original = r.context.fetch, held = [];
  r.context.fetch = (url, options) => {
    if (!(options?.body && JSON.parse(options.body).mode === 'analyze')) return original(url, options);
    r.requests.push({ url: String(url), body: options.body });
    return new Promise(resolve => held.push(() => {
      const body = JSON.stringify({ ok: true, analysis: { claims: CLAIMS, summary: 'fixture' } });
      resolve({ ok: true, status: 200, text: async () => body, json: async () => JSON.parse(body) });
    }));
  };
  r.run('aiRunAnalyzer = auditOriginalAnalyzer');
  await r.scan(1);
  r.run('finishReceipt()');
  await settle();
  assert.equal(r.run('rcStep'), 'ai');
  assert.equal(r.run('aiAnalyzeBusy'), true, 'המנתח יצא לדרך לבד כשמסך ההשוואה נפתח');
  assert.equal(analyses(r), 1);
  assert.equal(r.run('aiScanEvaluation.valid'), true, 'המנוע כבר סגר את החשבון');
  const release = async () => { assert.ok(held.length, 'המנתח שלח בקשה'); held.shift()(); await settle(); };
  return { r, cloud, release, held };
}

test('1. "סגור תעודה עם החוסרים" נשמרת מיד בזמן שהמנתח עוד מסביר את הפער; התשובה שלו, כשהיא מגיעה, אינה משנה דבר', async () => {
  const { r, cloud, release } = await analyzerRunning();
  let html = r.node('app').innerHTML;
  assert.ok(html.includes(SPINNER));
  assert.ok(html.includes(NO_WAIT), 'מתחת לספינר: אין צורך לחכות');
  r.click('ai-confirm-findings');
  html = r.node('app').innerHTML;
  assert.ok(html.includes('סגור תעודה עם החוסרים'));
  assert.ok(html.includes(SPINNER) && html.includes(NO_WAIT));

  r.click('ai-apply');
  assert.ok(r.run('!!pendingReceipt'), 'חלון הסיכום נפתח');
  await r.run('confirmReceipt()');
  assert.ok(!r.toasts.includes(WAIT), r.toasts.join(' | '));
  const saved = savedReceipts(cloud);
  assert.equal(saved.length, 1, 'התעודה נשמרה');
  assert.deepEqual(items(saved[0]), [['milk', 9, 10]]);
  assert.equal(saved[0].status, 'open');
  assert.deepEqual(saved[0].aiAudit.findings.filter(f => f.type === 'shortage').map(f => [f.productId, f.qty]), [['milk', 1]]);
  assert.equal(r.run('receiptList.length'), 0);
  assert.equal(r.run('currentView'), 'receiptsHistory');
  assert.equal(r.run('aiAnalyzeBusy'), false);
  assert.ok(r.toasts.at(-1).includes('התעודה נקלטה'), r.toasts.at(-1));

  // המנתח עונה אחרי שהתעודה נסגרה.
  const before = JSON.stringify(savedReceipts(cloud)), writes = r.writes.length, draft = r.storage.get('tn_receipt_draft');
  await release();
  assert.equal(r.run('aiAnalyzeResult'), null);
  assert.equal(r.run('receiptAnalysisCache'), null);
  assert.equal(r.run('aiScanEvaluation'), null);
  assert.equal(r.run('aiAnalyzeBusy'), false);
  assert.equal(r.run('currentView'), 'receiptsHistory', 'מסך ההשוואה אינו מצויר מחדש');
  assert.equal(r.storage.get('tn_receipt_draft'), draft, 'הטיוטה הריקה אינה נכתבת שוב');
  assert.equal(JSON.stringify(savedReceipts(cloud)), before);
  assert.equal(r.writes.length, writes);
  assert.equal(analyses(r), 1, 'בלי קריאה נוספת בתשלום');
});

test('2. כשהמנתח עונה לפני הסגירה — הוא מוביל, כמו עד היום, והתעודה נשמרת עם אותן כמויות', async () => {
  const { r, cloud, release } = await analyzerRunning();
  await release();
  assert.equal(r.run('aiAnalyzeBusy'), false);
  assert.equal(r.run('!!(aiAnalyzeResult && aiAnalyzeResult.accepted && aiScanEvaluation.analyzerLed)'), true);
  const html = r.node('app').innerHTML;
  assert.ok(html.includes('נסגר בדיוק ✓'));
  assert.ok(!html.includes(SPINNER) && !html.includes(NO_WAIT));
  r.click('ai-confirm-findings');
  r.click('ai-apply');
  await r.run('confirmReceipt()');
  const saved = savedReceipts(cloud);
  assert.equal(saved.length, 1);
  assert.deepEqual(items(saved[0]), [['milk', 9, 10]]);
  assert.equal(analyses(r), 1);
});

test('3. "אפשר לסגור את התעודה בלי לחכות לו" — רק כשהסגירה פתוחה: כשהיא נעולה, ייתכן שדווקא המנתח יפתח אותה', async () => {
  const { r } = await analyzerRunning();
  r.click('ai-confirm-findings');
  r.run('aiScanEvaluation.valid = false; renderReconcile()');
  let html = r.node('app').innerHTML;
  assert.ok(html.includes('סגירת תעודה תיפתח אחרי שכל השורות ייסגרו'));
  assert.ok(!html.includes('data-role="ai-apply"'));
  assert.ok(html.includes(SPINNER), 'הספינר נשאר');
  assert.ok(!html.includes(NO_WAIT), 'בלי השורה — כאן הסגירה נעולה');
  r.run('aiScanEvaluation.valid = true; renderReconcile()');
  html = r.node('app').innerHTML;
  assert.ok(html.includes('data-role="ai-apply"') && html.includes(NO_WAIT));
});

test('4. שמירה שלא עברה: הטיוטה נשארת, התשובה המאוחרת של המנתח אינה נוגעת בה, ושמירה חוזרת עוברת', async () => {
  const { r, cloud, release } = await analyzerRunning();
  r.click('ai-confirm-findings');
  r.click('ai-apply');
  cloud.reject = 'permission-denied';
  await r.run('confirmReceipt()');
  assert.equal(savedReceipts(cloud).length, 0);
  assert.ok(!r.toasts.includes(WAIT));
  assert.equal(r.run('receiptList[0].qty'), 9, 'הספירה נשארה');
  assert.equal(r.run("canEditDraft('receiving', true)"), true);
  assert.ok(r.run('!!pendingReceipt'), 'אפשר לאשר את הסיכום שוב');
  assert.equal(r.run('aiAnalyzeBusy'), false, 'המנתח נותק כשנלחץ "אישור"');

  const draft = r.storage.get('tn_receipt_draft');
  await release();
  assert.equal(r.run('aiAnalyzeResult'), null, 'התשובה המאוחרת נזרקה');
  assert.equal(r.run('aiScanEvaluation.analyzerLed === true'), false);
  assert.equal(r.run('aiAnalyzeBusy'), false);
  assert.equal(r.storage.get('tn_receipt_draft'), draft, 'הטיוטה לא השתנתה');

  cloud.reject = null;
  await r.run('confirmReceipt()');
  const saved = savedReceipts(cloud);
  assert.equal(saved.length, 1);
  assert.deepEqual(items(saved[0]), [['milk', 9, 10]]);
  assert.equal(r.run('receiptList.length'), 0);
});

test('5. ריצה של המנתח שנותקה אינה מאפסת ריצה חדשה ואינה מציירת את המסך', async () => {
  const { r, release, held } = await analyzerRunning();
  assert.equal(r.run('aiAnalyzeDetach()'), true);
  assert.equal(r.run('aiAnalyzeBusy'), false);
  assert.equal(r.run('aiAnalyzeDetach()'), false, 'אין מה לנתק');
  // ריצה חדשה על אותה הערכה ממתינה לאותה בקשה (אותו מפתח) — בלי קריאה שנייה בתשלום.
  const again = r.run('aiRunAnalyzer()');
  await settle();
  assert.equal(r.run('aiAnalyzeBusy'), true);
  assert.equal(analyses(r), 1);
  assert.equal(held.length, 1);
  let renders = 0;
  r.run('globalThis.__render = renderReconcile');
  r.context.__count = () => { renders++; };
  r.run('renderReconcile = function () { __count(); return __render.apply(this, arguments); }');
  await release();
  await again;
  // התשובה משותפת: הריצה החדשה מקבלת אותה ומובילה; הריצה שנותקה לא נגעה בדבר (ציור אחד — של הריצה החדשה).
  assert.equal(r.run('aiAnalyzeBusy'), false);
  assert.equal(r.run('!!(aiAnalyzeResult && aiAnalyzeResult.accepted && aiScanEvaluation.analyzerLed)'), true);
  assert.equal(renders, 1);
  r.run('renderReconcile = __render');
});

test('6. הגרסה (167), כולל ההערה ב-service worker', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /const APP_VERSION = '167'/);
  assert.match(fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), /^\/\/ גרסה 167 — /);
});
