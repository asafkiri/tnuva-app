// v164 — מבצע שבתעודה ואינו במערכת: כתוב על המוצר, עם "פתח מבצע" — בבדיקה שורה-שורה ובתעודה שנשמרה פתוחה (כמו יטבתה 418).
// בעל העסק, 15.11.2026, ביטבתה: "יש מבצע בתעודה שלא קיים במערכת. זה לא הציג את זה בצורה ברורה גם במהלך קליטת התעודה וגם עכשיו
// אחרי שקלטתי את התעודה. צריך להיות מוצג על המוצר: בתעודה קיים מבצע כזה וכזה עם כזה אחוז הנחה, וכפתור 'פתח מבצע' — זה לא קיים
// במערכת, פתח אותו עכשיו במהירות, אפילו עוד במהלך הקליטה. ואם המשתמש לא פתח במהלך הקליטה — אז אחרי שהיא נסגרה." ואחרי שיטבתה
// עלתה: "עכשיו אני רוצה לעשות את העדכון הזה גם בתנובה".
// בתנובה כל שורה מודפסת במחיר מלא, שורת מבצע מסומנת בכוכבית, וההנחות יושבות בשורת סיכום אחת. נתונים מומצאים: תעודה של 4 שורות —
// חלב 12, קוטג׳ 6 (כוכבית; 15% — מבצע שקיים במערכת), שיבולת שועל אגוזי לוז 4 (כוכבית; 15% — בנייר בלבד: 4 × ₪8.82 × 15% = ₪5.29)
// ושמנת 2. הנחת הסיכום: ₪6.30 + ₪5.29 = ₪11.59. במערכת שני מבצעים בתוקף ב-15.11 (שניהם 1.11–30.11).
// מה שנבדק:
// 1. הזיהוי בקליטה (receiptPaperPromos): רק שיבולת השועל, 15%, עם המספרים; האחוז (paperPromoExactPct — לאגורה); ומה אינו "מבצע שלא
//    קיים במערכת" — כוכבית כשההנחה כבר מוסברת, מבצע שכבר קיים באותו יום, מחיר מודפס שאינו מחיר המאגר, ושורה בלי כוכבית.
// 2. הבדיקה שורה-שורה: ההודעה והכפתור על שורת המוצר — פתוחה ומקופלת; שורות אחרות בדיוק כמו ב-163; הכרטיס שמעל המצלמה.
// 3. החלון "פתח מבצע": ממולא מראש (15%, התקופה של שאר המבצעים, שם המוצר); בדיקת השדות; אזהרה ו"פתח בכל זאת"; "ביטול".
// 4. "פתח מבצע" מהרשימה, בזמן הקליטה: המבצע נשמר, ההודעה מתחלפת באישור, הסימונים לא משתנים — והקליטה נשמרת בדיוק כמו קליטה
//    שבה המבצע היה קיים מראש (שורת מבצע 15%, "אומתה").
// 5. בלי לפתוח: מסך ההשוואה נעול כמו קודם ("חסר מבצע במאגר"), והכפתור שבכרטיס פותח את אותו חלון; "שמור כתעודה פתוחה" — חלון
//    הסיכום עם ההודעה והכפתור; "פתח מבצע" משם — הסיכום נסגר, וההשוואה חוזרת ל"הכול תואם".
// 6. התעודה שנשמרה פתוחה: ההודעה על שורת המוצר, "מה לעשות עכשיו", ולמה היא פתוחה גם כשהכרטיס מקופל; "פתח מבצע" — השורה עוברת
//    למחיר המבצע (אותו חישוב של "שמור שינויים" במסך עריכת התעודה), התעודה נסגרת, והכרטיס נשאר פתוח; תעודה נוספת מאותה תקופה.
// 7. הזיהוי בתעודה שמורה (savedReceiptPaperPromos), ומתי התעודה אינה משתנה: מבצע שאינו סוגר את פער הסכום שלה, וכתיבה שנכשלה;
//    תעודה שיש בה גם חוסר — פער הסכום נסגר, והחוסר נשאר פתוח.
// 8. התקופה (paperPromoPeriod): של שאר המבצעים; החודש של התעודה; בלי להיכנס למבצע אחר של אותו מוצר; האזהרות; ושמירה שנכשלה.
// 9. שתי שורות בכוכבית בלי מבצע: האחוז אינו ידוע — ההודעה אומרת זאת, והחלון מחכה לאחוז; אחרי שהראשון נפתח, השני כבר ידוע.
// 10. טלפון שהקליטה אינה שלו כרגע: המבצע נפתח (הוא שייך למאגר), המסך מחושב מחדש — והקליטה עצמה אינה נערכת מכאן.
// 11. הרשימה אינה מריצה את בדיקת המחירים המלאה בכל סימון: המבצעים שלה מחושבים פעם אחת, ושוב רק כשמבצע או מחיר במאגר משתנים.
// 12. הגרסה; ומסך עריכת התעודה שומר בדיוק כמו קודם (receiptFixState / receiptFixUpdateData).
// הרצה: node --test tools/paper-promo.test.mjs
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime, fakeCloud } from './receipt-scan-harness.mjs';

