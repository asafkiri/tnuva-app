// v99: מתי מותר לומר "המבצע לא ירד".
// אצל תנובה כל שורת מבצע מודפסת במחיר מלא, וההנחה כולה יושבת בשורה אחת
// בתחתית התעודה. לכן שורה במחיר מלא היא ראיה נגד הספק רק אם שורת הסיכום
// אכן נקראה ואמרה שלא ירדה הנחה. ב-17.9 צולם רק גוף הטבלה, שורת "סד הנחה
// בגין מבצעים" (₪32.02) לא נכנסה לצילום, וארבעה מבצעים שכן ירדו הוצגו
// למשתמש כ"המבצע לא מופיע אצל הספק".
import test from 'node:test';
import assert from 'node:assert/strict';
import * as harness from './receipt-scan-harness.mjs';

const products = [
  { id: 'milk', name: 'חלב במבצע', barcode: '7290000000008', price: 5 },
  { id: 'coffee', name: 'מוצר רגיל', barcode: '7290000000015', price: 5 }
];
const promos = [{ id: 'p1', name: 'מבצע חלב', productIds: ['milk'], pct: 20, start: '2026-09-01', end: '2026-09-30', minQty: 1 }];
const row = (code, barcode, overrides = {}) => ({ section: 'items', sourcePage: 1, lineNumber: 1, code, barcode,
  barcodeObserved: barcode, barcodeReadType: 'full', barcodeMatchMethod: 'exact_full', description: 'שורה',
  quantity: 10, unitPriceExVat: 5, lineTotalExVat: 50, promoStar: false, confidence: .95, ...overrides });
// שתי שורות במחיר מלא: אחת עם מבצע פעיל במאגר ואחת בלי.
const rows = [row('8', '7290000000008', { promoStar: true }), row('15', '7290000000015', { lineNumber: 2 })];
const baseDoc = { noteIndex: 0, docNumber: 'INV-1', invoiceNumber: 'INV-1', docType: 'invoice', docDate: '17/09/2026',
  pageCount: 1, vatPct: 18, rows, confidence: .95, itemsSectionTotalExVat: 100, promoDiscountExVat: null,
  documentDiscountExVat: null, itemsPrintedLines: 2, printedLines: 2, returnsSectionTotalExVat: null,
  returnsPrintedLines: null, subtotalExVat: 100, netToChargeExVat: 100, printedUnits: null, totalUnits: null, warnings: [] };

async function evaluated(docChanges, notes) {
  const doc = { ...baseDoc, ...docChanges };
  const data = { products, promos, items: [{ productId: 'milk', qty: 10 }, { productId: 'coffee', qty: 10 }],
    paper: { ok: true, serviceVersion: 11, model: 'fixture', requestId: 'promo-evidence', scan: { warnings: [], documents: [doc] } } };
  const c = harness.runtime('tnuva', { data });
  c.run("currentView='receiving'; mainMode='receiving'; openScanner=()=>{}; closeScanner=()=>{}; scanBeep=()=>{}; buzz=()=>{}; refreshScanHost=()=>{};");
  await c.scan(1);
  c.run(`receiptNotes = ${JSON.stringify(notes)}; recomputeNoteTotal(); saveReceiptDraft();`);
  const result = JSON.parse(c.run(`JSON.stringify((function(){
    const ev = aiEvaluateInvoiceScan(aiScanResponse);
    return { findings: (ev.findings||[]).map(f => ({ type: f.type, name: f.name, amount: f.amount, text: f.text })),
      errors: ev.errors || [], html: aiActionableFindingsHtml(ev.findings) };
  })())`));
  return { c, ...result };
}
const ofType = (result, type) => result.findings.filter(f => f.type === type);

test('a summary line that was never photographed cannot prove the promotion did not land', async () => {
  // בלי "סהכ חייב מעמ" אין דרך לאמת את הנחת המסמך — בדיוק המצב של 17.9.
  const result = await evaluated({ subtotalExVat: null, netToChargeExVat: null }, [{ amount: 100, lines: 2 }]);
  assert.deepEqual(ofType(result, 'promo_missing'), [], 'no accusation without the discount line');
  const unread = ofType(result, 'promo_unread');
  assert.equal(unread.length, 1);
  assert.equal(unread[0].name, 'חלב במבצע');
  assert.equal(unread[0].amount, 0, 'an unknown never enters the money');
  assert.match(unread[0].text, /לא ידוע אם המבצע ירד: חלב במבצע — במערכת ₪4\.00, בנייר ₪5\.00/);
  assert.ok(result.errors.some(error => /סד הנחה בגין מבצעים" לא נקראה מהצילום/.test(error)));
  // המשתמש רואה את זה, ורואה מה לעשות.
  assert.match(result.html, /מבצע שאי אפשר לאמת — תחתית התעודה לא בצילום/);
  assert.match(result.html, /צלם שוב וכלול את תחתית התעודה/);
  assert.doesNotMatch(result.html, /המבצע לא מופיע אצל הספק/);
});

test('a summary line that was read and closes without a discount still accuses the supplier', async () => {
  // הנייר נקרא במלואו ונסגר בדיוק על 100 בלי שורת הנחה: המבצע באמת לא ירד.
  const result = await evaluated({}, [{ amount: 100, lines: 2 }]);
  assert.deepEqual(ofType(result, 'promo_unread'), [], 'a readable paper is not an unknown');
  const missing = ofType(result, 'promo_missing');
  assert.equal(missing.length, 1);
  assert.equal(missing[0].name, 'חלב במבצע');
  assert.equal(missing[0].amount, 10, 'the claim is 10 units × ₪1');
  assert.match(missing[0].text, /המבצע לא מופיע אצל הספק/);
  // הנייר הזה נקרא במלואו, ולכן בדיקת המחירים כבר שפטה את השורה בעצמה
  // והממצא הישן מוסתר מאחוריה — ההתנהגות הקיימת, לא שינוי של הבדיקה הזאת.
  assert.doesNotMatch(result.html, /מבצע שאי אפשר לאמת/);
});

test('a promotion that the printed discount covers exactly is never a finding at all', async () => {
  // ההנחה המודפסת סוגרת בדיוק את המבצע: אין טענה ואין ספק.
  const result = await evaluated({ subtotalExVat: 90, netToChargeExVat: 90, promoDiscountExVat: 10, documentDiscountExVat: 10 },
    [{ amount: 90, lines: 2 }]);
  assert.deepEqual(ofType(result, 'promo_missing'), []);
  assert.deepEqual(ofType(result, 'promo_unread'), []);
  assert.ok(result.findings.some(f => f.type === 'printed_promo' && /הנחה כללית מאומתת/.test(f.text || '')));
});
