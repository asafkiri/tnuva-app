import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime } from './receipt-scan-harness.mjs';

// v141, synthetic copy of the 15.10 paper: the header (type, number, date) was cut
// off in the photo, every row was read and the paper closed to the agora. Only the
// oat drink carries the printed star; its promotion explains the summary discount.
// A second promotion in the catalog was not applied on the paper. No private data.
const products = [
  { id: 'milk', name: 'חלב 3% בקרטון 1 ליטר', barcode: '7290004131074', price: 5.36 },
  { id: 'oat', name: 'משקה שיבולת שועל 1 ליטר', barcode: '7290110325619', price: 8.82 },
  { id: 'top', name: 'יופלה און טופ פצפוצים 157 גרם', barcode: '7290110326210', price: 3.69 },
  { id: 'cream', name: 'שמנת חמוצה 15% 200 מ"ל', barcode: '72963746', price: 2.1 }
];
const qty = [96, 4, 6, 10];
const rows = products.map((p, i) => ({ section: 'items', sourcePage: 1, lineNumber: null,
  code: p.barcode.length > 8 ? p.barcode.slice(-8).replace(/^0+/, '') : p.barcode, description: p.name,
  quantity: qty[i], unitPriceExVat: p.price, lineTotalExVat: Math.round(qty[i] * p.price * 100) / 100,
  promoStar: p.id === 'oat', confidence: .9 }));
const gross = Math.round(rows.reduce((n, r) => n + r.lineTotalExVat, 0) * 100) / 100;
const promoDiscount = 5.29; // 8.82 × 15% × 4
function fixture({ docType = 'unknown', withTopPromo = false, returns = false } = {}) {
  const docRows = rows.map(r => ({ ...r }));
  let subtotal = Math.round((gross - promoDiscount) * 100) / 100, returnsTotal = null;
  if (returns) {
    docRows.push({ section: 'returns', sourcePage: 1, lineNumber: null, code: '72963746', description: 'שמנת חמוצה 15% 200 מ"ל',
      quantity: 2, unitPriceExVat: 2.1, lineTotalExVat: 4.2, promoStar: false, confidence: .9 });
    returnsTotal = 4.2; subtotal = Math.round((subtotal - 4.2) * 100) / 100;
  }
  const promos = [{ id: 'drinks', name: 'משקה 15%', pct: 15, start: '2026-10-01', end: '2026-10-31',
    minQty: 1, minUnit: 'unit', type: 'receipt', productIds: ['oat'] }];
  if (withTopPromo) promos.push({ id: 'ontop', name: 'מעדני און טופ', pct: 20, start: '2026-10-11', end: '2026-10-31',
    minQty: 1, minUnit: 'unit', type: 'receipt', productIds: ['top'] });
  return { products, promos, items: [],
    paper: { ok: true, serviceVersion: 17, model: 'gpt-5.6-terra', requestId: 'no-doc-header-fixture',
      scan: { warnings: [], documents: [{ noteIndex: 0, docNumber: null, docType, docDate: null, pageCount: 1, vatPct: 18,
        rows: docRows, confidence: .78, itemsSectionTotalExVat: gross, itemsPrintedLines: rows.length,
        returnsSectionTotalExVat: returnsTotal, returnsPrintedLines: returns ? 1 : null,
        promoDiscountExVat: promoDiscount, subtotalExVat: subtotal,
        warnings: ['כותרת המסמך, מספר התעודה והתאריך חתוכים/אינם קריאים בצילום'] }] } } };
}
async function scan(options) {
  const c = runtime('tnuva', { data: fixture(options) });
  c.run(`todayStr = () => '2026-10-15'; currentView='receiving'; mainMode='receiving';
    refreshScanHost=()=>{};
    aiScanDocuments=[{noteIndex:0,amount:null,units:null,lines:null,
      pages:[{dataUrl:'data:image/jpeg;base64,Zml4dHVyZQ==',orientationConfirmed:true}]}];`);
  await c.run('tnuvaStartPaperScan()');
  return c;
}
const read = (c, expr) => JSON.parse(c.run(`JSON.stringify(${expr})`));
const view = c => c.run('receiptPriceAuditHtml()');