const products = [
  { id: 'milk', name: 'חלב 3% בקרטון 1 ליטר', code: '8', barcode: '7290000000008', price: 5, posPrice: 6.9 },
  { id: 'cottage', name: 'קוטג׳ 5% 250 גרם', code: '15', barcode: '7290000000015', price: 7, posPrice: 9.9 },
  { id: 'hazel', name: 'שיבולת שועל אגוזי לוז', code: '22', barcode: '7290000000022', price: 8.82, posPrice: 12.9 },
  { id: 'cream', name: 'שמנת חמוצה 15% 200 מ״ל', code: '39', barcode: '7290000000039', price: 2, posPrice: 3.5 },
  { id: 'yogurt', name: 'יוגורט טבעי 150 גרם', code: '46', barcode: '7290000000046', price: 3, posPrice: 4.5 }
];
const NOV = { start: '2026-11-01', end: '2026-11-30', minQty: 1, minUnit: 'unit', cartonSize: null, type: 'receipt' };
const promos = [
  { id: 'p-cottage', name: 'קוטג׳ 15%', pct: 15, productIds: ['cottage'], ...NOV },
  { id: 'p-yogurt', name: 'יוגורטים 10%', pct: 10, productIds: ['yogurt'], ...NOV }
];
const HAZEL_PROMO = { id: 'p-hazel', name: 'שיבולת שועל אגוזי לוז', pct: 15, productIds: ['hazel'], ...NOV };
const r2 = n => Math.round(n * 100) / 100;
// תעודה כמו שתנובה מדפיסה: כל שורה במחיר מלא, כוכבית ליד שורת מבצע, וכל ההנחות בשורת הסיכום (discount). spec: [מוצר, כמות, כוכבית, מחיר].
function paper(spec, discount, { number = '561010900', date = '2026-11-15', catalog = products } = {}) {
  const rows = spec.map(([id, q, star = false, unit], i) => { const p = catalog.find(x => x.id === id), price = unit == null ? p.price : unit;
    return { section: 'items', sourcePage: 1, lineNumber: i + 1, code: p.code, description: p.name, quantity: q, unitPriceExVat: price, lineTotalExVat: r2(q * price), promoStar: !!star, confidence: .95 }; });
  const gross = r2(rows.reduce((n, r) => n + r.lineTotalExVat, 0));
  return { noteIndex: 0, docType: 'invoice', docNumber: number, docDate: date, pageCount: 1, vatPct: 18, rows, confidence: .95,
    itemsSectionTotalExVat: gross, itemsPrintedLines: spec.length, promoDiscountExVat: discount, documentDiscountExVat: discount, subtotalExVat: r2(gross - discount), netToChargeExVat: r2(gross - discount), warnings: [] };
}
const NOTE = [['milk', 12], ['cottage', 6, true], ['hazel', 4, true], ['cream', 2]];
const DISCOUNT = 11.59; // 6 × 7 × 15% = 6.30, ועוד 4 × 8.82 × 15% = 5.29
const json = (r, e) => JSON.parse(r.run('JSON.stringify(' + e + ')'));
const strip = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const settle = async () => { for (let i = 0; i < 40; i++) await new Promise(res => setImmediate(res)); };
// האפליקציה במסך הקליטה, שירות הפענוח עונה לכל תעודה, ו"התחל בדיקה שורה-שורה" נלחץ — הרשימה על המסך
async function scan(papers, { catalog = products, system = promos, ...opts } = {}) {
  const cloud = fakeCloud();
  const c = runtime('tnuva', { cloud, data: { products: catalog, promos: structuredClone(system), items: [], paper: { ok: true, serviceVersion: 20, scan: { warnings: [], documents: [] } } }, ...opts });
  await cloud.tick();
  const original = c.context.fetch;
  c.context.fetch = async (url, options) => {
    if (!String(url).endsWith('/scan')) return original(url, options);
    const sent = options?.body || '', index = papers.findIndex((p, i) => sent.includes('UEFQRVI' + i));
    const body = JSON.stringify({ ok: true, serviceVersion: 20, model: 'fixture', requestId: 'p' + index, scan: { warnings: [], documents: papers[index] ? [structuredClone(papers[index])] : [] } });
    return { ok: true, status: 200, text: async () => body, json: async () => JSON.parse(body) };
  };
  c.run(`todayStr = () => '2026-11-15'; currentView = 'receiving'; mainMode = 'receiving'; receiptDupConfirmed = true;
    testConfirms = []; showConfirm = (title, message, label, cb) => testConfirms.push({ title, message, label, cb });
    navigator.vibrate = () => {};
    window.BarcodeDetector = class { detect() { return Promise.resolve([]); } };
    navigator.mediaDevices = { getUserMedia: async () => ({ getTracks: () => [], getVideoTracks: () => [] }) };
    $('scanVideo').play = async () => {};
    aiScanDocuments = ${JSON.stringify(papers.map((p, i) => ({ noteIndex: i, amount: null, units: null, lines: null, pages: [{ dataUrl: 'data:image/jpeg;base64,UEFQRVI' + i, orientationConfirmed: true }] })))}; renderReceiving();`);
  await c.run(`tnuvaStartPaperScan({ manualQuantities: true, intent: 'lines' })`); await settle();
  assert.equal(c.run('receiptPaperScanState'), 'ok', 'התעודה נקראה');
  assert.equal(c.run(`!!receiptQuantityReview && receiptQuantityReview.mode === 'lines' && !receiptQuantityReview.pending`), true, 'הרשימה על המסך');
  return c;
}
const note = (opts = {}) => scan([paper(NOTE, DISCOUNT)], opts);
const click = (r, dataset) => r.run(`receiptLineCheckClick({ target: { closest: () => ({ dataset: ${JSON.stringify(dataset)} }) } })`);
const rows = r => r.run(`$('receiptQuantityRows').innerHTML`);
const marks = r => json(r, 'receiptQuantityReview').docs.map(d => d.lines.map(l => l.mark + (l.got ? ':' + l.got : '')).join(','));
function row(r, di, li) {
  const h = rows(r), i = h.indexOf('<div id="lineCheck_' + di + '_' + li + '"');
  assert.ok(i >= 0, 'שורה ' + di + ':' + li + ' קיימת');
  const ends = [h.indexOf('<div id="lineCheck_', i + 10), h.indexOf('<section', i), h.indexOf('</section>', i)].filter(x => x > 0);
  return h.slice(i, ends.length ? Math.min(...ends) : undefined);
}
const markAll = (r, n = NOTE.length) => { for (let k = 0; k < n; k++) click(r, { lineMark: '0:' + k + ':ok' }); };
const finish = async r => { r.events.get('receiptQuantityConfirm:click')({}); await settle(); };
// החלון "פתח מבצע"
const sheet = r => json(r, 'paperPromoSheet');
const sheetShown = r => !r.run(`$('paperPromoModal').classList.contains('hidden')`);
const sheetHtml = r => r.run(`$('paperPromoBody').innerHTML`);
const sheetType = (r, field, value) => r.run(`paperPromoSheetInput({ target: { dataset: { ppField: ${JSON.stringify(field)} }, value: ${JSON.stringify(value)} } })`);
const sheetClick = async (r, action) => { r.run(`paperPromoSheetClick({ target: { closest: () => ({ dataset: { ppAction: ${JSON.stringify(action)} } }) } })`); await settle(); };
const sheetMsg = r => strip(r.run(`$('paperPromoMsg').innerHTML`)).replace(/&quot;/g, '"');
const saveLabel = r => r.run(`$('paperPromoSave').textContent`);
const promoWrites = r => r.writes.filter(w => w.op === 'set' && w.path.includes('promos'));
const fixWrites = r => r.writes.filter(w => w.op === 'update' && w.path.includes('receipts'));
const app = r => r.run('app.innerHTML');
const summaryShown = r => !r.run(`$('receiptSummaryModal').classList.contains('hidden')`);
const NOTICE = /<div data-paper-promo="hazel" class="mt-2 rounded-xl border-2 border-rose-300 bg-white p-2\.5 text-right"><div class="text-sm font-black text-rose-700"><i class="fa-solid fa-tag" aria-hidden="true"><\/i> בתעודה קיים מבצע: 15% הנחה<\/div><div class="text-xs font-bold text-slate-700 mt-0\.5">₪7\.50 ליח׳ במקום ₪8\.82 · המבצע לא קיים במערכת<\/div><button type="button" data-role="paper-promo-open" data-id="hazel" aria-label="פתח מבצע: שיבולת שועל אגוזי לוז" class="btn-tap w-full min-h-\[44px\] mt-2 rounded-xl bg-rose-600 text-white font-black text-sm flex items-center justify-center gap-2"><i class="fa-solid fa-plus" aria-hidden="true"><\/i> פתח מבצע<\/button><\/div>/;
const COMPACT = /<div data-paper-promo="hazel" class="mt-1\.5 rounded-xl border-2 border-rose-300 bg-white px-2\.5 py-1\.5 flex items-center justify-between gap-2 text-right"><div class="min-w-0"><div class="text-\[13px\] font-black text-rose-700 leading-tight"><i class="fa-solid fa-tag" aria-hidden="true"><\/i> בתעודה קיים מבצע 15%<\/div><div class="text-\[11px\] font-bold text-slate-600 leading-tight mt-0\.5">₪7\.50 במקום ₪8\.82 · לא קיים במערכת<\/div><\/div><button type="button" data-role="paper-promo-open" data-id="hazel"( data-receipt="[^"]+")? aria-label="פתח מבצע: שיבולת שועל אגוזי לוז" class="btn-tap shrink-0 min-h-\[44px\] px-3 rounded-lg bg-rose-600 text-white text-xs font-black whitespace-nowrap">פתח מבצע<\/button><\/div>/;
// מהרשימה עד התעודה השמורה: "סיום", ההחלה אם היא עוד לא נעשתה לבד, ו"אשר וקלוט"
async function finishAndSave(r) {
  await finish(r);
  if (!r.run('!!pendingReceipt')) { r.click('ai-apply'); await settle(); }
  assert.ok(r.run('!!pendingReceipt'), json(r, 'aiScanEvaluation && aiScanEvaluation.errors')?.join(';'));
  await r.run('confirmReceipt()'); await settle();
  const w = r.writes.find(x => x.op === 'set' && x.path.includes('receipts'));
  assert.ok(w, 'התעודה נשמרה');
  return { id: w.path[w.path.length - 1], ...w.data };
}
// בלי לפתוח את המבצע: "סיום", מסך ההשוואה הנעול, "שמור כתעודה פתוחה ואטפל אחר כך" (עם שאלת האישור שלו) — עד חלון הסיכום
async function park(r) {
  await finish(r);
  assert.equal(r.run('aiScanEvaluation.valid'), false);
  r.click('rc-recon-save'); await settle();
  assert.deepEqual(json(r, 'testConfirms.map(x => [x.title, x.label])'), [['הפרש לא מוסבר', 'שמור כפתוחה']]);
  r.run('testConfirms.pop().cb()'); await settle();
  assert.equal(summaryShown(r), true);
}
async function parkAndSave(r) {
  await park(r);
  await r.run('confirmReceipt()'); await settle();
  const w = r.writes.find(x => x.op === 'set' && x.path.includes('receipts'));
  assert.ok(w, 'התעודה נשמרה');
  return { id: w.path[w.path.length - 1], ...w.data };
}
// התעודה השמורה במסך ההיסטוריה (בלי קליטה פתוחה)
function history(r, list) {
  r.context.testReceipts = structuredClone(list);
  r.run(`receipts = testReceipts; returns = []; currentView = 'receiptsHistory'; renderReceiptsHistory();`);
}
function card(r, id) {
  const h = app(r), a = h.indexOf('<details data-receipt-card="' + id + '"');
  assert.ok(a >= 0, 'הכרטיס של ' + id);
  const next = h.indexOf('<details data-receipt-card="', a + 10);
  return h.slice(a, next > 0 ? next : undefined);
}
const HIT = { productId: 'hazel', name: 'שיבולת שועל אגוזי לוז', pct: 15, base: 8.82, charged: 7.497, qty: 4, saving: 5.29, day: '2026-11-15', lastDay: '2026-11-15' };

