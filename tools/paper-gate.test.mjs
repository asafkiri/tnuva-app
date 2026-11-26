// v165 — שורה שמחכה לבחירת מוצר לפני הבדיקה: כרטיס במסך הקליטה, בלי מסך ההשוואה (כמו ביטבתה 419); ומסך ההשוואה מתרענן אחרי כל אישור.
// בעל העסק, 17.11.2026 (על אותו מצב ביטבתה, ואחר כך "כן" להעביר את התיקון לתנובה): "שלא יופיע ישר חוסר בכל המוצרים זה מלחיץ את
// המשתמש", "שיהיה יותר מובן שצריך רק לאשר את השורות האלה ואפשר להמשיך לקלוט את הסחורה", ו"אני לוחץ על הכפתור וזה לא נלחץ לי בכלל".
// עד 164: תעודה שנקראה ונשארה בה שורה בלי מוצר (הקוד שבתעודה אינו במאגר) פתחה, במקום הבדיקה שנבחרה, את מסך ההשוואה — "חסר ₪1,245.48"
// ועשרה כרטיסי "לא נסרקה אף יחידה" לפני שנספר משהו; הבחירה נמחקה, ולכן גם אחרי שהמוצר נבחר הבדיקה לא נפתחה; ובמסך ההוא "השורה נכונה"
// נשמרה בלי שהמסך יצויר מחדש.
// מה שנבדק:
// 1. שורה אחת בלי מוצר: נשארים במסך הקליטה, עם כרטיס אחד — מה נשאר, מה ייפתח אחר כך, ו"שום דבר לא חסר"; הבחירה נשמרת (גם בטיוטה).
// 2. תעודה במבנה של 10.11 (7 החלטות): רק השורה שעוצרת את הרשימה מוצגת, ראשונה; שש האחרות מקופלות ("אפשר עכשיו, ואפשר בסוף"), ובדיקת
//    המחירים עצמה סגורה.
// 3. בוחרים את המוצר — הבדיקה שורה-שורה נפתחת לבד, והכרטיס מוחלף בכפתורים הרגילים.
// 4. גם "הכל הגיע", "חוסרים ועודפים" ו"לא הגיע כלום" מחכים לכרטיס, ונפתחים לבד אחריו; לחיצה על בדיקה בזמן שהכרטיס מוצג — הודעה, בלי מסך ההשוואה.
// 5. כשהרשימה חסומה ואין שורה שאפשר להשלים — כמו עד 164: ההודעה הישנה ומסך ההשוואה.
// 6. טיוטה מגרסה 164 שנעצרה כאן (הבחירה נמחקה, נשארה בדיקה ממתינה): הבחירה חוזרת, ואחרי הבחירה הרשימה עולה עם מה שנסרק; הכפתור
//    הכחול שבתחתית בזמן שהכרטיס מוצג — הודעה, בלי מסך ההשוואה.
// 7. "שנה את הבדיקה" בזמן הקריאה משחרר גם את הבדיקה הממתינה: הכרטיס אינו מחזיר את הבחירה, ומה שנסרק נשאר בספירה.
// 8. מסך ההשוואה: "השורה נכונה", "אשר לתעודה זו בלבד" ו"לא, מוצר אחר" מציירים את המסך מחדש — הכרטיס יורד והכותרת מתעדכנת; ציור אחד ללחיצה.
// 9. קיפול שנפתח נשאר פתוח אחרי אישור; שדה תאריך שמקלידים בו אינו נהרס; רענון נתונים מהענן אינו מצייר את מסך ההשוואה באמצע הקלדה.
// 10. קליטה בסריקה (טיוטה ישנה) — בלי שער, כמו קודם; מצלמת הקליטה סגורה — בלי חישוב של בדיקת המחירים לכפתור שלה.
// 11. שתי תעודות, והשורה בלי מוצר בשנייה: הכרטיס אומר "2 התעודות נקראו", והרשימה עולה עם שתיהן.
// 12. הגרסה.
// הרצה: node --test tools/paper-gate.test.mjs
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime, fakeCloud } from './receipt-scan-harness.mjs';
import { longFixture } from './long-receipt-fixture.mjs';