test('an unreadable header no longer fails the photo receiving or the price review', async () => {
  const c = await scan();
  assert.equal(read(c, `tnuvaPaperCheck(aiScanResponse.scan.documents[0], 1).receivable`), true);
  assert.deepEqual(read(c, `tnuvaPaperCheck(aiScanResponse.scan.documents[0], 1).review`), []);
  assert.notEqual(read(c, 'receiptPaperScanState'), 'failed');
  assert.doesNotMatch(read(c, 'receiptPaperScanProblems').join(' '), /סוג התעודה|כותרת/);
  const a = read(c, 'receiptPriceAudit()');
  assert.equal(a.complete, true);
  assert.equal(a.documents[0].summaryPending, false);
  assert.ok(a.rows.every(r => r.capability === 'checkable' && r.result === 'match'));
  const html = view(c);
  assert.match(html, /המחירים שנבדקו תואמים/);
  assert.doesNotMatch(html, /הפענוח חלקי|מספר לא נקרא|סוג התעודה|לא נקרא · |שורה לא נקראה/);
});

test('a catalog promotion the paper did not apply is named directly, not hidden behind the header', async () => {
  const c = await scan({ withTopPromo: true });
  const a = read(c, 'receiptPriceAudit()');
  assert.equal(a.complete, true);
  assert.deepEqual(a.rows.filter(r => r.result === 'difference').map(r => r.productId), ['top']);
  assert.match(a.documents[0].summaryStatus, /המבצע לא הופעל בשורה: יופלה און טופ פצפוצים 157 גרם/);
  assert.match(view(c), /המחיר בתעודה שונה מהמחיר שבמאגר · 1\/4 עם פער/);
});

test('the decision card names the promotion the paper did not apply, not a ₪0.00 price gap', async () => {
  const c = await scan({ withTopPromo: true });
  const cards = c.run('receiptRowActionsHtml(receiptPriceAudit())').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(cards, /המבצע שבמאגר לא הופעל בתעודה/);
  assert.match(cards, /ההנחה שלא התקבלה בשורה: ₪4\.43/);
  assert.match(cards, /אם "מעדני און טופ" אינו מבצע שיורד בתעודה/);
  assert.doesNotMatch(cards, /הפרש לשורה: ₪0\.00|עדכן את מחיר המאגר ל-₪3\.69/);
});

test('a handoff offer identifies the paper by its amount, with no dangling separator', async () => {
  const c = await scan();
  c.run(`receiptNotes=[{amount:1758.09,units:null,lines:20}]; recomputeNoteTotal();`);
  const summary = JSON.parse(c.run(`JSON.stringify(handoffPayload('receiving').summary)`));
  assert.equal(summary.paperAmount, 1758.09);
  const banner = c.run(`draftHandoffBannerHtml('receiving', { offers: [{ deviceName: 'קופה', updatedAt: 0, summary: { lines: 0, units: 0, paperUnits: null } },
    { deviceName: 'קופה', updatedAt: 0, summary: ${JSON.stringify(summary)} }] })`);
  assert.doesNotMatch(banner, / · \)/);
  assert.match(banner, /₪1,758\.09 בנייר/);
});

test('a credit note the model recognised is still stopped', async () => {
  const c = await scan({ docType: 'credit' });
  assert.equal(read(c, `tnuvaPaperCheck(aiScanResponse.scan.documents[0].__tnuvaPaper, 1).receivable`), false);
  assert.equal(read(c, 'receiptPriceAudit()').complete, false);
});