test('1. הזיהוי בקליטה: רק המוצר שסומן בכוכבית ואין לו מבצע במערכת, עם האחוז שמשחזר את ההנחה הלא-מוסברת לאגורה; ומה אינו כזה', async () => {
  const r = await note();
  assert.deepEqual(json(r, 'receiptPaperPromos()'), [HIT]);
  assert.deepEqual(json(r, '[...receiptPaperPromoMap().keys()]'), ['hazel']);
  // האחוז: מספר שלם שמשחזר את ההנחה בדיוק לאגורה (הדוגמה של v17: 9 × 19.60 × 7% = 12.35, ואילו 9 × 10.55 × 13% = 12.34)
  const pct = (qty, unit, cents) => json(r, `paperPromoExactPct([{ quantity: ${qty}, originalUnitPrice: ${unit} }], ${cents})`);
  assert.deepEqual([pct(4, 8.82, 529), pct(9, 19.6, 1235), pct(9, 10.55, 1235), pct(4, 8.82, 530), pct(4, 8.82, 0), pct(2, 2, 569)], [15, 7, null, null, null, null]);
  // מוצר על פני שתי שורות: תנובה מעגלת כל שורה בנפרד (4 × 8.82 × 15% = 5.29, 3 × 8.82 × 15% = 3.97)
  assert.equal(json(r, `paperPromoExactPct([{ quantity: 4, originalUnitPrice: 8.82 }, { quantity: 3, originalUnitPrice: 8.82 }], 926)`), 15);
  // כוכבית כשההנחה כבר מוסברת לאגורה על ידי המבצעים שבמערכת (נקראה בשורה הלא נכונה, v158) — לא מבצע חסר
  const stray = await scan([paper(NOTE, 6.3)]);
  assert.deepEqual(json(stray, 'receiptPaperPromos()'), []);
  assert.doesNotMatch(rows(stray), /data-paper-promo/);
  // במערכת כבר יש מבצע על המוצר ביום התעודה — גם באחוז אחר, וגם כשהמינימום שלו לא הושג: לא מציעים לפתוח חדש
  for (const existing of [{ ...HAZEL_PROMO, pct: 10 }, { ...HAZEL_PROMO, minQty: 12 }]) {
    const has = await note({ system: [...promos, existing] });
    assert.deepEqual(json(has, 'receiptPaperPromos()'), [], JSON.stringify(existing));
  }
  // המחיר המודפס אינו מחיר המאגר — זה פער מחיר, לא מבצע
  const priced = await scan([paper([['milk', 12], ['cottage', 6, true], ['hazel', 4, true, 9.1], ['cream', 2]], DISCOUNT)]);
  assert.deepEqual(json(priced, 'receiptPaperPromos()'), []);
  // בלי כוכבית על השורה — אין על המוצר סימון מבצע בנייר (מסך ההשוואה ממשיך לזהות "חסר מבצע במאגר" לפי הסכום, כמו קודם)
  const noStar = await scan([paper([['milk', 12], ['cottage', 6, true], ['hazel', 4], ['cream', 2]], DISCOUNT)]);
  assert.deepEqual(json(noStar, 'receiptPaperPromos()'), []);
  assert.equal(json(noStar, `aiEvaluateInvoiceScan(aiScanResponse).findings.filter(f => f.type === 'promo_missing_catalog').map(f => [f.productId, f.pct])`).join(), 'hazel,15');
  // לפני שהתעודה נקראה, ובלי תעודה — רשימה ריקה
  r.run('aiScanResponse = null');
  assert.deepEqual(json(r, 'receiptPaperPromos()'), []);
});