const products = [
  { id: 'milk', name: 'חלב 3% בקרטון 1 ליטר', code: '8', barcode: '7290000000008', price: 5, posPrice: 6.9 },
  { id: 'cottage', name: 'קוטג׳ 5% 250 גרם', code: '15', barcode: '7290000000015', price: 7 },
  { id: 'yogurt', name: 'יוגורט טבעי 150 גרם', code: '22', barcode: '7290000000022', price: 3 },
  { id: 'cream', name: 'שמנת חמוצה 15% 200 מ״ל', code: '39', barcode: '7290000000039', price: 2 }
];
const r2 = n => Math.round(n * 100) / 100;
function paper(spec, number, catalog = products) {
  const rows = spec.map(([id, q], i) => { const p = catalog.find(x => x.id === id);
    return { section: 'items', sourcePage: 1, lineNumber: i + 1, code: p.code, description: p.name, quantity: q, unitPriceExVat: p.price, lineTotalExVat: r2(q * p.price), promoStar: false, confidence: .95 }; });
  const gross = r2(rows.reduce((n, r) => n + r.lineTotalExVat, 0));
  return { noteIndex: 0, docType: 'invoice', docNumber: number, docDate: '2026-11-02', pageCount: 1, vatPct: 18, rows, confidence: .95,
    itemsSectionTotalExVat: gross, itemsPrintedLines: spec.length, promoDiscountExVat: 0, subtotalExVat: gross, warnings: [] };
}
// תעודה של שלוש שורות, שהשנייה שלה (קוטג׳, 6 יח׳) נקראה עם קוד שאינו במאגר
function unknownPaper() {
  const p = paper([['milk', 12], ['cottage', 6], ['yogurt', 4]], '4471009');
  p.rows[1] = { ...p.rows[1], code: '99999', description: 'מעדן בוקר' }; // שם שאינו דומה לשום מוצר במאגר — אין שיוך לפי שם ומחיר
  return p;
}
const json = (c, e) => JSON.parse(c.run('JSON.stringify(' + e + ')'));
const strip = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\s+/g, ' ').trim();
const settle = async () => { for (let i = 0; i < 40; i++) await new Promise(res => setImmediate(res)); };
const readyBuzzes = c => json(c, 'buzzes.filter(Array.isArray)');
const pagesOf = papers => JSON.stringify(papers.map((p, i) => ({ noteIndex: i, amount: null, units: null, lines: null, pages: [{ dataUrl: 'data:image/jpeg;base64,UEFQRVI' + i, orientationConfirmed: true }] })));
// האפליקציה במסך הקליטה, ושירות הפענוח עונה לכל תעודה (אפשר לעכב אותו — hold)
async function open(papers, data = {}) {
  const cloud = fakeCloud();
  const c = runtime('tnuva', { cloud, data: { products, promos: [], items: [], paper: { ok: true, serviceVersion: 20, scan: { warnings: [], documents: [] } }, ...data } });
  await cloud.tick();
  const original = c.context.fetch;
  let gate = null;
  c.context.fetch = async (url, options) => {
    if (!String(url).endsWith('/scan')) return original(url, options);
    if (gate) await gate;
    const sent = options?.body || '', index = papers.findIndex((p, i) => sent.includes('UEFQRVI' + i));
    const body = JSON.stringify({ ok: true, serviceVersion: 20, model: 'fixture', requestId: 'p' + index, scan: { warnings: [], documents: papers[index] ? [structuredClone(papers[index])] : [] } });
    return { ok: true, status: 200, text: async () => body, json: async () => JSON.parse(body) };
  };
  c.hold = () => { let release; gate = new Promise(res => release = res); return () => { gate = null; release(); }; };
  c.run(`todayStr = () => '2026-11-03'; currentView = 'receiving'; mainMode = 'receiving'; receiptDupConfirmed = true;
    testConfirms = []; showConfirm = (title, message, label, cb) => testConfirms.push({ title, message, label, cb });
    globalThis.buzzes = []; navigator.vibrate = ms => buzzes.push(ms);
    window.BarcodeDetector = class { detect() { return Promise.resolve([]); } };
    navigator.mediaDevices = { getUserMedia: async () => ({ getTracks: () => [], getVideoTracks: () => [] }) };
    $('scanVideo').play = async () => {};
    aiScanDocuments = ${pagesOf(papers)}; renderReceiving();`);
  return c;
}
function runQueued(c) { const fns = c.callbacks.splice(0); fns.forEach(fn => { try { fn(); } catch (e) {} }); return fns.length; }
// הבחירה נעשתה במסך הצילום, והתעודה נקראה (בלי לסרוק בינתיים)
async function scanned(papers, intent = 'lines', data) {
  const c = await open(papers, data);
  await c.run(`tnuvaStartPaperScan({ manualQuantities: true, intent: ${JSON.stringify(intent)} })`);
  await settle(); runQueued(c); await settle();
  assert.equal(c.run('receiptPaperScanState'), 'ok', 'התעודה נקראה');
  return c;
}
const app = c => c.node('app').innerHTML;
const screen = c => strip(app(c));
const gateCard = c => { const page = app(c), from = page.indexOf('<div data-paper-gate'); return from < 0 ? '' : strip(page.slice(from, page.indexOf('</div></div>', from))); };
const roles = c => [...new Set([...app(c).matchAll(/data-role="([^"]+)"/g)].map(m => m[1]))];
const modalOpen = c => c.run(`!$('receiptQuantityModal').classList.contains('hidden')`);
const review = c => json(c, 'receiptQuantityReview');
const marks = c => review(c).docs.map(d => d.lines.map(l => l.mark + (l.got ? ':' + l.got : '')).join(','));
const list = c => json(c, 'receiptList.map(l => l.productId + " " + l.qty)');
const draft = c => JSON.parse(c.storage.get('tn_receipt_draft'));
const pick = (c, row, product) => { const ok = c.run(`receiptPickRowProduct(0, ${row}, ${JSON.stringify(product)})`); runQueued(c); return ok; };
const OLD_TOAST = /צריך להשלים את זיהוי המוצרים ובדיקת הפענוח לפני אישור הכמויות/;

// תעודה במבנה של 10.11: 11 שורות, 7 החלטות — 5 זיהויים לפי המחיר, מחלוקת אחת, ושורה אחת בלי מוצר (tools/long-receipt-fixture.mjs)
async function longScanned(intent = 'lines') {
  const c = runtime('tnuva', { data: longFixture() });
  c.run(`todayStr = () => '2026-11-10'; currentView = 'receiving'; mainMode = 'receiving'; receiptDupConfirmed = true;
    testConfirms = []; showConfirm = (title, message, label, cb) => testConfirms.push({ title, message, label, cb });
    globalThis.buzzes = []; navigator.vibrate = ms => buzzes.push(ms);
    aiScanDocuments = [{ noteIndex: 0, amount: null, units: null, lines: null, pages: [{ dataUrl: 'data:image/jpeg;base64,Zml4dHVyZQ==', orientationConfirmed: true }] }]; renderReceiving();`);
  await c.run(`tnuvaStartPaperScan({ manualQuantities: true, intent: ${JSON.stringify(intent)} })`);
  await settle(); runQueued(c); await settle();
  assert.equal(c.run('receiptPaperScanState'), 'ok', 'התעודה נקראה');
  return c;
}
const section = (page, open) => { const from = page.indexOf(open); return from < 0 ? '' : page.slice(from, page.indexOf('</section>', from)); };

test('1. שורה אחת בלי מוצר: נשארים במסך הקליטה עם כרטיס אחד — בלי מסך ההשוואה ובלי "חסר"; הבחירה נשמרת', async () => {
  const c = await scanned([unknownPaper()]);
  assert.equal(c.run('currentView'), 'receiving', 'בלי מסך ההשוואה');
  assert.equal(c.run('receiptQuantityIntent'), 'lines', 'הבחירה מחכה'); assert.equal(draft(c).quantityIntent, 'lines', 'גם בטיוטה');
  assert.equal(modalOpen(c), false);
  assert.equal(c.toasts.at(-1), 'התעודה נקראה. צריך רק לבחור מוצר לשורה אחת — ואז ממשיכים לקלוט.');
  assert.deepEqual(readyBuzzes(c), [[60, 40, 60]], 'רטט אחד: התעודה נקראה');
  const card = gateCard(c);
  assert.match(card, /^התעודה נקראה · 3 שורות/);
  assert.match(card, /צריך רק לבחור מוצר לשורה אחת — ואז ממשיכים לקלוט/);
  assert.match(card, /בשורה הזאת האפליקציה לא זיהתה איזה מוצר זה לפי הקוד שבתעודה\. היא כאן למטה: לוחצים על המוצר הנכון — או מחפשים, סורקים אותו, או פותחים מוצר חדש\./);
  assert.match(card, /מיד אחרי זה הבדיקה שורה-שורה נפתחת לבד, וממשיכים לקלוט את הסחורה\./);
  assert.match(card, /שום דבר לא חסר — עוד לא נספר כלום\.$/);
  assert.doesNotMatch(card, /מה שכבר נסרק נשמר/, 'לא נסרק דבר');
  assert.doesNotMatch(screen(c), /לא נסרקה אף יחידה|חסר ₪|התעודה נקראה ואומתה|הגיע בדיוק מה שכתוב בתעודה/);
  assert.deepEqual(roles(c).filter(r => r.startsWith('rc-quantity')), [], 'כפתורי הבדיקה אינם מוצגים עד שהמוצר נבחר');
  for (const role of ['rowfix-pick', 'rowfix-search', 'rowfix-scan', 'rowfix-new']) assert.ok(roles(c).includes(role), role);
  const page = app(c);
  assert.ok(page.indexOf('data-paper-gate') < page.indexOf('data-gate-rows'), 'הכרטיס — ומיד מתחתיו השורה');
  assert.match(strip(section(page, '<section data-row-actions data-gate-rows')), /הקוד שבשורה אינו במאגר — צריך לבחור מוצר מעדן בוקר קוד בנייר 99999 · שורה 2 6 יח׳ בנייר/);
  assert.doesNotMatch(page, /data-gate-later/, 'אין החלטות נוספות — אין קיפול');
  // ציור נוסף של המסך אינו מודיע שוב, אינו רוטט ואינו פותח דבר
  const said = c.toasts.length;
  c.run('renderReceiving()'); assert.equal(runQueued(c), 0, 'כשיש שער אין מה להריץ');
  assert.equal(c.toasts.length, said); assert.equal(readyBuzzes(c).length, 1); assert.equal(c.run('currentView'), 'receiving');
});

test('2. תעודה במבנה של 10.11: רק השורה שעוצרת את הרשימה מוצגת, ראשונה; שש ההחלטות האחרות מקופלות, ובדיקת המחירים סגורה', async () => {
  const c = await longScanned();
  assert.equal(c.run('currentView'), 'receiving');
  assert.equal(json(c, 'receiptRowActions().total'), 7, 'שבע החלטות מחכות — אחת מהן עוצרת את הרשימה');
  assert.match(gateCard(c), /^התעודה נקראה · 11 שורות/); assert.match(gateCard(c), /צריך רק לבחור מוצר לשורה אחת — ואז ממשיכים לקלוט/);
  const page = app(c), first = section(page, '<section data-row-actions data-gate-rows');
  assert.equal((first.match(/<article/g) || []).length, 1, 'כרטיס אחד בלבד מעל הקיפול');
  assert.match(strip(first), /הקוד שבשורה אינו במאגר — צריך לבחור מוצר יופ\.שזיף 3% קוד בנייר 4136916 · שורה 11/);
  assert.doesNotMatch(strip(page), /שורות דורשות החלטה לפני הקליטה/, 'בלי "7 שורות דורשות החלטה"');
  const at = page.indexOf('<details data-gate-later'), later = page.slice(at, page.indexOf('<section data-price-audit', at));
  assert.ok(at > page.indexOf('data-gate-rows'));
  assert.match(later, /^<details data-gate-later class="[^"]*" dir="rtl"><summary/, 'מקופל (בלי open)');
  assert.match(strip(later), /^עוד 6 שורות מחכות לאישור — אפשר עכשיו, ואפשר בסוף הקליטה/);
  assert.match(later, /data-role="rowfix-pick-all"/); assert.match(later, /data-role="rowfix-confirm"/);
  assert.equal((later.match(/data-role="rowfix-reject"/g) || []).length, 5, 'חמשת הזיהויים לפי המחיר — בתוך הקיפול');
  assert.match(page, /<details data-price-panel>/, 'בדיקת המחירים סגורה כשיש שער');
  assert.doesNotMatch(strip(page), /לא נסרקה אף יחידה|חסר ₪/);
  // אישור בתוך הקיפול אינו פותח את הבדיקה ואינו מוריד את הכרטיס — השורה שעוצרת עוד מחכה
  assert.equal(c.run('receiptPickAllMatchedRows()'), 5); runQueued(c);
  assert.equal(modalOpen(c), false); assert.equal(c.run('receiptQuantityIntent'), 'lines');
  assert.match(gateCard(c), /צריך רק לבחור מוצר לשורה אחת/);
  assert.match(strip(app(c).slice(app(c).indexOf('<details data-gate-later'))), /^עוד שורה אחת מחכה לאישור — אפשר עכשיו, ואפשר בסוף הקליטה/);
});

test('3. בוחרים את המוצר — הבדיקה שורה-שורה נפתחת לבד; הכרטיס מוחלף בכפתורים הרגילים', async () => {
  const c = await scanned([unknownPaper()]);
  assert.equal(pick(c, 1, 'cottage'), true);
  assert.equal(c.run('currentView'), 'receiving'); assert.equal(modalOpen(c), true, 'הבדיקה נפתחה לבד');
  assert.equal(c.run('receiptQuantityIntent'), null, 'הבחירה נפתחה — פעם אחת'); assert.equal(draft(c).quantityIntent, null);
  assert.equal(review(c).mode, 'lines'); assert.equal(review(c).pending, undefined);
  assert.deepEqual(review(c).docs.map(d => d.lines.map(l => l.productId)), [['milk', 'cottage', 'yogurt']], 'השורה שנבחר לה מוצר — ברשימה, עם המוצר שנבחר');
  assert.deepEqual(marks(c), [',,']);
  assert.equal(gateCard(c), '', 'הכרטיס ירד'); assert.ok(roles(c).includes('rc-quantity-lines'), 'מאחורי החלון — הכפתורים הרגילים');
  assert.equal(readyBuzzes(c).length, 2, 'רטט נוסף כשהרשימה נפתחת');
  assert.equal(runQueued(c), 0); assert.equal(c.toasts.at(-1), 'השורה שויכה ל"קוטג׳ 5% 250 גרם"');
  // בתעודה הארוכה: אחרי שנבחר מוצר לשורה 11 הרשימה נפתחת, אף ששש החלטות אחרות עוד מחכות (הן אינן עוצרות אותה)
  const l = await longScanned();
  assert.equal(pick(l, 10, 'forest'), true);
  assert.equal(modalOpen(l), true); assert.equal(review(l).pending, undefined); assert.equal(json(l, 'receiptRowActions().total'), 6);
});

test('4. גם "הכל הגיע", "חוסרים ועודפים" ו"לא הגיע כלום" מחכים לכרטיס ונפתחים לבד אחריו; לחיצה על בדיקה כשהכרטיס מוצג — הודעה, בלי מסך ההשוואה', async () => {
  const a = await scanned([unknownPaper()], 'all');
  assert.equal(a.run('currentView'), 'receiving'); assert.equal(a.run('receiptQuantityIntent'), 'all'); assert.equal(json(a, 'testConfirms').length, 0);
  assert.match(gateCard(a), /מיד אחרי זה תופיע לבד השאלה "הכל הגיע כמו בתעודה\?"\./);
  pick(a, 1, 'cottage');
  assert.equal(json(a, 'testConfirms.at(-1).title'), 'הכל הגיע כמו בתעודה'); assert.equal(a.run('receiptQuantityIntent'), null);
  const n = await scanned([unknownPaper()], 'none');
  assert.match(gateCard(n), /מיד אחרי זה תופיע לבד השאלה "לא הגיע כלום\?"\./);
  pick(n, 1, 'cottage');
  assert.equal(json(n, 'testConfirms.at(-1).title'), 'לא הגיע כלום?');
  const d = await scanned([unknownPaper()], 'differences');
  assert.match(gateCard(d), /מיד אחרי זה רשימת החוסרים והעודפים תיפתח לבד\./);
  pick(d, 1, 'cottage');
  assert.equal(modalOpen(d), true); assert.notEqual(review(d).mode, 'lines'); assert.equal(d.run('receiptQuantityIntent'), null);
  // הכרטיס מוצג, ובכל זאת נלחצת בדיקה (הכפתור הכחול שבתחתית, או קריאה ישירה): הבחירה נשמרת, הודעה אחת, ומסך ההשוואה לא נפתח
  const c = await scanned([unknownPaper()]);
  for (const [call, intent] of [['startReceiptQuantityReview(true)', 'all'], ['startReceiptQuantityReview(false)', 'differences'], ['startReceiptNothingArrived()', 'none'], ['startReceiptLineCheck()', 'lines']]) {
    c.run(call);
    assert.equal(c.run('currentView'), 'receiving', call); assert.equal(c.run('receiptQuantityIntent'), intent, call); assert.equal(draft(c).quantityIntent, intent);
    assert.equal(c.toasts.at(-1), 'קודם בוחרים מוצר לשורה שכאן — ואז ממשיכים לקלוט.'); assert.equal(modalOpen(c), false); assert.equal(json(c, 'testConfirms').length, 0);
    assert.match(gateCard(c), new RegExp(intent === 'lines' ? 'הבדיקה שורה-שורה נפתחת לבד' : intent === 'all' ? 'הכל הגיע כמו בתעודה' : intent === 'none' ? 'לא הגיע כלום' : 'רשימת החוסרים והעודפים'));
  }
  // שתי שורות בלי מוצר — ברבים, ורק כששתיהן נבחרו הבדיקה נפתחת
  const two = unknownPaper(); two.rows[2] = { ...two.rows[2], code: '88888', description: 'גביע לבן' };
  const t = await scanned([two]);
  assert.match(gateCard(t), /צריך רק לבחור מוצר ל־2 שורות — ואז ממשיכים לקלוט/); assert.match(gateCard(t), /בשורות האלה .* הן כאן למטה, אחת אחת:/);
  assert.equal(t.toasts.at(-1), 'התעודה נקראה. צריך רק לבחור מוצר ל־2 שורות — ואז ממשיכים לקלוט.');
  t.run('startReceiptLineCheck()'); assert.equal(t.toasts.at(-1), 'קודם בוחרים מוצר ל־2 השורות שכאן — ואז ממשיכים לקלוט.');
  pick(t, 1, 'cottage');
  assert.equal(modalOpen(t), false); assert.match(gateCard(t), /צריך רק לבחור מוצר לשורה אחת/); assert.equal(t.run('receiptQuantityIntent'), 'lines');
  pick(t, 2, 'yogurt');
  assert.equal(modalOpen(t), true); assert.equal(gateCard(t), '');
});

test('5. כשהרשימה חסומה ואין שורה שאפשר להשלים — כמו עד 164: ההודעה הישנה ומסך ההשוואה', async () => {
  const c = await scanned([paper([['milk', 12], ['cottage', 6]], '4471010')], null);
  assert.equal(c.run('!!receiptQuantityPaperRows()'), true); assert.equal(c.run('receiptPaperGate()'), null);
  // מה שחוסם אינו שורה בלי מוצר (כאן: הכמויות שבתעודה אינן ידועות) — אין כרטיס, והדרך הישנה נשמרת
  c.run('receiptQuantityPaperCheck = () => ({ rows: null, ev: null }); renderReceiving()');
  assert.equal(c.run('receiptPaperGate()'), null); assert.equal(gateCard(c), ''); assert.ok(roles(c).includes('rc-quantity-lines'));
  c.run('startReceiptLineCheck()');
  assert.match(c.toasts.at(-1), OLD_TOAST); assert.equal(c.run('currentView'), 'reconcile');
  c.run(`setView('receiving'); startReceiptQuantityReview(true)`);
  assert.match(c.toasts.at(-1), OLD_TOAST); assert.equal(c.run('currentView'), 'reconcile'); assert.equal(c.run('receiptQuantityIntent'), null);
});

// ===== סריקה בזמן שהתעודה נקראת (כמו ב-line-check-pending.test.mjs): המצלמה המזויפת, הברקוד, הכמות ו"הוסף" =====
const cardClick = (c, dataset) => c.run(`receiptLineScanCardClick({ target: { closest: () => ({ dataset: ${JSON.stringify(dataset)} }) } })`);
const cardType = (c, value) => c.run(`receiptLineScanCardInput({ target: { dataset: { scanGot: '' }, value: ${JSON.stringify(value)} } })`);
async function scanQty(c, code, qty) {
  c.events.get('receiptLineScan:click')(); await settle();
  assert.equal(c.run('scanPurpose'), 'linecheck', 'המצלמה נפתחה');
  c.run('lastScanTime = 0'); c.run(`onScanned(${JSON.stringify(code)})`);
  cardType(c, String(qty)); cardClick(c, { scanSave: '' });
  assert.equal(c.run('scanPurpose'), 'field', 'המצלמה נסגרה אחרי השמירה');
}
// "התחל בדיקה שורה-שורה" נלחץ, סרקו מוצר בזמן הקריאה, וחלון הבדיקה נסגר ("חזרה") לפני שהתעודה נקראה
async function scannedWhileReading(papers, code, qty) {
  const c = await open(papers);
  const release = c.hold();
  const started = c.run(`tnuvaStartPaperScan({ manualQuantities: true, intent: 'lines' })`);
  await settle();
  assert.equal(c.run('receiptPaperScanState'), 'running'); assert.equal(modalOpen(c), true, 'חלון הבדיקה נפתח מיד');
  await scanQty(c, code, qty);
  c.events.get('receiptQuantityClose:click')({});
  assert.equal(modalOpen(c), false);
  c.finish = async () => { release(); await started; await settle(); runQueued(c); await settle(); };
  return c;
}

test('6. טיוטה מגרסה 164 שנעצרה כאן (הבחירה נמחקה, נשארה בדיקה ממתינה): הבחירה חוזרת, ואחרי הבחירה הרשימה עולה עם מה שנסרק', async () => {
  const c = await scannedWhileReading([unknownPaper()], '7290000000008', 12);
  await c.finish();
  assert.equal(c.run('currentView'), 'receiving'); assert.equal(review(c).pending, true);
  assert.equal(c.toasts.at(-1), 'התעודה נקראה. צריך רק לבחור מוצר לשורה אחת — ואז ממשיכים לקלוט.');
  const card = gateCard(c);
  assert.match(card, /מה שכבר נסרק נשמר: מוצר אחד · 12 יח׳ — יסומן ברשימה כשהיא תיפתח\./);
  assert.match(card, /שום דבר לא חסר — הכמויות ייבדקו מול התעודה ברשימה\.$/);
  assert.doesNotMatch(card, /עוד לא נספר כלום/);
  // הכפתור הכחול שבתחתית ("בדוק וסיים") בזמן שהכרטיס מוצג: נשארים במסך הקליטה, עם הודעה — בלי מסך ההשוואה ובלי חלון
  c.events.get('cartBtn:click')({});
  assert.equal(c.run('currentView'), 'receiving'); assert.equal(modalOpen(c), false); assert.equal(c.run('pendingReceipt'), null);
  assert.equal(c.toasts.at(-1), 'קודם בוחרים מוצר לשורה שכאן — ואז ממשיכים לקלוט.'); assert.equal(c.run('receiptQuantityIntent'), 'lines');
  assert.deepEqual(list(c), ['milk 12'], 'הספירה לא נגעה');
  // כך נשמרה הטיוטה ב-164: הבחירה נמחקה לפני שמסך ההשוואה נפתח, והבדיקה הממתינה נשארה
  c.run('receiptQuantityIntent = null; saveReceiptDraft()');
  assert.equal(draft(c).quantityIntent, null);
  c.run('renderReceiving()');
  assert.equal(c.run('receiptQuantityIntent'), 'lines', 'הבחירה חזרה'); assert.equal(draft(c).quantityIntent, 'lines');
  assert.match(gateCard(c), /מיד אחרי זה הבדיקה שורה-שורה נפתחת לבד/);
  runQueued(c);
  assert.equal(modalOpen(c), false, 'עדיין מחכים למוצר');
  pick(c, 1, 'cottage');
  assert.equal(modalOpen(c), true); assert.equal(review(c).pending, undefined);
  assert.deepEqual(marks(c), ['ok,,'], 'החלב שנסרק (12 כמו בתעודה) כבר מסומן "הגיע"'); assert.deepEqual(list(c), ['milk 12']);
  // בלי בדיקה ממתינה הבחירה אינה מומצאת: שער בלי בחירה אומר "אחרי זה בוחרים איך לבדוק"
  const n = await scanned([unknownPaper()], null);
  assert.equal(n.run('receiptQuantityIntent'), null); assert.match(gateCard(n), /אחרי זה בוחרים איך לבדוק את הכמויות\./);
  assert.equal(n.toasts.length, 0, 'בלי בחירה אין מה להודיע');
  pick(n, 1, 'cottage');
  assert.equal(modalOpen(n), false); assert.equal(gateCard(n), ''); assert.ok(roles(n).includes('rc-quantity-lines'), 'הכפתורים הרגילים');
});

test('7. "שנה את הבדיקה" בזמן הקריאה משחרר גם את הבדיקה הממתינה: הכרטיס אינו מחזיר את הבחירה, ומה שנסרק נשאר בספירה', async () => {
  const c = await scannedWhileReading([unknownPaper()], '7290000000008', 5);
  assert.equal(c.run('receiptQuantityIntent'), 'lines'); assert.equal(review(c).pending, true);
  c.click('rc-intent-clear');
  assert.equal(c.run('receiptQuantityIntent'), null); assert.equal(review(c), null, 'גם הבדיקה הממתינה');
  assert.deepEqual(list(c), ['milk 5'], 'מה שנסרק נשאר בספירה'); assert.equal(draft(c).quantityIntent, null); assert.equal(draft(c).quantityReview, null);
  await c.finish();
  assert.equal(c.run('currentView'), 'receiving'); assert.equal(c.run('receiptQuantityIntent'), null, 'השער אינו מחזיר בחירה שבוטלה');
  assert.match(gateCard(c), /צריך רק לבחור מוצר לשורה אחת/); assert.match(gateCard(c), /אחרי זה בוחרים איך לבדוק את הכמויות\./);
  assert.match(gateCard(c), /מה שכבר נסרק נשמר: מוצר אחד · 5 יח׳\./);
  pick(c, 1, 'cottage');
  assert.equal(modalOpen(c), false, 'שום בדיקה לא נפתחת לבד'); assert.equal(gateCard(c), '');
  for (const role of ['rc-quantity-lines', 'rc-quantity-all', 'rc-quantity-differences', 'rc-quantity-none']) assert.ok(roles(c).includes(role), role);
});

// מסך ההשוואה עם שש ההחלטות שנשארו בתעודה הארוכה (אחרי שהמוצר של שורה 11 נבחר), וספירת הציורים שלו
async function longReconcile() {
  const c = await longScanned();
  pick(c, 10, 'forest');
  c.events.get('receiptQuantityClose:click')({});
  c.run(`openReconcile(); globalThis.paints = 0; const paintReconcile = renderReconcile; renderReconcile = function () { paints++; return paintReconcile.apply(this, arguments); };`);
  await settle();
  assert.equal(c.run('currentView'), 'reconcile');
  return c;
}
const tap = async (c, role, dataset) => { c.click(role, undefined, dataset); await settle(); };

test('8. מסך ההשוואה: "השורה נכונה" ו"לא, מוצר אחר" מציירים את המסך מחדש — הכרטיס יורד והכותרת מתעדכנת; ציור אחד ללחיצה', async () => {
  const c = await longReconcile();
  assert.match(screen(c), /6 שורות דורשות החלטה לפני הקליטה/);
  assert.doesNotMatch(app(c), /id="rcPriceAudit"/, 'במסך הזה אין מארח לבדיקת המחירים — לכן עד 164 הוא לא התרענן');
  // "השורה נכונה" על המחלוקת בשורה 10
  assert.ok(roles(c).includes('rowfix-confirm'));
  await tap(c, 'rowfix-confirm', { doc: '0', row: '9' });
  assert.equal(c.toasts.at(-1), 'השורה אושרה כפי שנקראה');
  assert.equal(c.run('paints'), 1, 'המסך צויר מחדש — פעם אחת');
  assert.match(screen(c), /5 שורות דורשות החלטה לפני הקליטה · שורה אחת אושרה ידנית/);
  assert.ok(!roles(c).includes('rowfix-confirm'), 'הכרטיס של המחלוקת ירד');
  // "לא, מוצר אחר" על הזיהוי של שורה 4: השורה חוזרת ככרטיס בחירה, בלי המוצר שנדחה
  await tap(c, 'rowfix-reject', { doc: '0', row: '3' });
  assert.equal(c.run('paints'), 2);
  assert.match(screen(c), /הזיהוי "שמנת חמוצה 15% רבנות 200 מ"ל" נדחה על ידך — בחר מוצר אחר\./);
  assert.equal((app(c).match(/data-role="rowfix-reject"/g) || []).length, 4, 'נשארו ארבעה זיהויים לאישור');
  // בחירת מוצר קוראת גם ל-refreshScanHost וגם ל-refreshPriceAuditViews — ועדיין ציור אחד
  await tap(c, 'rowfix-pick', { doc: '0', row: '3', product: 'cream2' });
  assert.equal(c.toasts.at(-1), 'השורה שויכה ל"שמנת חמוצה 15% מהדרין 200 מ"ל"');
  assert.equal(c.run('paints'), 3, 'ציור אחד ללחיצה');
  assert.match(screen(c), /4 שורות דורשות החלטה לפני הקליטה/);
  // "אשר את כל 4 הזיהויים" — ציור אחד, והכרטיס הסגול מוחלף בשורת הסיכום
  await tap(c, 'rowfix-pick-all', {});
  assert.equal(c.run('paints'), 4); assert.equal(json(c, 'receiptRowActions().total'), 0);
  assert.doesNotMatch(screen(c), /דורשות החלטה|דורשת החלטה/);
});

test('9. שדה תאריך שמקלידים בו אינו נהרס; רענון נתונים מהענן אינו מצייר את מסך ההשוואה באמצע הקלדה — ובלי הקלדה מצייר פעם אחת', async () => {
  const c = await longReconcile();
  // ה-DOM המזויף: השדה נמצא במסך ההשוואה עצמו (app), לא במארחים של מסך הקליטה ושל הסיכום
  c.node('app').contains = () => true; c.node('rcPriceAudit').contains = () => false; c.node('rsPriceAudit').contains = () => false;
  // מקלידים תאריך בבדיקת המחירים, ובאותו זמן החלטה נשמרת: המסך אינו מצויר מחדש (ההקלדה נשמרת), וההחלטה נשמרה
  c.context.document.activeElement = { tagName: 'INPUT', dataset: { role: 'price-doc-date' } };
  await tap(c, 'rowfix-confirm', { doc: '0', row: '9' });
  assert.equal(c.run('paints'), 0, 'בלי ציור בזמן עריכת התאריך'); assert.equal(json(c, 'receiptRowActions().total'), 5, 'ההחלטה נשמרה');
  // נתונים שהתעדכנו מהענן בזמן הקלדה בשדה כלשהו במסך — כמו עד היום, בלי ציור
  c.context.document.activeElement = { tagName: 'INPUT', dataset: { role: 'ai-recv-input' } };
  c.run('rerender()'); await settle();
  assert.equal(c.run('paints'), 0);
  // בלי הקלדה — ציור אחד (לא שניים)
  c.context.document.activeElement = null;
  c.run('rerender()'); await settle();
  assert.equal(c.run('paints'), 1);
  assert.match(screen(c), /5 שורות דורשות החלטה לפני הקליטה/);
});

test('10. קליטה בסריקה (טיוטה ישנה) — בלי שער, כמו קודם; כשמצלמת הקליטה סגורה בדיקת המחירים אינה מחושבת בשביל הכפתור שלה', async () => {
  const c = await scanned([unknownPaper()]);
  assert.ok(c.run('!!receiptPaperGate()'));
  c.run(`receiptCountingMode = 'scan'; receiptQuantityIntent = null; renderReceiving()`);
  assert.equal(c.run('receiptPaperGate()'), null, 'אין שער בקליטה בסריקה'); assert.equal(gateCard(c), '');
  c.run('startReceiptQuantityReview(true)');
  assert.match(c.toasts.at(-1), OLD_TOAST); assert.equal(c.run('currentView'), 'reconcile', 'כמו עד 164');
  c.run(`setView('receiving'); globalThis.audits = 0; const auditNow = receiptPriceAudit; receiptPriceAudit = function () { audits++; return auditNow.apply(this, arguments); };`);
  c.run(`scanPurpose = 'field'; audits = 0; refreshPriceScannerNotice()`);
  assert.equal(c.run('audits'), 0, 'מצלמת הקליטה סגורה — בלי חישוב'); assert.equal(c.run(`$('scanPriceNotice').classList.contains('hidden')`), true);
  c.run(`scanPurpose = 'receiving'; audits = 0; refreshPriceScannerNotice()`);
  assert.equal(c.run('audits'), 1); assert.equal(c.run(`$('scanPriceNotice').classList.contains('hidden')`), false);
});

test('11. שתי תעודות, והשורה בלי מוצר בשנייה: "2 התעודות נקראו", הכרטיס של השורה מהתעודה השנייה, והרשימה עולה עם שתי התעודות', async () => {
  const second = paper([['milk', 5], ['cream', 2]], '4471012');
  second.rows[1] = { ...second.rows[1], code: '77777', description: 'גביע לבן' };
  const c = await scanned([paper([['milk', 12], ['cottage', 6]], '4471011'), second]);
  assert.equal(c.run('currentView'), 'receiving'); assert.equal(c.run('receiptQuantityIntent'), 'lines');
  assert.match(gateCard(c), /^2 התעודות נקראו · 4 שורות/); assert.match(gateCard(c), /צריך רק לבחור מוצר לשורה אחת — ואז ממשיכים לקלוט/);
  assert.equal(c.toasts.at(-1), 'התעודות נקראו. צריך רק לבחור מוצר לשורה אחת — ואז ממשיכים לקלוט.');
  const row = section(app(c), '<section data-row-actions data-gate-rows');
  assert.equal((row.match(/<article/g) || []).length, 1); assert.match(strip(row), /גביע לבן קוד בנייר 77777/);
  assert.match(row, /data-role="rowfix-pick" data-doc="1" data-row="1"/, 'השורה השנייה של התעודה השנייה');
  assert.doesNotMatch(screen(c), /לא נסרקה אף יחידה|חסר ₪/);
  assert.equal(c.run(`receiptPickRowProduct(1, 1, 'cream')`), true); runQueued(c);
  assert.equal(modalOpen(c), true, 'הבדיקה נפתחה לבד'); assert.equal(review(c).pending, undefined); assert.equal(review(c).docs.length, 2, 'שתי התעודות ברשימה');
  assert.equal(gateCard(c), '');
});

test('12. הגרסה (166: סגירת התעודה אינה מחכה למנתח), כולל ההערה ב-service worker', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8'), sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(html, /const APP_VERSION = '166';/);
  assert.match(sw, /^\/\/ גרסה 166 — /);
});
