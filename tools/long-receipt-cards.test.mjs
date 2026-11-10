// v158: תעודת 10.11 — 30 שורות, 8 כרטיסים, "בלאגן, אני לא מבין כלום מהקליטה". הבדיקות כאן מריצות את
// האפליקציה כולה מול שירות 20 מדומה, על תעודה סינתטית באותו מבנה בדיוק (בלי נתונים פרטיים):
// - היפוך כמות ומחיר בשלוש שורות שהמאגר מכריע (96×5.36 מול 5.36×96);
// - קוד ששתי הקריאות החזקות קראו אותו דבר, שגוי, ואינו במאגר — תיקון ספרה והקוד שקריאה אחרת
//   קראה אינם נחסמים עוד (הסכמה של אותו מודל פעמיים אינה עדות);
// - הקוד הנכון שישב ב-reads של קריאה זולה ולא ב-`other`;
// - חמישה זיהויים לפי המחיר בכרטיס אחד, עם כפתור אחד לכולם, "לא, מוצר אחר" לכל שורה, והקוד
//   שבמאגר להשוואה מול הנייר; הכרטיסים בסדר התעודה; מה שכל קריאה קראה מאחורי "פרטים".
import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime } from './receipt-scan-harness.mjs';

const products = [
  { id: 'milk', name: 'חלב 3% ועדת מהדרין בקרטון 1 ליטר', barcode: '7290004131074', price: 5.36 },
  { id: 'vanilla', name: 'משקה חלב וניל 2% קרטון 1 ליטר', barcode: '7290116934273', price: 6.7 },
  { id: 'soy', name: 'משקה סויה מועשר 1 ליטר', barcode: '7290004125578', price: 7.32 },
  { id: 'cream', name: 'שמנת חמוצה 15% רבנות 200 מ"ל', barcode: '72963746', price: 2.1 },
  { id: 'cream2', name: 'שמנת חמוצה 15% מהדרין 200 מ"ל', barcode: '7290004125455', price: 2.1 },
  { id: 'prili', name: 'פרילי תות 125 גרם', barcode: '72961506', price: 2.58 },
  { id: 'prili500', name: 'פרילי תות 500 גרם', barcode: '7290000044712', price: 8.32 },
  { id: 'forest', name: 'יופלה פירות יער בשמנת 3% 150 גרם', barcode: '7290004130916', price: 3.69 },
  { id: 'greek', name: 'יופלה יוגורט בסגנון יווני עם תות 140 גרם', barcode: '7290116936369', price: 3.69 },
  { id: 'emek', name: 'עמק סמי מעדנייה כשרות מהדרין 400 גרם', barcode: '7290000057118', price: 19.6 },
  { id: 'yellow', name: "גבינה צהובה עמק 28% 400 ג' ואקום 400 גרם", barcode: '7290116935638', price: 19.6 },
  { id: 'crate', name: 'ארגז חלב ירוק', barcode: '59259', price: 15.1 },
  { id: 'cottage5', name: "קוטג' ועדת מהדרין 5% 250 גרם", barcode: '7290004127329', price: 4.6 },
  { id: 'cottage9', name: "קוטג' ועדת מהדרין 9% 250 גרם", barcode: '7290004127336', price: 4.6 }
];
const r2 = n => Math.round(n * 100) / 100;
const read = (stage, value, selected = false) => ({ stage, value, ...(selected ? { selected: true } : {}) });
const unseen = stage => ({ stage, value: null, seen: false, unmatched: 'numbers_differ' });
const agreement = (kind, code, stages) => ({ code, kind, stages });
const codeField = (reads, agreed, other) => ({ field: 'code', selected: reads.find(r => r.selected).value, other, confirmed: 0, reads, agreement: agreed });
const swap = (quantity, unit) => [{ field: 'quantity', selected: quantity, other: unit, confirmed: 0 }, { field: 'unitPriceExVat', selected: unit, other: quantity, confirmed: 0 }];
// הקריאה שנבחרה (המודל החזק) — מה שהיא קראה בנייר, שורה-שורה, כמו ב-10.11.
const lines = [
  { lineNumber: 1, code: '4131074', description: 'חלב תנובה קרו מר', quantity: 96, unitPriceExVat: 5.36 },
  { lineNumber: 2, code: '16934273', description: 'חלב ניגל תנובה 2%', quantity: 8, unitPriceExVat: 6.7, promoStar: true },
  { lineNumber: 3, code: '4125578', description: 'אשל 1.7% ל תנובה', quantity: 8, unitPriceExVat: 7.32 },
  { lineNumber: 4, code: '12963746', description: 'שמנת 15% סמל', quantity: 30, unitPriceExVat: 2.1 },
  { lineNumber: 5, code: null, description: 'פרילי 500', quantity: 12, unitPriceExVat: 2.58 },
  { lineNumber: 6, code: '44712', description: 'פרילי 500', quantity: 6, unitPriceExVat: 8.32 },
  { lineNumber: 7, code: '1303916', description: 'יופ. טורט', quantity: 12, unitPriceExVat: 3.69 },
  { lineNumber: 8, code: '117118', description: 'טונה 400גר פרות', quantity: 9, unitPriceExVat: 19.6 },
  { lineNumber: 9, code: '594259', description: 'מארז חלבי 9%', quantity: 9, unitPriceExVat: 15.1 },
  { lineNumber: 10, code: '4127336', description: "קוטג' 250 מ. מהדרין", quantity: 18, unitPriceExVat: 4.6 },
  { lineNumber: 11, code: '4136916', description: 'יופ.שזיף 3%', quantity: 12, unitPriceExVat: 3.69 }
];
const disputedRows = [
  { rowIndex: 0, lineNumber: 1, code: '4131074', fields: swap(96, 5.36) },
  { rowIndex: 1, lineNumber: 2, code: '16934273', fields: swap(8, 6.7) },
  { rowIndex: 2, lineNumber: 3, code: '4125578', fields: [codeField([read('consensus_escalation', '4125578', true), unseen('consensus_1'), unseen('consensus_2'), read('second_strong_read', '4125578')],
    agreement('strong_strong', '4125578', ['consensus_escalation', 'second_strong_read']), '1635578')].concat(swap(8, 7.32)) },
  // שורה 4: שתי החזקות קראו 12963746 (הנייר: 72963746), הזולה 72963476 — אף קריאה לא קראה נכון; תיקון ספרה מגיע לשמנת רבנות.
  { rowIndex: 3, lineNumber: 4, code: '12963746', fields: [codeField([read('consensus_escalation', '12963746', true), unseen('consensus_1'), read('consensus_2', '72963476'), read('second_strong_read', '12963746')],
    agreement('strong_strong', '12963746', ['consensus_escalation', 'second_strong_read']), '72963476')] },
  // שורה 5: המודל החזק לא קרא קוד ולקח את השם של השורה הבאה; הזולה קראה 72961506 — פרילי תות 125.
  { rowIndex: 4, lineNumber: 5, code: null, fields: [codeField([read('consensus_escalation', null, true), unseen('consensus_1'), read('consensus_2', '72961506'), read('second_strong_read', null)], null, '72961506')] },
  // שורה 7: `other` הוא הקוד של הזולה שבאותו מיקום (41309316, לא במאגר); הקוד הנכון 4130916 יושב ב-reads.
  { rowIndex: 6, lineNumber: 7, code: '1303916', fields: [codeField([read('consensus_escalation', '1303916', true), unseen('consensus_1'), read('consensus_2', '4130916'), read('second_strong_read', '130916')], null, '41309316')] },
  // שורה 8: שתי החזקות קראו 117118 (הנייר: 57118), הזולה 57118 — עמק סמי, ₪19.60 בדיוק.
  { rowIndex: 7, lineNumber: 8, code: '117118', fields: [codeField([read('consensus_escalation', '117118', true), unseen('consensus_1'), read('consensus_2', '57118'), read('second_strong_read', '117118')],
    agreement('strong_strong', '117118', ['consensus_escalation', 'second_strong_read']), '57118')] },
  { rowIndex: 8, lineNumber: 9, code: '594259', fields: [codeField([read('consensus_escalation', '594259', true), unseen('consensus_1'), read('consensus_2', '59259'), read('second_strong_read', '59459')], null, '59259')] },
  // שורה 10: שכנים באותו מחיר — קוטג' 9% נבחר, הזולה קראה קוטג' 5%, הקריאה השלישית קוד שלישי: שאלה.
  { rowIndex: 9, lineNumber: 10, code: '4127336', fields: [codeField([read('consensus_escalation', '4127336', true), read('consensus_1', '4127329'), read('consensus_2', '4172923')], null, '4127329')] },
  // שורה 11: שתי הזולות הסכימו על 4136619 (אינו במאגר), החזקה 4136916 (אינו במאגר): הסכמה בין קריאות — בלי ניחושים (כלל 150/5).
  { rowIndex: 10, lineNumber: 11, code: '4136916', fields: [codeField([read('consensus_escalation', '4136916', true), read('consensus_1', '4136619'), read('consensus_2', '4136619')],
    agreement('cheap_cheap', '4136619', ['consensus_1', 'consensus_2']), '4136619')] }
].map(row => ({ noteIndex: 0, description: lines[row.rowIndex].description, ...row }));