test('2. הבדיקה שורה-שורה: ההודעה ו"פתח מבצע" על שורת המוצר — פתוחה ומקופלת; שאר השורות כמו קודם; הכרטיס שמעל המצלמה אומר זאת', async () => {
  const r = await note();
  // שורה פתוחה: ההודעה מתחת לפרטי המוצר, מעל כפתורי הסימון
  const open = row(r, 0, 2);
  assert.match(open, NOTICE);
  assert.match(open, /יח׳ בתעודה<\/div><\/div><\/div><div data-paper-promo="hazel"[\s\S]*פתח מבצע<\/button><\/div><div class="grid grid-cols-\[1fr_auto_auto\] gap-1\.5 mt-3" role="group"/);
  assert.equal((rows(r).match(/data-paper-promo="/g) || []).length, 1, 'רק על שורת המוצר');
  // שאר השורות — בדיוק מה שהיה בלי השינוי (אותו HTML כמו ציור בלי מבצעים), גם פתוחות וגם מקופלות
  const plain = (di, li) => r.run(`receiptLineRowHtml(${di}, ${li}, receiptQuantityReview.docs[${di}].lines[${li}], null, new Map())`);
  for (const li of [0, 1, 3]) assert.equal(row(r, 0, li), plain(0, li));
  assert.notEqual(row(r, 0, 2), plain(0, 2));
  // ההודעה אינה סימון: שום שורה לא סומנה
  assert.deepEqual(marks(r), [',,,']);
  // שורה מקופלת (אחרי "הגיע"): שתי קומות — מה שהגיע ו"שנה", ומתחת ההודעה הקצרה עם הכפתור
  markAll(r);
  const folded = row(r, 0, 2);
  assert.match(folded, /^<div id="lineCheck_0_2" class="rounded-2xl border-2 px-3 py-2 mb-2\.5 border-emerald-300 bg-emerald-50"><div class="flex items-center justify-between gap-2"><div class="min-w-0">/);
  assert.match(folded, /שנה<\/button><\/div><div data-paper-promo="hazel"/);
  assert.match(folded, COMPACT); assert.equal(folded.match(COMPACT)[1], undefined, 'בקליטה — בלי תעודה שמורה');
  // שורה מקופלת רגילה — כמו ב-163: קומה אחת
  assert.match(row(r, 0, 0), /^<div id="lineCheck_0_0" class="rounded-2xl border-2 px-3 py-2 mb-2\.5 flex items-center justify-between gap-2 border-emerald-300 bg-emerald-50"><div class="min-w-0">/);
  for (const li of [0, 1, 3]) assert.equal(row(r, 0, li), plain(0, li));
  assert.deepEqual(marks(r), ['ok,ok,ok,ok']);
  // "לא הגיע" — גם שם ההודעה נשארת
  click(r, { lineOpen: '0:2' }); click(r, { lineMark: '0:2:none' });
  assert.match(row(r, 0, 2), /border-rose-300 bg-rose-50"><div class="flex items-center justify-between gap-2">/);
  assert.match(row(r, 0, 2), COMPACT);
  // הכרטיס שמעל המצלמה: נאמר, בלי כפתור (אחרי הסימון חוזרים לשורה שברשימה)
  const cam = await note();
  cam.events.get('receiptLineScan:click')(); await settle();
  assert.equal(cam.run('scanPurpose'), 'linecheck', 'המצלמה נפתחה');
  const cardHtml = code => { cam.run('lastScanTime = 0'); cam.run(`onScanned(${JSON.stringify(code)})`); return cam.run(`$('scanLineCard').innerHTML`); };
  const hazelCard = cardHtml('7290000000022');
  assert.match(hazelCard, /<div data-paper-promo-info="hazel" class="text-xs font-black text-rose-700 mt-1"><i class="fa-solid fa-tag" aria-hidden="true"><\/i> בתעודה קיים מבצע: 15% הנחה — לא קיים במערכת\. "פתח מבצע" בשורה שברשימה\.<\/div>/);
  assert.doesNotMatch(hazelCard, /paper-promo-open/);
  cam.run(`receiptLineScanCardClick({ target: { closest: () => ({ dataset: { scanDismiss: '' } }) } })`);
  const milkCard = cardHtml('7290000000008');
  assert.match(milkCard, /חלב 3% בקרטון 1 ליטר/);
  assert.doesNotMatch(milkCard, /data-paper-promo/);
});

test('3. החלון "פתח מבצע": ממולא מראש; שדה ריק ותאריכים הפוכים נעצרים; אחוז אחר — אזהרה ו"פתח בכל זאת"; "ביטול" לא שומר', async () => {
  const r = await note();
  assert.equal(sheetShown(r), false);
  click(r, { role: 'paper-promo-open', id: 'hazel' });
  assert.equal(sheetShown(r), true);
  const s = sheet(r);
  assert.deepEqual([s.productId, s.receiptId, s.pct, s.start, s.end, s.name, s.from, s.error, s.warnings, s.force, s.busy], ['hazel', null, '15', '2026-11-01', '2026-11-30', 'שיבולת שועל אגוזי לוז', 'promos', '', [], false, false]);
  const h = sheetHtml(r);
  assert.match(h, /<h3 class="font-black text-lg text-slate-800">פתיחת מבצע מהתעודה<\/h3>/);
  assert.match(h, /<div data-paper-promo-evidence class="[^"]*">בתעודה: 4 יח׳ ב-₪7\.50 ליח׳ במקום ₪8\.82<div class="text-xs font-black text-rose-700 mt-0\.5">15% הנחה · ₪5\.29 מהנחת המבצעים שבסיכום התעודה<\/div><\/div>/);
  assert.match(h, /<input id="paperPromoPct" data-pp-field="pct" type="text" inputmode="decimal" autocomplete="off" value="15"/);
  assert.match(h, /<input id="paperPromoStart" data-pp-field="start" type="date" value="2026-11-01"/);
  assert.match(h, /<input id="paperPromoEnd" data-pp-field="end" type="date" value="2026-11-30"/);
  assert.match(h, /<input id="paperPromoName" data-pp-field="name" type="text" autocomplete="off" value="שיבולת שועל אגוזי לוז"/);
  assert.match(strip(h), /כמו שאר המבצעים שבתוקף ביום התעודה \(15\.11\.2026\) — אפשר לשנות\./);
  assert.match(strip(h).replace(/&quot;/g, '"'), /המבצע נפתח למוצר הזה בלבד, בלי מינימום\. המוצר שייך למבצע שכבר קיים\? "שייך למבצע קיים" — בבדיקת המחירים שבמסך הקליטה\./);
  // הפוקוס בפתיחה — על הכפתור הראשי (data-autofocus, למנהל החלונות), לא על שדה: המקלדת לא קופצת
  assert.match(h, /<button type="button" id="paperPromoSave" data-pp-action="save" data-autofocus class="[^"]*">פתח מבצע<\/button>/);
  assert.equal((h.match(/data-autofocus/g) || []).length, 1);
  // שדה ריק / תאריכים הפוכים — לא נשמר, והחלון נשאר
  sheetType(r, 'pct', ''); await sheetClick(r, 'save');
  assert.equal(sheetMsg(r), 'מלא אחוז הנחה, תאריך התחלה ותאריך סיום');
  sheetType(r, 'pct', '15'); assert.equal(sheetMsg(r), '', 'הקלדה מנקה את ההודעה');
  sheetType(r, 'end', '2026-10-31'); await sheetClick(r, 'save');
  assert.equal(sheetMsg(r), 'תאריך הסיום חייב להיות אחרי ההתחלה');
  sheetType(r, 'end', '2026-11-30');
  // אחוז שאינו נותן את ההנחה שבתעודה — אזהרה, והכפתור נהיה "פתח בכל זאת"; תיקון מחזיר ל"פתח מבצע"
  sheetType(r, 'pct', '12,5'); await sheetClick(r, 'save');
  assert.equal(sheetMsg(r), '12.5% לא נותן את ההנחה שבתעודה (₪5.29) — בתעודה ההנחה היא 15%, וההפרש יישאר פתוח. אפשר לתקן, או ללחוץ "פתח בכל זאת".');
  assert.equal(saveLabel(r), 'פתח בכל זאת');
  sheetType(r, 'pct', '15'); assert.equal(saveLabel(r), 'פתח מבצע'); assert.equal(sheetMsg(r), '');
  // תקופה שאינה כוללת את יום התעודה
  sheetType(r, 'start', '2026-11-16'); await sheetClick(r, 'save');
  assert.match(sheetMsg(r), /^יום התעודה \(15\.11\.2026\) אינו בתוך התקופה — המבצע לא יחול על התעודה הזאת\. אפשר לתקן/);
  assert.equal(promoWrites(r).length, 0);
  // "ביטול", הרקע ו-Escape סוגרים בלי לשמור
  await sheetClick(r, 'cancel');
  assert.equal(sheetShown(r), false); assert.equal(sheet(r), null); assert.equal(sheetHtml(r), '');
  click(r, { role: 'paper-promo-open', id: 'hazel' });
  r.run(`paperPromoSheetClick({ target: $('paperPromoModal') })`);
  assert.equal(sheetShown(r), false);
  click(r, { role: 'paper-promo-open', id: 'hazel' });
  // Escape סוגר רק את החלון הזה — האירוע נעצר כאן, כדי שמנהל החלונות לא יסגור גם את חלון הבדיקה שמתחתיו
  const esc = { key: 'Escape', stopped: 0, preventDefault() {}, stopPropagation() { this.stopped++; } };
  r.events.get('paperPromoModal:keydown')(esc);
  assert.equal(sheetShown(r), false); assert.equal(esc.stopped, 1);
  assert.equal(r.run(`!$('receiptQuantityModal').classList.contains('hidden')`), true, 'חלון הבדיקה נשאר פתוח');
  assert.equal(r.writes.length, 0); assert.equal(r.run('promos.length'), 2);
  assert.match(row(r, 0, 2), NOTICE, 'ההודעה נשארת');
  // מוצר שאין לו (או כבר אין לו) מבצע חסר — החלון לא נפתח, והרשימה אומרת למה
  click(r, { role: 'paper-promo-open', id: 'milk' });
  assert.equal(sheetShown(r), false);
  assert.deepEqual(json(r, 'receiptLineNotice'), { tone: 'warn', text: 'המבצע כבר קיים במערכת, או שנתוני התעודה השתנו' });
});

test('4. "פתח מבצע" מהרשימה, בזמן הקליטה: המבצע נשמר, השורה מאשרת, הסימונים נשארים — והקליטה נשמרת כמו קליטה שבה המבצע היה קיים מראש', async () => {
  const r = await note();
  click(r, { lineMark: '0:0:ok' }); click(r, { lineMark: '0:1:qty' }); r.run(`receiptLineCheckInput({ target: { dataset: { lineGot: '0:1' }, value: '5' } })`);
  const before = marks(r), counted = r.run('JSON.stringify(receiptList)'), paperBefore = r.run('JSON.stringify(aiScanResponse.scan.documents[0].__tnuvaPaper)');
  click(r, { role: 'paper-promo-open', id: 'hazel' });
  await sheetClick(r, 'save');
  assert.equal(sheetShown(r), false);
  const w = promoWrites(r);
  assert.equal(w.length, 1);
  const id = w[0].path.at(-1);
  assert.deepEqual(w[0].data, { name: 'שיבולת שועל אגוזי לוז', pct: 15, start: '2026-11-01', end: '2026-11-30', minQty: 1, minUnit: 'unit', cartonSize: null, productIds: ['hazel'], type: 'receipt', operationId: id });
  assert.equal(w[0].operationId, id);
  assert.deepEqual(json(r, `promos.find(p => p.id === ${JSON.stringify(id)})`), { id, ...w[0].data });
  // הרשימה: ההודעה בראש החלון, ועל השורה אישור במקום "פתח מבצע"; הסימונים, הספירה והנייר — כמו שהיו
  assert.deepEqual(json(r, 'receiptLineNotice'), { tone: 'ok', text: 'המבצע נפתח: שיבולת שועל אגוזי לוז · 15% ✓' });
  assert.doesNotMatch(rows(r), /data-paper-promo="|paper-promo-open/);
  assert.match(row(r, 0, 2), /<div data-paper-promo-done="hazel" class="mt-1\.5 rounded-xl border border-emerald-300 bg-white px-2\.5 py-1\.5 text-\[13px\] font-black text-emerald-800 text-right"><i class="fa-solid fa-circle-check" aria-hidden="true"><\/i> המבצע נפתח במערכת: 15% · 1\.11\.2026 עד 30\.11\.2026<\/div><div class="grid/);
  assert.deepEqual(marks(r), before); assert.equal(r.run('JSON.stringify(receiptList)'), counted);
  assert.equal(r.run('JSON.stringify(aiScanResponse.scan.documents[0].__tnuvaPaper)'), paperBefore);
  assert.deepEqual(json(r, 'receiptPaperPromos()'), []);
  // בדיקת המחירים הושלמה: ההנחה כולה מוסברת
  assert.equal(r.run('receiptPriceAudit().complete'), true);
  assert.equal(json(r, 'receiptPriceAudit().documents[0].summaryPending'), false);
  // אחרי רענון הדף: המבצע במאגר, ההודעה לא חוזרת
  r.run('saveReceiptDraft()');
  const again = runtime('tnuva', { storage: r.storage, cloud: fakeCloud(), data: { products, promos: json(r, 'promos'), items: [], paper: { ok: true, serviceVersion: 20, scan: { warnings: [], documents: [] } } } });
  again.run(`todayStr = () => '2026-11-15'; restoreReceiptDraft();`);
  assert.deepEqual(json(again, 'receiptPaperPromos()'), []);
  assert.deepEqual(marks(again), before);
  // עד התעודה השמורה — בדיוק כמו קליטה שבה המבצע היה במאגר מלכתחילה
  click(r, { lineMark: '0:1:ok' }); click(r, { lineMark: '0:2:ok' }); click(r, { lineMark: '0:3:ok' });
  const saved = await finishAndSave(r);
  const known = await note({ system: [...promos, HAZEL_PROMO] });
  assert.doesNotMatch(rows(known), /data-paper-promo/);
  markAll(known);
  const expected = await finishAndSave(known);
  const money = rc => ({ status: rc.status, items: rc.items, totalExVat: rc.totalExVat, calculatedExVat: rc.calculatedExVat, grossExVat: rc.grossExVat, supplierDiscount: rc.supplierDiscount, noteTotalInc: rc.noteTotalInc,
    unresolvedAmountGap: rc.unresolvedAmountGap, unresolvedUnitsGap: rc.unresolvedUnitsGap, supplierCreditClaim: rc.supplierCreditClaim, findings: rc.aiAudit && rc.aiAudit.findings, hasDiscrepancy: rc.aiAudit && rc.aiAudit.hasDiscrepancy });
  assert.deepEqual(money(saved), money(expected));
  assert.equal(saved.status, 'ok');
  assert.deepEqual(saved.items.find(l => l.productId === 'hazel'), { productId: 'hazel', name: 'שיבולת שועל אגוזי לוז', barcode: '7290000000022', qty: 4, unitPrice: 7.497, basePrice: 8.82, lineTotal: 29.99, promoPct: 15 });
  assert.equal(saved.totalExVat, 129.69); assert.equal(saved.unresolvedAmountGap, 0);
});

test('5. בלי לפתוח: מסך ההשוואה נעול כמו קודם, והכפתור שבכרטיס "חסר מבצע במאגר" פותח את אותו חלון; חלון הסיכום עם ההודעה והכפתור', async () => {
  const r = await note();
  markAll(r);
  await finish(r);
  assert.equal(r.run('currentView'), 'reconcile');
  assert.equal(r.run('aiScanEvaluation.valid'), false);
  const screen = app(r);
  // כמו ב-163: הכרטיס הכתום, והשורה בבדיקת המחירים עם "שייך למבצע קיים" ו"פתח מבצע חדש למוצר"
  assert.match(strip(screen), /חסר מבצע במאגר — זו הסיבה שהחשבון לא נסגר תנובה נתנה בתעודה הנחה של ₪5\.29 על שיבולת שועל אגוזי לוז , ולמוצר הזה אין מבצע במערכת\./);
  assert.match(screen, /<button data-role="ai-create-missing-promo" data-id="hazel" class="[^"]*"><i class="fa-solid fa-plus ml-1"><\/i>פתח מבצע 15% וחשב מחדש<\/button>/);
  assert.match(screen, /שייך למבצע קיים/); assert.match(screen, /פתח מבצע חדש למוצר/);
  // הכפתור שבכרטיס: אותו חלון "פתח מבצע" (עם התקופה והשם), לא שאלת אישור
  r.click('ai-create-missing-promo', 'hazel');
  assert.equal(sheetShown(r), true);
  assert.deepEqual(json(r, 'testConfirms'), []);
  assert.deepEqual([sheet(r).pct, sheet(r).start, sheet(r).end, sheet(r).receiptId], ['15', '2026-11-01', '2026-11-30', null]);
  await sheetClick(r, 'cancel');
  // "שמור כתעודה פתוחה ואטפל אחר כך" — חלון הסיכום אומר זאת, עם "פתח מבצע" (במקום "חזור למסך הקליטה להשלמת המבצע")
  await park(r);
  const sum = r.run(`$('rsBody').innerHTML`);
  assert.match(sum, COMPACT);
  assert.doesNotMatch(sum, /חזור למסך הקליטה להשלמת המבצע/);
  assert.match(strip(sum), /נשמר עם הפרשים — התעודה תסומן כפתוחה עד שתתוקן/);
  // "פתח מבצע" מחלון הסיכום: הסיכום נסגר, ההשוואה מחושבת מחדש — "הכול תואם", והשורה נקלטת כמבצע
  r.events.get('rsBody:click')({ target: { closest: sel => sel === '[data-role="paper-promo-open"]' ? { dataset: { role: 'paper-promo-open', id: 'hazel' } } : null } });
  assert.equal(sheetShown(r), true);
  await sheetClick(r, 'save');
  assert.equal(sheetShown(r), false); assert.equal(summaryShown(r), false); assert.equal(r.run('pendingReceipt'), null);
  assert.equal(promoWrites(r).length, 1);
  assert.equal(r.toasts.at(-1), 'המבצע נפתח: שיבולת שועל אגוזי לוז · 15% ✓');
  assert.equal(r.run('aiScanEvaluation.valid'), true);
  assert.deepEqual(json(r, 'aiScanEvaluation.errors'), []);
  assert.doesNotMatch(app(r), /חסר מבצע במאגר|data-paper-promo|ai-create-missing-promo/);
  assert.deepEqual(json(r, `reconcileData.filter(l => l.productId === 'hazel').map(l => [l.price, l.basePrice, l.promoPct, l.promoOn])`), [[7.497, 8.82, 15, true]]);
  if (!r.run('!!pendingReceipt')) { r.click('ai-apply'); await settle(); }
  await r.run('confirmReceipt()'); await settle();
  const w = r.writes.find(x => x.op === 'set' && x.path.includes('receipts'));
  assert.deepEqual([w.data.status, w.data.unresolvedAmountGap, w.data.totalExVat, w.data.items.find(l => l.productId === 'hazel').promoPct], ['ok', 0, 129.69, 15]);
});

test('6. התעודה שנשמרה פתוחה: כתוב על המוצר, עם "פתח מבצע"; אחריו השורה עוברת למחיר המבצע והתעודה נסגרת; גם תעודה נוספת מאותה תקופה', async () => {
  const r = await note();
  markAll(r);
  const rc = await parkAndSave(r);
  // נשמרה כמו עד היום: פתוחה, הפער הוא ההנחה שלא שויכה, והשורה במחיר המלא
  assert.deepEqual([rc.status, rc.unresolvedAmountGap, rc.totalExVat, rc.calculatedExVat, rc.noteTotalInc, rc.supplierDiscount, rc.aiAudit], ['open', -5.29, 129.69, 134.98, 129.69, 0, null]);
  assert.deepEqual(rc.items.find(l => l.productId === 'hazel'), { productId: 'hazel', name: 'שיבולת שועל אגוזי לוז', barcode: '7290000000022', qty: 4, unitPrice: 8.82, basePrice: 8.82, lineTotal: 35.28, promoPct: 0 });
  // תעודה נוספת מה-10.11, אותו מוצר ואותו מבצע שלא היה במאגר (נשמרה פתוחה באותה דרך)
  const older = structuredClone(rc); older.id = 'rc-older'; older.timestamp = Date.parse('2026-11-10T09:00:00'); older.date = '2026-11-10'; older.docDate = '2026-11-10';
  older.priceAudit.documents.forEach(d => { d.date = '2026-11-10'; }); older.priceAudit.rows.forEach(x => { x.date = '2026-11-10'; });
  history(r, [rc, older]);
  assert.deepEqual(json(r, 'savedReceiptPaperPromos(receipts[0])'), [HIT]);
  assert.deepEqual(json(r, 'savedReceiptPaperPromos(receipts[1])'), [{ ...HIT, day: '2026-11-10', lastDay: '2026-11-10' }]);
  const c = card(r, rc.id);
  // מקופל: למה התעודה פתוחה
  assert.match(c, /<span class="text-rose-600 font-black">מבצע בתעודה שלא קיים במערכת<\/span>/);
  assert.match(c, /^<details data-receipt-card="[^"]+" class="bg-white rounded-2xl border-2 border-rose-300 /);
  // על שורת המוצר; שורה רגילה — בדיוק כמו קודם
  assert.match(c, /<div class="py-1 border-b border-slate-100 last:border-0"><div class="flex items-center justify-between gap-2"><div class="min-w-0"><div class="text-sm font-bold text-slate-700 truncate">שיבולת שועל אגוזי לוז<\/div><div class="text-\[11px\] text-slate-400">4 × ₪8\.82<\/div><\/div><div class="text-sm font-black text-slate-600 shrink-0">₪35\.28<\/div><\/div><div data-paper-promo="hazel" /);
  assert.match(c, COMPACT); assert.equal(c.match(COMPACT)[1], ' data-receipt="' + rc.id + '"');
  assert.match(c, /<div class="flex items-center justify-between gap-2 py-1 border-b border-slate-100 last:border-0"><div class="min-w-0"><div class="text-sm font-bold text-slate-700 truncate">קוטג׳ 5% 250 גרם<\/div><div class="text-\[11px\] text-slate-400">6 × ₪5\.95 · מבצע 15%<\/div><\/div><div class="text-sm font-black text-slate-600 shrink-0">₪35\.70<\/div><\/div>/);
  // "מה לעשות עכשיו": המשפט, ההסבר שזה פער הסכום, והכפתור עם המוצר והתעודה
  assert.match(c, new RegExp('<div class="mt-2 bg-rose-50 border-2 border-rose-300 rounded-xl p-3" data-plain-action="paper_promo"><div class="text-\\[11px\\] font-black text-rose-600">מה לעשות עכשיו</div><div class="font-black text-slate-900 text-sm mt-0\\.5">בתעודה קיים מבצע שלא קיים במערכת · שיבולת שועל אגוזי לוז · 15%</div><div class="text-\\[11px\\] font-bold text-slate-600 mt-1">זו ההנחה שנשארה בתעודה כפער סכום \\(₪5\\.29\\)\\. אחרי "פתח מבצע" השורה עוברת למחיר המבצע, והפער נסגר\\.</div><button data-role="paper-promo-open" data-id="hazel" data-receipt="' + rc.id + '" class="btn-tap w-full mt-2 bg-rose-600 text-white rounded-xl py-2\\.5 font-black text-sm">פתח מבצע</button></div>'));
  assert.match(strip(c), /הפרשים מול התעודה פער סכום שטרם שויך ₪5\.29/);
  assert.match(card(r, 'rc-older'), COMPACT);

  // "פתח מבצע" מהשורה שבכרטיס
  const writesBefore = r.writes.length;
  r.click('paper-promo-open', 'hazel', { receipt: rc.id });
  assert.equal(sheetShown(r), true);
  assert.deepEqual([sheet(r).receiptId, sheet(r).pct, sheet(r).start, sheet(r).end], [rc.id, '15', '2026-11-01', '2026-11-30']);
  assert.match(strip(sheetHtml(r)), /המבצע נפתח למוצר הזה בלבד, בלי מינימום\. אחרי הפתיחה השורה בתעודה תעבור למחיר המבצע — רק אם זה סוגר את פער הסכום שנשאר בה\./);
  await sheetClick(r, 'save');
  const added = r.writes.slice(writesBefore);
  assert.deepEqual(added.map(w => [w.op, w.path.at(-2)]), [['set', 'promos'], ['update', 'receipts'], ['update', 'receipts']]);
  // שתי התעודות: השורה במחיר המבצע, הפער נסגר, הסטטוס "ok" — באותם שדות ש"שמור שינויים" במסך עריכת התעודה כותב
  for (const w of added.slice(1)) {
    assert.deepEqual(Object.keys(w.data).sort(), ['aiAudit', 'calculatedExVat', 'count', 'grossExVat', 'items', 'monthEndPromoSnapshots', 'monthEndRebates', 'receivedExVat', 'roundingAdjustment', 'status', 'totalExVat', 'totalIncVat', 'unresolvedAmountGap', 'unresolvedUnitsGap', 'vatPct']);
    assert.deepEqual([w.data.status, w.data.unresolvedAmountGap, w.data.unresolvedUnitsGap, w.data.totalExVat, w.data.calculatedExVat, w.data.grossExVat, w.data.aiAudit], ['ok', 0, 0, 129.69, 129.69, 129.69, null]);
    assert.deepEqual(w.data.items.find(l => l.productId === 'hazel'), { productId: 'hazel', name: 'שיבולת שועל אגוזי לוז', barcode: '7290000000022', qty: 4, unitPrice: 7.497, basePrice: 8.82, lineTotal: 29.99, promoPct: 15 });
    assert.deepEqual(w.data.items.filter(l => l.productId !== 'hazel'), rc.items.filter(l => l.productId !== 'hazel'), 'שאר השורות לא השתנו');
  }
  assert.deepEqual(added.slice(1).map(w => w.path.at(-1)), [rc.id, 'rc-older']);
  assert.deepEqual(json(r, 'receipts.map(x => [x.status, x.unresolvedAmountGap])'), [['ok', 0], ['ok', 0]]);
  assert.equal(r.toasts.at(-1), 'המבצע נפתח: שיבולת שועל אגוזי לוז · 15% · 2 תעודות אומתו ✓');
  // הכרטיס שממנו נפתח המבצע נשאר פתוח — גם בציור הבא (הסנכרון מהענן מצייר את המסך מחדש רגע אחר כך); האחר — סגור כרגיל
  assert.match(card(r, rc.id), /^<details data-receipt-card="[^"]+" open class="bg-white rounded-2xl border-2 border-emerald-300 /);
  assert.match(card(r, 'rc-older'), /^<details data-receipt-card="rc-older" class="bg-white rounded-2xl border-2 border-emerald-300 /);
  r.run('renderReceiptsHistory()');
  assert.match(card(r, rc.id), /^<details data-receipt-card="[^"]+" open class=/);
  r.run('paperPromoCardOpen.until = Date.now() - 1; renderReceiptsHistory()');
  assert.match(card(r, rc.id), /^<details data-receipt-card="[^"]+" class=/, 'לזמן קצר בלבד');
  // הכרטיס אחרי: אומתה, השורה מראה את המבצע, ואין עוד הצעה לפתוח
  const done = card(r, rc.id);
  assert.match(done, /<i class="fa-solid fa-circle-check"><\/i> אומתה<\/span>/);
  assert.match(done, /<div class="text-sm font-bold text-slate-700 truncate">שיבולת שועל אגוזי לוז<\/div><div class="text-\[11px\] text-slate-400">4 × ₪7\.497 · מבצע 15%<\/div>/);
  assert.doesNotMatch(done, /data-paper-promo|paper-promo-open|data-plain-action|הפרשים מול התעודה/);
  assert.deepEqual(json(r, 'receipts.map(x => savedReceiptPaperPromos(x).length)'), [0, 0]);
});

test('7. הזיהוי בתעודה שמורה; ומתי התעודה אינה משתנה: מבצע שאינו סוגר אותה לאגורה, כתיבה שנכשלה, ומסך עריכה פתוח', async () => {
  const r = await note();
  markAll(r);
  const rc = await parkAndSave(r);
  history(r, [rc]);
  const found = more => json(r, `savedReceiptPaperPromos(${JSON.stringify({ ...rc, ...more })}).map(x => [x.productId, x.pct, x.qty, x.saving])`);
  assert.deepEqual(found({}), [['hazel', 15, 4, 5.29]]);
  // תעודה מאוזנת, או שהנייר גבוה מהשורות — לא ההנחה הזאת; בלי בדיקת מחירים שמורה — אין ממה לגזור
  assert.deepEqual(found({ unresolvedAmountGap: 0 }), []);
  assert.deepEqual(found({ unresolvedAmountGap: 5.29 }), []);
  assert.deepEqual(found({ priceAudit: null }), []);
  // השורה כבר במחיר מבצע, או שמחיר השורה כבר אינו מחיר המאגר שנבדק
  assert.deepEqual(found({ items: rc.items.map(l => l.productId === 'hazel' ? { ...l, unitPrice: 7.497, promoPct: 15 } : l) }), []);
  assert.deepEqual(found({ items: rc.items.map(l => l.productId === 'hazel' ? { ...l, unitPrice: 8 } : l) }), []);
  assert.deepEqual(found({ items: rc.items.filter(l => l.productId !== 'hazel') }), []);
  // ההנחה כבר הוסברה כשהתעודה נשמרה (אין הנחה לא-מוסברת), או שהשורה לא סומנה בכוכבית
  const audit = fn => { const a = structuredClone(rc.priceAudit); fn(a); return { priceAudit: a }; };
  assert.deepEqual(found(audit(a => { a.documents[0].summaryPending = false; })), []);
  assert.deepEqual(found(audit(a => { a.documents[0].summaryRemainder = 0; })), []);
  assert.deepEqual(found(audit(a => { a.rows.find(x => x.productId === 'hazel').printedPromo = false; })), []);
  assert.deepEqual(found(audit(a => { a.rows.find(x => x.productId === 'hazel').hasActivePromo = true; })), []);
  // הנחה לא-מוסברת שמספר שלם אינו משחזר — יש מבצע, האחוז אינו ידוע
  assert.deepEqual(found(audit(a => { a.documents[0].summaryRemainder = 5.3; })), [['hazel', null, 4, null]]);
  assert.deepEqual(json(r, 'savedReceiptPaperPromos(null)'), []);
  // במערכת כבר יש מבצע על המוצר ליום התעודה — אין מה להציע
  r.context.late = structuredClone(HAZEL_PROMO); r.run('promos.push(late)');
  assert.deepEqual(found({}), []);
  r.run(`promos = promos.filter(p => p.id !== 'p-hazel'); renderReceiptsHistory();`);

  // אחוז שאינו סוגר את התעודה (12% במקום 15%): המבצע נפתח, והתעודה השמורה אינה משתנה
  const itemsBefore = json(r, 'receipts[0].items');
  r.click('paper-promo-open', 'hazel', { receipt: rc.id });
  sheetType(r, 'pct', '12'); await sheetClick(r, 'save');
  assert.equal(saveLabel(r), 'פתח בכל זאת');
  await sheetClick(r, 'save');
  assert.equal(promoWrites(r).length, 1); assert.equal(fixWrites(r).length, 0);
  assert.deepEqual(json(r, 'receipts[0].items'), itemsBefore);
  assert.deepEqual(json(r, '[receipts[0].status, receipts[0].unresolvedAmountGap]'), ['open', -5.29]);
  assert.equal(r.toasts.at(-1), 'המבצע נפתח: שיבולת שועל אגוזי לוז · 12% ✓ · פער הסכום בתעודה נשאר פתוח — "תקן הפרשים"');
  assert.doesNotMatch(card(r, rc.id), /data-paper-promo|paper-promo-open/, 'למוצר כבר יש מבצע — אין הצעה לפתוח עוד אחד');
  assert.match(card(r, rc.id), /^<details data-receipt-card="[^"]+" open /);

  // כתיבת התעודה נכשלה (המבצע עצמו נשמר): התעודה נשארת פתוחה, כמו שהיא
  const f = await note(); markAll(f);
  const rc2 = await parkAndSave(f);
  history(f, [rc2]);
  f.run(`const realTask = runCloudTask; runCloudTask = async (label, task) => label === 'save receipt fix' ? false : realTask(label, task);`);
  f.click('paper-promo-open', 'hazel', { receipt: rc2.id });
  await sheetClick(f, 'save');
  assert.equal(promoWrites(f).length, 1); assert.equal(fixWrites(f).length, 0);
  assert.deepEqual(json(f, '[receipts[0].status, receipts[0].unresolvedAmountGap, receipts[0].items.find(l => l.productId === "hazel").unitPrice]'), ['open', -5.29, 8.82]);
  assert.match(f.toasts.at(-1), /פער הסכום בתעודה נשאר פתוח/);
  // מסך עריכת התעודה פתוח על תעודה אחרת — לא נוגעים במצב שלו, והתעודה אינה מתוקנת מאחוריו
  const g = await note(); markAll(g);
  const rc3 = await parkAndSave(g);
  history(g, [rc3]);
  g.run(`receiptFix = { id: 'someone-else', items: [] }`);
  assert.equal(g.run(`paperPromoReceiptFix(receipts[0], savedReceiptPaperPromos(receipts[0])[0], ${JSON.stringify(HAZEL_PROMO)})`), null);
  assert.deepEqual(json(g, 'receiptFix'), { id: 'someone-else', items: [] });
  g.run('receiptFix = null');
  assert.equal(json(g, `paperPromoReceiptFix(receipts[0], savedReceiptPaperPromos(receipts[0])[0], ${JSON.stringify(HAZEL_PROMO)})`).open, false);
  assert.equal(g.run('receiptFix'), null, 'המצב הזמני נוקה');
  // תעודה שיש בה גם חוסר (חויבו 12 חלב, הגיעו 10): פער הסכום נסגר והשורה עוברת למחיר המבצע — והחוסר נשאר פתוח, כמו שהיה
  const short = structuredClone(rc3); short.id = 'rc-short';
  short.items = short.items.map(l => l.productId === 'milk' ? { ...l, qty: 10, noteQty: 12, lineTotal: 50 } : l);
  history(g, [short]);
  assert.deepEqual(json(g, 'savedReceiptPaperPromos(receipts[0]).map(x => [x.productId, x.pct])'), [['hazel', 15]]);
  g.click('paper-promo-open', 'hazel', { receipt: 'rc-short' });
  await sheetClick(g, 'save');
  const fix = fixWrites(g).at(-1);
  assert.deepEqual([fix.path.at(-1), fix.data.status, fix.data.unresolvedAmountGap, fix.data.items.find(l => l.productId === 'hazel').promoPct, fix.data.items.find(l => l.productId === 'milk').noteQty], ['rc-short', 'open', 0, 15, 12]);
  assert.equal(g.toasts.at(-1), 'המבצע נפתח: שיבולת שועל אגוזי לוז · 15% · השורה בתעודה עברה למחיר המבצע ✓');
  assert.doesNotMatch(card(g, 'rc-short'), /data-paper-promo|paper-promo-open/);
  assert.match(strip(card(g, 'rc-short')), /הפרש פתוח/);
  // מבצע שאינו בתוקף ביום התעודה אינו מתקן אותה
  assert.equal(g.run(`paperPromoReceiptFix(receipts[0], savedReceiptPaperPromos(receipts[0])[0], ${JSON.stringify({ ...HAZEL_PROMO, start: '2026-11-16' })})`), null);
});

test('8. התקופה: זו ששאר המבצעים שבתוקף ביום התעודה חולקים; בלעדיהם — החודש של התעודה; בלי להיכנס למבצע אחר של המוצר; חפיפה; ושמירה שנכשלה', async () => {
  const r = await note();
  const period = (day, pid) => json(r, `paperPromoPeriod(${JSON.stringify(day)}, ${JSON.stringify(pid || null)})`);
  assert.deepEqual(period('2026-11-15', 'hazel'), { start: '2026-11-01', end: '2026-11-30', from: 'promos' });
  // דף פעילות שאינו חודש קלנדרי: התקופה של רוב המבצעים שבתוקף
  r.run(`promos.forEach(p => { p.start = '2026-11-08'; p.end = '2026-12-05'; })`);
  assert.deepEqual(period('2026-11-15', 'hazel'), { start: '2026-11-08', end: '2026-12-05', from: 'promos' });
  // מבצע אחד בלבד בתוקף, או אף אחד — החודש של התעודה (גם פברואר)
  r.run(`promos = promos.slice(0, 1)`);
  assert.deepEqual(period('2026-11-15', 'hazel'), { start: '2026-11-01', end: '2026-11-30', from: 'month' });
  r.run(`promos = []`);
  assert.deepEqual(period('2028-02-10', 'hazel'), { start: '2028-02-01', end: '2028-02-29', from: 'month' });
  assert.deepEqual(period('', 'hazel'), { start: '', end: '', from: 'month' });
  // בלי להיכנס למבצע אחר של אותו מוצר: אחרי מבצע שנגמר לפני יום התעודה, ולפני מבצע שכבר הוגדר להמשך
  r.context.more = [{ id: 'old', pct: 10, productIds: ['hazel'], ...NOV, end: '2026-11-07' }, { id: 'next', pct: 20, productIds: ['hazel'], ...NOV, start: '2026-11-22' }, { id: 'other', pct: 20, productIds: ['milk'], ...NOV, start: '2026-11-22' }];
  r.run(`promos = more`);
  assert.deepEqual(period('2026-11-15', 'hazel'), { start: '2026-11-08', end: '2026-11-21', from: 'month' });
  assert.deepEqual(period('2026-11-15', 'cream'), { start: '2026-11-01', end: '2026-11-30', from: 'month' });

  // חפיפה עם מבצע אחר של המוצר — אזהרה, ו"פתח בכל זאת" שומר
  const o = await note();
  click(o, { role: 'paper-promo-open', id: 'hazel' });
  o.context.next = { id: 'next', name: 'שיבולת שועל דצמבר', pct: 20, productIds: ['hazel'], ...NOV, start: '2026-11-25', end: '2026-12-31' };
  o.run(`promos.push(next)`);
  await sheetClick(o, 'save');
  assert.equal(sheetMsg(o), 'למוצר כבר יש מבצע בתקופה הזאת: "שיבולת שועל דצמבר" (25.11.2026 עד 31.12.2026). כשמוצר נמצא בשני מבצעים חופפים, רק אחד מהם יחול. אפשר לתקן, או ללחוץ "פתח בכל זאת".');
  assert.equal(promoWrites(o).length, 0);
  await sheetClick(o, 'save');
  assert.equal(promoWrites(o).length, 1);
  // שמירה שנכשלה: החלון נשאר עם מה שהוקלד, ושום דבר לא השתנה
  const f = await note();
  f.run(`runCloudTask = async () => false`);
  click(f, { role: 'paper-promo-open', id: 'hazel' });
  sheetType(f, 'name', 'מבצע אגוזי לוז');
  await sheetClick(f, 'save');
  assert.equal(sheetShown(f), true);
  assert.equal(sheetMsg(f), 'המבצע לא נשמר — אין חיבור לענן, או שפעולה קודמת עדיין נשמרת. נסה שוב.');
  assert.equal(sheet(f).name, 'מבצע אגוזי לוז'); assert.equal(sheet(f).busy, false); assert.equal(saveLabel(f), 'פתח מבצע');
  assert.equal(f.run('promos.length'), 2);
  assert.match(row(f, 0, 2), NOTICE);
});

test('9. שתי שורות בכוכבית בלי מבצע: האחוז אינו ידוע — ההודעה אומרת זאת והחלון מחכה לאחוז; אחרי שהראשון נפתח, השני כבר ידוע', async () => {
  // שיבולת שועל 15% (₪5.29) ושמנת 10% (₪0.40): ₪5.69 לא-מוסברים, ואף מספר שלם אינו משחזר אותם על מוצר אחד
  const r = await scan([paper([['milk', 12], ['cottage', 6, true], ['hazel', 4, true], ['cream', 2, true]], 11.99)]);
  assert.deepEqual(json(r, 'receiptPaperPromos().map(x => [x.productId, x.pct, x.charged, x.qty, x.saving])'), [['hazel', null, null, 4, null], ['cream', null, null, 2, null]]);
  const open = row(r, 0, 2);
  assert.match(open, /<div data-paper-promo="hazel" class="mt-2 [^"]*"><div class="text-sm font-black text-rose-700"><i class="fa-solid fa-tag" aria-hidden="true"><\/i> בתעודה קיים מבצע על המוצר \(כוכבית\)<\/div><div class="text-xs font-bold text-slate-700 mt-0\.5">אחוז ההנחה לא ידוע מהתעודה · המבצע לא קיים במערכת<\/div><button type="button" data-role="paper-promo-open" data-id="hazel"/);
  assert.match(row(r, 0, 3), /data-paper-promo="cream"/);
  markAll(r);
  assert.match(row(r, 0, 2), /<i class="fa-solid fa-tag" aria-hidden="true"><\/i> בתעודה קיים מבצע \(כוכבית\)<\/div><div class="text-\[11px\] font-bold text-slate-600 leading-tight mt-0\.5">האחוז לא ידוע · לא קיים במערכת<\/div>/);
  // החלון: בלי אחוז — צריך להקליד אותו; בלי אזהרה על אחוז "שונה מהתעודה", כי התעודה אינה אומרת אותו
  click(r, { role: 'paper-promo-open', id: 'hazel' });
  assert.equal(sheet(r).pct, '');
  // הפוקוס בפתיחה — על שדה האחוז, כי צריך להקליד אותו
  assert.match(sheetHtml(r), /<input id="paperPromoPct" data-pp-field="pct" data-autofocus type="text"/);
  assert.equal((sheetHtml(r).match(/data-autofocus/g) || []).length, 1);
  assert.match(strip(sheetHtml(r)), /בתעודה: 4 יח׳ · השורה מסומנת בכוכבית \(מבצע\) אחוז ההנחה לא ידוע מהתעודה — הקלד אותו לפי דף המבצעים/);
  await sheetClick(r, 'save');
  assert.equal(sheetMsg(r), 'מלא אחוז הנחה, תאריך התחלה ותאריך סיום');
  sheetType(r, 'pct', '15'); await sheetClick(r, 'save');
  assert.equal(sheetShown(r), false);
  assert.deepEqual(promoWrites(r).map(w => [w.data.pct, w.data.productIds]), [[15, ['hazel']]]);
  // מה שנשאר לא-מוסבר (₪0.40) שייך עכשיו למוצר אחד — והאחוז שלו ידוע
  assert.deepEqual(json(r, 'receiptPaperPromos().map(x => [x.productId, x.pct, x.charged, x.qty, x.saving])'), [['cream', 10, 1.8, 2, 0.4]]);
  assert.match(row(r, 0, 3), /בתעודה קיים מבצע 10%<\/div><div class="text-\[11px\] font-bold text-slate-600 leading-tight mt-0\.5">₪1\.80 במקום ₪2\.00 · לא קיים במערכת/);
  assert.match(row(r, 0, 2), /data-paper-promo-done="hazel"/);
  click(r, { role: 'paper-promo-open', id: 'cream' });
  assert.equal(sheet(r).pct, '10');
  await sheetClick(r, 'save');
  assert.deepEqual(json(r, 'receiptPaperPromos()'), []);
  assert.equal(r.run('receiptPriceAudit().complete'), true);
  // שתי שורות בכוכבית בלי מבצע, כשההנחה כולה שייכת לאחת מהן לאגורה: האחוז שלה ידוע, והשנייה נשארת בלי אחוז
  const one = await scan([paper([['milk', 12], ['cottage', 6, true], ['hazel', 4, true], ['cream', 2, true]], DISCOUNT)]);
  assert.deepEqual(json(one, 'receiptPaperPromos().map(x => [x.productId, x.pct])'), [['hazel', 15], ['cream', null]]);
});

test('10. טלפון שהקליטה אינה שלו כרגע (נמשכת בטלפון אחר): המבצע נפתח והמסך מחושב מחדש — אבל הקליטה עצמה אינה נערכת מכאן', async () => {
  const r = await note();
  markAll(r);
  await park(r);
  r.run(`canEditDraft = () => false;`);
  const reconcile = r.run('JSON.stringify(reconcileData)');
  r.events.get('rsBody:click')({ target: { closest: sel => sel === '[data-role="paper-promo-open"]' ? { dataset: { role: 'paper-promo-open', id: 'hazel' } } : null } });
  await sheetClick(r, 'save');
  // המבצע נשמר (הוא שייך למאגר), ובדיקת המחירים — שנשענת על המאגר ועל הנייר — כבר רואה אותו
  assert.equal(promoWrites(r).length, 1);
  assert.deepEqual(json(r, 'receiptPaperPromos()'), []);
  assert.equal(r.run('receiptPriceAudit().complete'), true);
  // הקליטה עצמה לא נערכה: שורות ההשוואה (עדיין במחיר המלא — הן יתומחרו בטלפון שמחזיק את הקליטה) וחלון הסיכום — כמו שהיו
  assert.equal(r.run('JSON.stringify(reconcileData)'), reconcile);
  assert.equal(summaryShown(r), true); assert.equal(r.run('!!pendingReceipt'), true);
});

test('11. הרשימה אינה מריצה את בדיקת המחירים המלאה בכל סימון — רק כשמבצע או מחיר מאגר של מוצר בתעודה משתנים, ובפתיחת החלון', async () => {
  const r = await note();
  r.run(`globalThis.audits = 0; const realAudit = receiptPriceAudit; receiptPriceAudit = function () { audits++; return realAudit.apply(this, arguments); };`);
  const audits = () => r.run('audits');
  r.run('receiptLinePaperPromoCache = null; renderReceiptLineRows()');
  const first = audits();
  assert.ok(first >= 1);
  // סימונים, פתיחה וסגירה של שורות, וציור חוזר — בלי חישוב נוסף
  markAll(r); click(r, { lineOpen: '0:1' }); click(r, { lineMark: '0:1:none' }); r.run('renderReceiptLineRows(); renderReceiptLineRows()');
  assert.equal(audits(), first);
  assert.match(row(r, 0, 2), COMPACT);
  // מבצע חדש במאגר (גם מטלפון אחר) — מחושב מחדש, וההודעה יורדת
  r.context.late = structuredClone(HAZEL_PROMO);
  r.run('promos.push(late); renderReceiptLineRows()');
  assert.ok(audits() > first);
  assert.doesNotMatch(rows(r), /data-paper-promo="/);
  const second = audits();
  r.run('renderReceiptLineRows()');
  assert.equal(audits(), second);
  // מחיר מאגר של מוצר בתעודה השתנה — מחושב מחדש
  r.run(`products.find(p => p.id === 'cream').price = 2.5; renderReceiptLineRows()`);
  assert.ok(audits() > second);
  // פתיחה מחדש של החלון — מחושב מחדש (תאריך תעודה או זיהוי מוצר משתנים רק מחוצה לו)
  r.run(`products.find(p => p.id === 'cream').price = 2; promos = promos.filter(p => p.id !== 'p-hazel'); renderReceiptLineRows()`);
  const third = audits();
  r.run('closeReceiptQuantityReview(); startReceiptLineCheck()');
  assert.ok(audits() > third);
  assert.match(row(r, 0, 2), COMPACT);
});

test('12. הגרסה עלתה ל-164, כולל ההערה ב-service worker; החלון החדש בדף; ומסך עריכת התעודה שומר בדיוק כמו קודם', async () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /const APP_VERSION = '164'/);
  assert.match(fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), /^\/\/ גרסה 164 — /);
  // החלון: מעל חלון הבדיקה שורה-שורה (70) וחלון הסיכום (65), מתחת לחיווי "שומר לענן" (100)
  assert.match(html, /<div id="paperPromoModal" role="dialog" aria-modal="true" aria-label="פתיחת מבצע מהתעודה" class="hidden fixed inset-0 bg-slate-900\/60 backdrop-blur-sm items-center justify-center p-4 z-\[90\]" dir="rtl">/);
  assert.match(html, /<div id="receiptQuantityModal"[^>]* z-\[70\]"/);
  assert.match(html, /<div id="receiptSummaryModal"[^>]* z-\[65\]/);
  // מסך עריכת התעודה: אותו מצב ואותה שמירה כמו לפני שהחישוב הוצא לפונקציה
  const r = await note();
  markAll(r);
  const rc = await parkAndSave(r);
  history(r, [rc]);
  r.click('rc-fix-open', rc.id);
  assert.equal(r.run('currentView'), 'receiptFix');
  assert.deepEqual(json(r, 'receiptFix'), json(r, 'receiptFixState(receipts[0])'));
  assert.deepEqual(json(r, 'Object.keys(receiptFix)'), ['id', 'noteTotalInc', 'noteParts', 'supplierDiscount', 'unresolvedAmountGap', 'unresolvedUnitsGap', 'externalOffsets', 'canceledOffsetIds', 'items']);
  // תיקון ביד של המחיר — מה שהיה כותבים עד היום כדי לסגור תעודה כזאת — שומר בדיוק מה ש"פתח מבצע" כותב, חוץ מאחוז המבצע
  r.run(`receiptFixSetPriceLive('hazel', '7.497')`);
  const before = r.writes.length;
  await r.run('saveReceiptFix()'); await settle();
  const w = r.writes.slice(before).find(x => x.op === 'update' && x.path.includes('receipts'));
  assert.deepEqual([w.data.status, w.data.unresolvedAmountGap, w.data.totalExVat, w.data.calculatedExVat], ['ok', 0, 129.69, 129.69]);
  assert.deepEqual(w.data.items.find(l => l.productId === 'hazel'), { productId: 'hazel', name: 'שיבולת שועל אגוזי לוז', barcode: '7290000000022', qty: 4, unitPrice: 7.497, basePrice: 8.82, lineTotal: 29.99, promoPct: 0 });
  assert.equal(r.run('receiptFix'), null); assert.equal(r.run('currentView'), 'receiptsHistory');
  assert.equal(r.toasts.at(-1), 'התעודה תוקנה ✓');
});