test('a credit note whose title was cut is still stopped by the minus on its summary', async () => {
  const c = await scan();
  const minus = `Object.assign({}, aiScanResponse.scan.documents[0].__tnuvaPaper, { docType: 'invoice',
    subtotalExVat: -aiScanResponse.scan.documents[0].__tnuvaPaper.subtotalExVat, vatAmount: -10, totalInclVat: -60 })`;
  const check = read(c, `tnuvaPaperCheck(${minus}, 1)`);
  assert.equal(check.ok, true); assert.equal(check.receivable, false);
  assert.match(check.review.join(' '), /כנראה חשבונית זיכוי/);
  // Only the VAT line kept its minus: still not ordinary goods.
  const partial = read(c, `tnuvaPaperCheck(Object.assign({}, aiScanResponse.scan.documents[0].__tnuvaPaper, { vatAmount: -10 }), 1)`);
  assert.equal(partial.receivable, false);
});

test('a reason that belongs to specific rows keeps the product names', async () => {
  const c = await scan();
  c.run(`products.filter(p => p.id === 'milk' || p.id === 'top' || p.id === 'cream').forEach(p => { p.price = 0; })`);
  const help = c.run('receiptPriceSummaryHelpHtml(receiptPriceAudit(), true)');
  for (const name of ['חלב 3% בקרטון 1 ליטר', 'יופלה און טופ פצפוצים 157 גרם', 'שמנת חמוצה 15% 200 מ&quot;ל'])
    assert.ok(help.includes(name + ': חסר מחיר במאגר'), name);
  assert.doesNotMatch(help, /3 שורות: /);
});

test('a document-level review gives each row its real reason, not "partial decoding"', async () => {
  const c = await scan({ returns: true });
  const a = read(c, 'receiptPriceAudit()');
  assert.equal(a.complete, false);
  assert.equal(a.rows.length, 4);
  assert.ok(a.rows.every(r => r.capability === 'partial' && /^התעודה כוללת החזרות/.test(r.reason)));
  assert.doesNotMatch(view(c), /הפענוח חלקי או חסר עמוד/);
});

test('a reason shared by every row is said once, and unchecked prices never read as "0 match"', async () => {
  const c = await scan();
  c.run(`aiScanResponse.scan.warnings.push('חסר עמוד 2 בתעודה')`);
  const a = read(c, 'receiptPriceAudit()');
  assert.equal(a.complete, false);
  assert.equal(a.documents[0].summaryPending, true);
  const html = view(c), help = c.run('receiptPriceSummaryHelpHtml(receiptPriceAudit(), true)');
  assert.match(help, /כל 4 השורות: הפענוח חלקי או חסר עמוד\/מסמך/);
  assert.equal((help.match(/הפענוח חלקי או חסר עמוד/g) || []).length, 1);
  assert.doesNotMatch(html, /0\/4 מחירי בסיס תואמים/);
  assert.match(html, /4\/4 לא נבדקו/);
});

test('no printed document number appears anywhere, and a single paper gets no ordinal either', async () => {
  const c = await scan({ withTopPromo: true });
  c.run(`aiScanResponse.scan.documents[0].docNumber = '561011080'; aiScanResponse.scan.documents[0].invoiceNumber = '561011080';
    aiScanResponse.scan.documents[0].__tnuvaPaper.docNumber = '561011080';`);
  const html = view(c);
  assert.doesNotMatch(html, /561011080/);
  assert.doesNotMatch(html, /תעודה 1/);
  assert.equal(c.run(`'docs' in handoffPayload('receiving').summary`), false);
});

test('a mixed paper whose returns exceed its goods closes with its own minus, and stays out of goods receiving', async () => {
  const c = await scan();
  const check = read(c, `tnuvaPaperCheck({ ...aiScanResponse.scan.documents[0].__tnuvaPaper, docType: 'invoice', promoDiscountExVat: 0,
    rows: [{ section: 'items', sourcePage: 1, quantity: 10, unitPriceExVat: 5, lineTotalExVat: 50 }, { section: 'returns', sourcePage: 1, quantity: 16, unitPriceExVat: 5, lineTotalExVat: 80 }],
    itemsSectionTotalExVat: 50, itemsPrintedLines: 1, returnsSectionTotalExVat: 80, returnsPrintedLines: 1, subtotalExVat: -30, vatAmount: -5.4, totalInclVat: -35.4 }, 1)`);
  assert.equal(check.ok, true); assert.equal(check.receivable, false); assert.deepEqual(check.problems, []);
});