// מבצע במאגר על קוטג' 5% בלבד: שמירה של כלל 109 שנכשלת, ולכן שכן באותו מחיר (שורה 10) נשאר שאלה לעובד
// — כמו שישה קוטג'ים ב-₪4.60 בחנות אמיתית.
const cottagePromo = { id: 'p5', name: "קוטג' 5% במבצע", pct: 10, start: '2026-11-01', end: '2026-11-30', minQty: 1, minUnit: 'unit', type: 'receipt', productIds: ['cottage5'] };
// הנחת מבצעים בסיכום התעודה (כמו ₪8.78 ב-10.11) בלי מבצע במאגר לשורה המסומנת: בדיקת המבצעים ממתינה,
// ולכן זיהוי לפי המחיר מחכה לאישור (כלל 119 מקבל אותו לבד רק כשאין הנחה שממתינה).
const DISCOUNT = 8.78;
function fixture({ catalog = products, promos = [cottagePromo] } = {}) {
  const rows = lines.map(row => ({ promoStar: false, ...row, section: 'items', sourcePage: 1, confidence: .8, lineTotalExVat: r2(row.quantity * row.unitPriceExVat) }));
  const gross = r2(rows.reduce((n, r) => n + r.lineTotalExVat, 0));
  const subtotal = r2(gross - DISCOUNT);
  const consensus = { attempted: true, reads: 2, completedReads: 2, agreed: false, reason: 'reads_disagree', escalated: true, model: 'gpt-5.6-luna',
    escalationModel: 'gpt-5.6-terra', escalationSelected: true, escalationError: null, unverifiedSingleRead: false, strongReadSelection: true, codeAgreement: true,
    diffs: [], disputedRows, missingRows: [], docDateUnconfirmed: [],
    secondStrongRead: { outcome: 'code_agreed', stage: 'second_strong_read', model: 'gpt-5.6-terra', requestId: 'fixture', asked: 6, usage: null, closed: [], open: [], notAsked: [], differences: [], codes: [] } };
  const attempts = [
    { stage: 'consensus_1', requestedModel: 'gpt-5.6-luna', selected: false, outcome: 'read', paperError: 0 },
    { stage: 'consensus_2', requestedModel: 'gpt-5.6-luna', selected: false, outcome: 'read', paperError: 0 },
    { stage: 'consensus_escalation', requestedModel: 'gpt-5.6-terra', selected: true, outcome: 'read', paperError: 0 },
    { stage: 'second_strong_read', requestedModel: 'gpt-5.6-terra', selected: false, outcome: 'read' }];
  return { products: catalog, promos, items: [],
    paper: { ok: true, serviceVersion: 20, model: 'gpt-5.6-terra', requestId: 'long-receipt-fixture', consensus,
      scanAudit: { version: 1, attempts, secondStrongRead: consensus.secondStrongRead }, checksumRetryAttempted: false, checksumRetryModel: null,
      scan: { warnings: [], documents: [{ noteIndex: 0, docType: 'invoice', docDate: '10/11/2026', pageCount: 1, vatPct: 18, rows, confidence: .8,
        itemsSectionTotalExVat: gross, itemsPrintedLines: rows.length, printedLines: rows.length, returnsSectionTotalExVat: null, returnsPrintedLines: null,
        promoDiscountExVat: DISCOUNT, documentDiscountExVat: DISCOUNT, subtotalExVat: subtotal, netToChargeExVat: subtotal, warnings: [] }] } } };
}
async function scanned(options) {
  const c = runtime('tnuva', { data: fixture(options) });
  c.run(`todayStr = () => '2026-11-10'; currentView = 'receiving'; mainMode = 'receiving'; scanPurpose = 'receiving'; refreshScanHost = () => {};
    aiScanDocuments = [{ noteIndex: 0, amount: null, units: null, lines: null, pages: [{ dataUrl: 'data:image/jpeg;base64,Zml4dHVyZQ==', orientationConfirmed: true }] }];`);
  await c.run('tnuvaStartPaperScan()');
  assert.equal(c.run('receiptPaperScanState'), 'ok', 'the paper closes');
  return c;
}
const json = (c, expr) => JSON.parse(c.run(`JSON.stringify(${expr})`));
const rowsOf = c => json(c, 'aiScanResponse.scan.documents[0].rows.map(r => [r.lineNumber, r.barcodeMatchMethod, r.__tnuvaProductId])');
const actions = c => json(c, `(function(){ const a = receiptRowActions(); return { total: a.total, settled: a.settled, agreementSettled: a.agreementSettled, agreementMissing: a.agreementMissing, autoMatched: a.autoMatched,
  unidentified: a.unidentified.map(x => ({ line: x.row.line, matched: x.matchedProduct ? x.matchedProduct.id : null, rejected: x.rejected ? x.rejected.id : null })),
  disputed: a.disputed.map(x => ({ line: x.row.line, fields: x.dispute.fields.map(f => f.field) })), priced: a.priced.map(x => x.row.line) }; })()`);
const html = c => { c.run('renderReceiving()'); return c.node('app').innerHTML; };
const section = c => { const page = html(c); const from = page.indexOf('<section data-row-actions'); return from < 0 ? '' : page.slice(from, page.indexOf('</section>', from)); };
const order = (page, ...needles) => { const at = needles.map(n => page.indexOf(n)); at.forEach((i, k) => assert.ok(i >= 0, 'missing: ' + needles[k])); return at.every((i, k) => k === 0 || i > at[k - 1]); };

test('v158: the identities the price confirmed sit in one card with one button; the rest of the cards follow the paper order; the reads are behind details', async () => {
  const c = await scanned();
  // המתאם: תיקון ספרה בשורה 4 למרות ההסכמה של שתי החזקות; הקוד שקריאה אחרת קראה בשורות 5, 7, 8, 9 — גם כשהוא רק ב-reads.
  const rows = rowsOf(c);
  assert.deepEqual(rows.slice(3, 9), [[4, 'tnuva_code_repair', 'cream'], [5, 'tnuva_code_second_read', 'prili'], [6, 'exact_full', 'prili500'],
    [7, 'tnuva_code_second_read', 'forest'], [8, 'tnuva_code_second_read', 'emek'], [9, 'tnuva_code_second_read', 'crate']]);
  assert.deepEqual(rows[9], [10, 'exact_full', 'cottage9']);
  assert.deepEqual(rows[10], [11, null, null], 'two cheap reads agreeing on a code the catalog lacks: still no guess');
  // ההחלטות: שלוש ההיפוכים נסגרו מול המאגר; חמישה זיהויים לאישור; שכן באותו מחיר; וקוד חסר במאגר.
  const a = actions(c);
  assert.deepEqual(a.disputed, [{ line: 10, fields: ['code'] }]);
  assert.deepEqual(a.unidentified.map(x => [x.line, x.matched]), [[4, 'cream'], [5, 'prili'], [7, 'forest'], [8, 'emek'], [9, 'crate'], [11, null]]);
  // ההיפוכים בשורות 1–2 נסגרו מול המאגר; שורה 3 (הסכמה על הקוד שנבחר + היפוך) נספרת כהסכמת קריאות; שורה 11
  // נספרת כ"הוכרעה" (קוד מוסכם שאינו במאגר — כלל 150). יחד 4.
  assert.deepEqual([a.total, a.settled, a.agreementSettled, a.agreementMissing], [7, 4, 1, 1]);
  const view = section(c);
  // כרטיס אחד לחמשת הזיהויים, כפתור אחד לכולם, ולכל שורה הקוד שבמאגר מול מה שנקרא בנייר.
  assert.equal((view.match(/data-matched-batch/g) || []).length, 1);
  assert.match(view, /data-role="rowfix-pick-all"[^>]*>.*?אשר את כל 5 הזיהויים/);
  assert.equal((view.match(/data-matched-row/g) || []).length, 5);
  assert.match(view, /שמנת 15% סמל.*?קוד בנייר 12963746 · שורה 4.*?זוהה: שמנת חמוצה 15% רבנות 200 מ&quot;ל.*?קוד במאגר <bdi>72963746<\/bdi> · ₪2\.10 · הקוד שנקרא שונה ממנו בספרה אחת, והמחיר תואם/s);
  assert.match(view, /קוד במאגר <bdi>57118<\/bdi> · ₪19\.60 · קריאה אחרת של הצילום קראה את הקוד הזה, והמחיר תואם/);
  assert.equal((view.match(/data-role="rowfix-reject"/g) || []).length, 5);
  assert.doesNotMatch(view, /data-role="rowfix-rival"/, 'one button per action: no second button for the same product');
  // סדר: הכרטיס המקובץ, ואחריו שורה 10 (המחלוקת) לפני שורה 11 (הבחירה) — סדר התעודה, לא סדר הסוגים.
  assert.ok(order(view, 'data-matched-batch', 'הסריקות נחלקו על השורה', 'הקוד שבשורה אינו במאגר — צריך לבחור מוצר'));
  // מה שכל קריאה קראה — בתוך details, לא על פני הכרטיס; השאלה עצמה גלויה.
  assert.ok(view.indexOf('<details data-row-reads') < view.indexOf('שתי הסריקות של הצילום לא קראו'));
  assert.match(view, /data-dispute-summary>קוד: 4127336 \(קוטג&#039; ועדת מהדרין 9% 250 גרם\) מול 4127329 \(קוטג&#039; ועדת מהדרין 5% 250 גרם\) \/ 4172923</);
  assert.match(view, /data-role="rowfix-pick" data-doc="0" data-row="9" data-product="cottage5"[^>]*>זה קוטג&#039; ועדת מהדרין 5% 250 גרם</, 'the same-price neighbour is one tap, not a search');
  assert.match(view, /data-role="rowfix-confirm" data-doc="0" data-row="9"/);
  // "המוצר לא ברשימה?" מקופל, ו"הוכרע בלי לשאול אותך" מקופל — נוכחים, לא על פני המסך.
  assert.match(view, /<div data-row-other-ways[^>]*><details><summary[^>]*>המוצר לא ברשימה\? חפש, סרוק או פתח מוצר חדש<\/summary>/);
  assert.match(view, /<details data-settled[^>]*><summary[^>]*>מה הוכרע בלי לשאול אותך<\/summary><div[^>]*>2 מחלוקות בין שתי הקריאות הוכרעו מול המאגר · מחלוקת אחת על הקוד הוכרעה לפי הסכמת הקריאות — המחיר אישר · בשורה אחת הקריאות הסכימו על קוד שאינו במאגר\.<\/div>/);
  assert.match(view, /7 שורות דורשות החלטה לפני הקליטה/);
  // ההיפוך נסגר רק כשהמאגר מכריע: 5.36 הוא מחיר החלב, 96 אינו מחיר של דבר.
  assert.equal(c.run("receiptSwapSettled(receiptPriceAudit().rows[0], receiptConsensusDisputes().get('0:0'))"), true);
  assert.equal(c.run("receiptSwapSettled(receiptPriceAudit().rows[0], { fields: [{ field: 'quantity', selected: 96, other: 48, confirmed: 0 }, { field: 'unitPriceExVat', selected: 5.36, other: 96, confirmed: 0 }] })"), false, 'not a pure swap');
  // כרטיס המחיר ועמוד ההיסטוריה אינם חלק מהבדיקה הזאת, אבל התיבה הצהובה עצמה נשארה תו בתו (142/143/150).
  assert.match(view, /<div>שתי הסריקות של הצילום לא קראו את השורה אותו דבר:<\/div><div dir="rtl">קוד: המודל החזק \(נבחרה\) 12963746 · קריאה זולה 1 לא קראה את השורה · קריאה זולה 2 72963476 · קריאה חזקה שנייה 12963746<\/div><div dir="rtl" data-code-agreement>שתי הקריאות החזקות קראו 12963746 — והוא אינו במאגר\.<\/div>/);
});

test('v158: one tap confirms all five identities as the worker\'s decision; "not this one" turns the row back into a choice without the rejected product', async () => {
  const c = await scanned();
  c.click('rowfix-pick-all', null, {});
  const rows = rowsOf(c);
  assert.deepEqual(rows.filter(r => [4, 5, 7, 8, 9].includes(r[0])).map(r => r[1]), ['user_confirmed', 'user_confirmed', 'user_confirmed', 'user_confirmed', 'user_confirmed']);
  assert.deepEqual(json(c, 'aiScanResponse.scan.documents[0].rows.filter(r => r.barcodeUserConfirmedFromMethod).map(r => r.barcodeUserConfirmedFromMethod)'), Array(5).fill('picked_from_catalog'));
  const a = actions(c);
  assert.deepEqual(a.unidentified.map(x => x.line), [11]);
  assert.match(section(c), /5 שורות שויכו על ידך למוצרים/);
  assert.doesNotMatch(section(c), /data-matched-batch/);
  assert.ok(c.toasts.some(t => /5 שורות שויכו למוצרים שזוהו/.test(t)), c.toasts.join(' | '));
  // דחייה: שורה 4 חוזרת ככרטיס בחירה — המועמד באותו מחיר שנשאר הוא שמנת מהדרין, בלי שמנת רבנות שנדחתה.
  const again = await scanned();
  again.click('rowfix-reject', null, { doc: '0', row: '3' });
  const after = actions(again);
  assert.deepEqual(after.unidentified.find(x => x.line === 4), { line: 4, matched: null, rejected: 'cream' });
  const view = section(again);
  assert.match(view, /אשר את כל 4 הזיהויים/);
  const card = view.slice(view.indexOf('הזיהוי "שמנת חמוצה 15% רבנות 200 מ&quot;ל" נדחה על ידך'));
  assert.ok(card.length < view.length, 'the rejected row says so');
  const picks = [...card.slice(0, card.indexOf('data-row-other-ways')).matchAll(/data-role="rowfix-pick"[^>]*data-product="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(picks, ['cream2']);
  assert.ok(order(view, 'data-matched-batch', 'נדחה על ידך'), 'the rejected row leaves the batch and takes its place in the paper order');
});

test('v158: the name score counts each printed word once, and "closest name" needs a clear margin', async () => {
  const c = await scanned();
  // "400" פעמיים בשם אחד אינו מקרב אותו יותר משם עם "400" פעם אחת.
  assert.equal(c.run(`receiptNameScore('טונה 400גר פרות', "גבינה צהובה עמק 28% 400 ג' ואקום 400 גרם")`), c.run(`receiptNameScore('טונה 400גר פרות', 'עמק סמי מעדנייה כשרות מהדרין 400 גרם')`));
  // קוד שקריאה אחרת קראה — ראשון ברשימה, לפני המועמדים לפי מחיר ושם.
  const candidates = json(c, `receiptRowCandidates(receiptPriceAudit().rows[9], receiptConsensusDisputes().get('0:9'), 'cottage9').map(x => [x.product.id, x.weight, x.reason])`);
  assert.deepEqual(candidates[0], ['cottage5', 200, 'קריאה אחרת של הצילום קראה את הקוד 4127329, והמחיר תואם']);
  // שני מועמדים בפער של מילה אחת בלבד — אף אחד לא מסומן; בפער של מילה שלמה — הראשון מסומן.
  const close = products.filter(p => ['cottage5', 'cottage9'].includes(p.id)).map(p => ({ product: p, weight: c.run(`receiptNameScore("קוטג' 5%", ${JSON.stringify(p.name)})`) }));
  assert.ok(close[0].weight - close[1].weight >= 3, 'a full-word difference');
  const near = c.run(`receiptNameScore('גבינה 250', 'גבינה לבנה 250 גרם') - receiptNameScore('גבינה 250', 'גבינה 250 בד"צ')`);
  assert.equal(near, 0);
  assert.equal(c.run('RECEIPT_CLOSEST_NAME_MARGIN'), 3);
});
