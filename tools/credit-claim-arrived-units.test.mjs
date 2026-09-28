// v117: the price/promo credit claim of a scanned receipt covers only billed units
// that arrived, and never more than the paper itself shows. A product with a price
// finding is written at the paper price, so a missing unit is already deducted at
// that price — the old claim took its price difference a second time. And the
// analyzer's gate closes on money only, so a "price" claim the paper does not show
// (billed exactly at the expected price) opened a claim on money that was already
// deducted as a shortage. The manual check (no scan) had the first bug too.
// The cap is per product and comes from the paper: when the analyzer led, the claim
// is built from the engine's paper comparison, so a gap the analyzer put on the wrong
// product, lumped, or split into several claims is claimed once, on the right product.
// Missing goods that arrive later are paid at the paper price, so their gap goes back
// into the claim (and out again if that goods credit is cancelled).
//
// The second group pins the paper quantity (noteQty) when several findings touch
// one product — the Berman "last finding wins" bug. Tnuva writes noteQty from the
// paper aggregates, so these pass before and after v117; they guard that rule.
//
// The whole module runs (raw Tnuva paper → adapter → evaluation → analyzer gate →
// apply → save → history → month billing). Only the network reply is faked.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as harness from './receipt-scan-harness.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
const json = (r, expression) => JSON.parse(r.run('JSON.stringify(' + expression + ')'));
const strip = s => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const CATALOG = [
  { id: 'A', name: 'גבינה א בדיקה', barcode: '7290000000008', price: 5 },
  { id: 'B', name: 'חלב ב בדיקה', barcode: '7290000000015', price: 5 },
  { id: 'C', name: 'קפה ג בדיקה', barcode: '7290000000022', price: 5 },
  { id: 'D', name: 'שוקו ד בדיקה', barcode: '7290000000039', price: 5 }
];
const product = id => CATALOG.find(p => p.id === id);
const PROMO_A20 = [{ id: 'p20', type: 'receipt', name: 'מבצע א', pct: 20, minQty: 1, minUnit: 'unit', cartonSize: null, start: '2020-01-01', end: '2099-12-31', productIds: ['A'] }];
// A document as Tnuva prints it and the service returns it: the item code (the
// barcode's last digits), the printed price, the line total. docs: [[id, qty, unit?], ...] per document.
function tnuvaDoc(noteIndex, lines) {
  const rows = lines.map(([id, quantity, unit = product(id).price], i) => ({ section: 'items', sourcePage: 1, lineNumber: i + 1,
    code: product(id).barcode.slice(-8).replace(/^0+/, ''), description: product(id).name, quantity, unitPriceExVat: unit,
    lineTotalExVat: Math.round(quantity * unit * 100) / 100, promoStar: false, confidence: .95 }));
  const net = Math.round(rows.reduce((sum, row) => sum + row.lineTotalExVat * 100, 0)) / 100;
  return { noteIndex, docNumber: 'T' + noteIndex, docType: 'invoice', docDate: '17/09/2026', pageCount: 1, vatPct: 18, rows, confidence: .95,
    itemsSectionTotalExVat: net, promoDiscountExVat: 0, itemsPrintedLines: rows.length, returnsSectionTotalExVat: null,
    returnsPrintedLines: null, subtotalExVat: net, netToChargeExVat: net, vatAmount: null, totalInclVat: null, warnings: [] };
}
// claims: the analyzer's reply (null = the engine leads; the live analyzer still runs and says nothing).
async function receive(docs, scanned, claims = null, { promos = [], catalog = CATALOG } = {}) {
  const documents = docs.map((lines, i) => tnuvaDoc(i, lines));
  const data = { products: catalog, promos,
    items: Object.entries(scanned).map(([id, qty]) => ({ productId: id, name: product(id).name, barcode: product(id).barcode, qty })),
    paper: { ok: true, serviceVersion: 13, model: 'fixture', requestId: 'v117', scan: { warnings: [], documents } } };
  const r = harness.runtime('tnuva', { data });
  r.run("openScanner=()=>{}; closeScanner=()=>{}; scanBeep=()=>{}; buzz=()=>{}; refreshScanHost=()=>{}; showConfirm=(t,x,l,fn)=>fn();");
  const original = r.context.fetch;
  let scanCalls = 0;
  r.context.fetch = async (url, options) => {
    const reply = value => { const body = JSON.stringify(value); return { ok: true, status: 200, text: async () => body, json: async () => JSON.parse(body) }; };
    // One request per document, as the service is called: each gets its own paper
    // (the shared fake answers every request with all of them).
    if (documents.length > 1 && String(url).endsWith('/scan') && options?.body && JSON.parse(options.body).mode !== 'analyze') {
      r.requests.push({ url: String(url), body: options.body });
      const doc = { ...structuredClone(documents[scanCalls++ % documents.length]), noteIndex: 0 };
      return reply({ ...structuredClone(data.paper), scan: { warnings: [], documents: [doc] } });
    }
    if (!(options?.body && JSON.parse(options.body).mode === 'analyze')) return original(url, options);
    return reply({ ok: true, analysis: { claims: claims || [], summary: 'fixture' } });
  };
  r.run('aiRunAnalyzer = auditOriginalAnalyzer');
  await r.scan(documents.length);
  r.run('finishReceipt()');
  for (let i = 0; i < 25; i++) await tick();
  assert.equal(r.run('rcStep'), 'ai');
  assert.equal(r.run('aiScanEvaluation.valid'), true, json(r, 'aiScanEvaluation.errors').join(';'));
  assert.equal(r.run('aiScanEvaluation.analyzerLed === true'), claims != null && claims.length > 0, 'who leads');
  return r;
}
// Close through the buttons the owner presses, save, then read the receipt back
// the way history and the month report do.
async function closeAndSave(r) {
  if (!r.node('app').innerHTML.includes('data-role="ai-apply"')) r.click('ai-confirm-findings');
  r.click('ai-apply');
  assert.equal(r.run('aiScanError'), '', 'apply rolled back');
  const pending = json(r, 'pendingReceipt');
  const summary = strip(r.node('rsBody').innerHTML);
  r.run('flushReceiptDraftToCloud=async()=>{receiptSync.dirty=false;return true;}');
  await r.run('confirmReceipt()');
  for (let i = 0; i < 5; i++) await tick();
  const saved = r.writes.slice().reverse().find(w => w && w.data && Array.isArray(w.data.items)).data;
  r.context.savedRc = { ...saved, id: 'rc1' };
  r.run("receipts = [savedRc]; receiptHistoryFilter = 'all'; renderReceiptsHistory()");
  const month = json(r, '(d => ({ recEx: d.recEx, pendingSupplierCreditEx: d.pendingSupplierCreditEx, netEx: d.netEx }))(receiptRangeData(null, null))');
  const info = json(r, '(di => ({ open: di.open, aiAuditOpen: di.aiAuditOpen, shortValRaw: di.shortValRaw }))(receiptDiscrepancyInfo(receipts[0]))');
  const history = strip(r.node('app').innerHTML);
  const lines = Object.fromEntries(saved.items.map(l => [l.productId, { qty: l.qty, noteQty: l.noteQty }]));
  return { pending, saved, month, info, history, lines, summary };
}
const claimOf = saved => saved.supplierCreditClaim && {
  amount: saved.supplierCreditClaim.amount,
  items: saved.supplierCreditClaim.items.map(i => ({ productId: i.productId, qty: i.qty, amount: i.amount, reason: i.reason }))
};
// With a short credit for the whole shortage, is the receipt still open?
const openAfterShortCredit = (r, amount) => r.run(`receiptDiscrepancyInfo(Object.assign({}, receipts[0], { shortCreditNotes: [{ amount: ${amount}, at: 1 }] })).open`);

// ─── the credit claim ────────────────────────────────────────────────────────

test('engine: 12 billed at ₪5.50 instead of ₪5, 4 arrived — claim 4 × ₪0.50, month pays exactly what arrived', async () => {
  const r = await receive([[['A', 12, 5.5], ['B', 10]]], { A: 4, B: 10 });
  assert.deepEqual(json(r, "aiScanEvaluation.findings.filter(f => f.type === 'shortage' || f.type === 'price').map(f => [f.type, f.productId, f.qty, f.amount == null ? null : f.amount])"),
    [['shortage', 'A', 8, null], ['price', 'A', 12, 6]]);
  const { pending, saved, month, lines, summary } = await closeAndSave(r);
  assert.deepEqual(lines, { A: { qty: 4, noteQty: 12 }, B: { qty: 10, noteQty: undefined } });
  assert.equal(pending.ex, 72); // ₪116 on paper − 8 missing × ₪5.50
  assert.deepEqual(saved.supplierCreditClaim.items, [{ productId: 'A', name: 'גבינה א בדיקה', qty: 4, expectedUnitPrice: 5, chargedUnitPrice: 5.5, amount: 2, reason: 'price' }]);
  assert.equal(saved.supplierCreditClaim.amount, 2);
  assert.ok(summary.includes('סכום מוערך לזיכוי: ₪2.00'), summary);
  // 4 × ₪5 + 10 × ₪5 — before v117 the month said ₪66 (claim 12 × ₪0.50 on top of the shortage).
  assert.deepEqual(month, { recEx: 72, pendingSupplierCreditEx: 2, netEx: 70 });
  assert.equal(saved.status, 'open');
});

test('analyzer-led: the same paper explained as shortage 8 + price on 12 — the same ₪2 claim and ₪70', async () => {
  const r = await receive([[['A', 12, 5.5], ['B', 10]]], { A: 4, B: 10 }, [
    { kind: 'shortage', productId: 'A', quantity: 8, amountExVat: 40 },
    { kind: 'price', productId: 'A', quantity: 12, billedUnitPriceExVat: 5.5, expectedUnitPriceExVat: 5, amountExVat: 6 }]);
  const { pending, saved, month, lines } = await closeAndSave(r);
  assert.deepEqual(lines.A, { qty: 4, noteQty: 12 });
  assert.equal(pending.ex, 72);
  assert.deepEqual(claimOf(saved), { amount: 2, items: [{ productId: 'A', qty: 4, amount: 2, reason: 'price' }] });
  assert.deepEqual(month, { recEx: 72, pendingSupplierCreditEx: 2, netEx: 70 });
});

test('analyzer "price" claim the paper does not show (billed at ₪5 = expected): no claim, the shortage is deducted once', async () => {
  // Money-only gate: ₪40 of "price" closes the ₪40 gap of 8 missing units.
  const r = await receive([[['A', 12], ['B', 10]]], { A: 4, B: 10 }, [
    { kind: 'price', productId: 'A', quantity: 12, billedUnitPriceExVat: 5, expectedUnitPriceExVat: 5, amountExVat: 40 }]);
  assert.equal(r.run('aiAnalyzeResult.accepted'), true);
  const { pending, saved, month, info, history, lines, summary } = await closeAndSave(r);
  assert.deepEqual(lines.A, { qty: 4, noteQty: 12 });
  assert.equal(pending.ex, 70);
  assert.equal(saved.supplierCreditClaim, null); // before v117: ₪40, and the month paid ₪30
  assert.ok(!summary.includes('נפתחה דרישת זיכוי'), summary);
  assert.deepEqual(month, { recEx: 70, pendingSupplierCreditEx: 0, netEx: 70 });
  // The claim the owner approved stays in the record, marked, and does not hold the receipt open.
  const finding = saved.aiAudit.findings.find(f => f.type === 'price');
  assert.equal(finding.noClaim, true);
  assert.equal(finding.text, 'מחיר שונה: גבינה א בדיקה — בלי דרישת זיכוי: בנייר אין הפרש מחיר על יחידה שהגיעה');
  assert.ok(history.includes('• מחיר שונה: גבינה א בדיקה — בלי דרישת זיכוי'), history);
  assert.ok(history.includes('חויב בתעודה 12 · נסרק בפועל 4 · חסר 8'), history);
  assert.deepEqual(info, { open: true, aiAuditOpen: false, shortValRaw: 40 });
  assert.equal(openAfterShortCredit(r, 40), false);
});

test('a product billed at a wrong price that did not arrive at all: nothing to claim, the whole paper line is the shortage', async () => {
  const r = await receive([[['A', 12, 5.5], ['B', 10]]], { B: 10 });
  const { pending, saved, month, info, lines } = await closeAndSave(r);
  assert.deepEqual(lines.A, { qty: 0, noteQty: 12 });
  assert.equal(pending.ex, 50);
  assert.equal(saved.supplierCreditClaim, null); // before v117: 12 × ₪0.50 = ₪6 more
  assert.deepEqual(month, { recEx: 50, pendingSupplierCreditEx: 0, netEx: 50 });
  assert.equal(saved.aiAudit.findings.find(f => f.type === 'price').noClaim, true);
  assert.deepEqual(info, { open: true, aiAuditOpen: false, shortValRaw: 66 });
  assert.equal(openAfterShortCredit(r, 66), false, 'a credited shortage closes the receipt');
});

test('one product on two paper rows at two prices (6 × ₪5 + 6 × ₪5.50), 4 arrived: the claim follows the average paper price', async () => {
  const r = await receive([[['A', 6], ['A', 6, 5.5], ['B', 10]]], { A: 4, B: 10 });
  assert.deepEqual(json(r, "aiScanEvaluation.findings.filter(f => f.type === 'price').map(f => [f.productId, f.qty, f.amount])"), [['A', 12, 3]]);
  const { pending, saved, month } = await closeAndSave(r);
  assert.equal(pending.ex, 71); // ₪113 − 8 × ₪5.25
  assert.deepEqual(claimOf(saved), { amount: 1, items: [{ productId: 'A', qty: 4, amount: 1, reason: 'price' }] });
  assert.deepEqual(month, { recEx: 71, pendingSupplierCreditEx: 1, netEx: 70 });
});

test('promo the supplier did not give, 4 of 12 arrived: claim the promo on the 4', async () => {
  const r = await receive([[['A', 12], ['B', 10]]], { A: 4, B: 10 }, null, { promos: PROMO_A20 });
  assert.deepEqual(json(r, "aiScanEvaluation.findings.filter(f => f.type === 'promo_missing').map(f => [f.productId, f.qty, f.expectedPrice, f.amount])"), [['A', 12, 4, 12]]);
  const { pending, saved, month } = await closeAndSave(r);
  assert.equal(pending.ex, 70); // ₪110 − 8 × ₪5 (the paper price)
  assert.deepEqual(claimOf(saved), { amount: 4, items: [{ productId: 'A', qty: 4, amount: 4, reason: 'promo_missing' }] });
  assert.deepEqual(month, { recEx: 70, pendingSupplierCreditEx: 4, netEx: 66 }); // 4 × ₪4 + 10 × ₪5
});

// Nothing missing: the claim is exactly what it was before v117.
for (const [label, scannedA] of [['everything arrived', 12], ['2 more arrived than billed', 14]]) {
  test('unchanged: 12 billed at ₪5.50, ' + label + ' — claim 12 × ₪0.50 as before', async () => {
    const r = await receive([[['A', 12, 5.5], ['B', 10]]], { A: scannedA, B: 10 });
    const { pending, saved, month, info } = await closeAndSave(r);
    assert.equal(pending.ex, 116);
    assert.deepEqual(pending.supplierCreditClaim, { status: 'open', source: 'ai_invoice_scan', amount: 6,
      items: [{ productId: 'A', name: 'גבינה א בדיקה', qty: 12, expectedUnitPrice: 5, chargedUnitPrice: 5.5, amount: 6, reason: 'price' }] });
    assert.deepEqual(month, { recEx: 116, pendingSupplierCreditEx: 6, netEx: 110 });
    assert.equal(saved.aiAudit.findings.some(f => 'noClaim' in f), false);
    assert.equal(info.aiAuditOpen, true);
  });
}

// ─── the claim follows the paper, product by product, whoever explained it ──
// The analyzer's gate weighs money only, so it cannot tell which product carries a
// price gap, and it lets one gap be split into several claims. When the analyzer
// led, the claim is built from the engine's paper comparison (one finding per
// product), capped per product; the analyzer's words stay as the explanation.

test('the analyzer names the wrong product for a real price gap: the claim follows the paper (A), and the month pays ₪110', async () => {
  // A billed 12 at ₪5.50 (list ₪5); the analyzer calls it "price B ₪6" (B was billed at exactly ₪5).
  const claimB = { kind: 'price', productId: 'B', quantity: 10, billedUnitPriceExVat: 5.6, expectedUnitPriceExVat: 5, amountExVat: 6 };
  let r = await receive([[['A', 12, 5.5], ['B', 10]]], { A: 12, B: 10 }, [claimB]);
  let { saved, month, info } = await closeAndSave(r);
  assert.deepEqual(claimOf(saved), { amount: 6, items: [{ productId: 'A', qty: 12, amount: 6, reason: 'price' }] }); // a per-claim cap on B dropped it: ₪116
  assert.deepEqual(month, { recEx: 116, pendingSupplierCreditEx: 6, netEx: 110 });
  assert.equal(info.open, true, 'the claim keeps the receipt open until the supplier credits it');
  // The analyzer's wording stays, marked: the paper shows no gap on B.
  assert.deepEqual(saved.aiAudit.findings.filter(f => f.type === 'price').map(f => [f.productId, f.noClaim === true]), [['B', true]]);
  // The same mislabel with 8 of A missing: the claim is the gap on the 4 that arrived.
  r = await receive([[['A', 12, 5.5], ['B', 10]]], { A: 4, B: 10 }, [{ kind: 'shortage', productId: 'A', quantity: 8, amountExVat: 40 }, claimB]);
  ({ saved, month } = await closeAndSave(r));
  assert.deepEqual(claimOf(saved), { amount: 2, items: [{ productId: 'A', qty: 4, amount: 2, reason: 'price' }] });
  assert.deepEqual(month, { recEx: 72, pendingSupplierCreditEx: 2, netEx: 70 });
});

test('the gap is on B, the analyzer names A (same catalog price, nothing missing): claim B ₪6, month ₪120', async () => {
  const r = await receive([[['A', 12], ['B', 12, 5.5]]], { A: 12, B: 12 },
    [{ kind: 'price', productId: 'A', quantity: 12, amountExVat: 6, billedUnitPriceExVat: 5.5 }]);
  const { saved, month, info } = await closeAndSave(r);
  assert.deepEqual(claimOf(saved), { amount: 6, items: [{ productId: 'B', qty: 12, amount: 6, reason: 'price' }] });
  assert.deepEqual(month, { recEx: 126, pendingSupplierCreditEx: 6, netEx: 120 }); // 24 × ₪5
  assert.equal(info.open, true);
});

test('two products overcharged, the analyzer lumps ₪12 on A: claim A ₪6 + B ₪6, month ₪110', async () => {
  const r = await receive([[['A', 12, 5.5], ['B', 10, 5.6]]], { A: 12, B: 10 },
    [{ kind: 'price', productId: 'A', quantity: 12, billedUnitPriceExVat: 6, expectedUnitPriceExVat: 5, amountExVat: 12 }]);
  const { saved, month } = await closeAndSave(r);
  assert.deepEqual(claimOf(saved), { amount: 12, items: [{ productId: 'A', qty: 12, amount: 6, reason: 'price' }, { productId: 'B', qty: 10, amount: 6, reason: 'price' }] });
  assert.deepEqual(month, { recEx: 122, pendingSupplierCreditEx: 12, netEx: 110 }); // before this fix: ₪116 (B's ₪6 lost)
});

test('several price claims on one product never add up past the paper: one capped claim per product', async () => {
  const SHORT8 = { kind: 'shortage', productId: 'A', quantity: 8, amountExVat: 40 };
  // A on two rows (6 × ₪5.50 + 6 × ₪5.60, list ₪5), 4 of 12 arrived, one price claim per row.
  let r = await receive([[['A', 6, 5.5], ['A', 6, 5.6], ['B', 10]]], { A: 4, B: 10 }, [SHORT8,
    { kind: 'price', productId: 'A', quantity: 6, billedUnitPriceExVat: 5.5, expectedUnitPriceExVat: 5, amountExVat: 3 },
    { kind: 'price', productId: 'A', quantity: 6, billedUnitPriceExVat: 5.6, expectedUnitPriceExVat: 5, amountExVat: 3.6 }]);
  let { saved, month } = await closeAndSave(r);
  // The paper's gap: 4 × (₪5.55 − ₪5) = ₪2.20 — a cap per claim took it twice (₪4.40).
  assert.deepEqual(claimOf(saved), { amount: 2.2, items: [{ productId: 'A', qty: 4, amount: 2.2, reason: 'price' }] });
  assert.deepEqual(month, { recEx: 72.2, pendingSupplierCreditEx: 2.2, netEx: 70 });
  // One gap split into three claims of ₪2, each under the per-unit cap of ₪2: still ₪2 in all.
  r = await receive([[['A', 12, 5.5], ['B', 10]]], { A: 4, B: 10 }, [SHORT8, ...[1, 2, 3].map(() =>
    ({ kind: 'price', productId: 'A', quantity: 4, billedUnitPriceExVat: 5.5, expectedUnitPriceExVat: 5, amountExVat: 2 }))]);
  ({ saved, month } = await closeAndSave(r));
  assert.deepEqual(claimOf(saved), { amount: 2, items: [{ productId: 'A', qty: 4, amount: 2, reason: 'price' }] });
  assert.deepEqual(month, { recEx: 72, pendingSupplierCreditEx: 2, netEx: 70 }); // before: ₪66
});

test('the engine could not close the paper on its own: the analyzer led, and the claim is still the paper gap on A', async () => {
  // A promotion that needs 20 units: 24 arrived, the paper billed 12 (no promotion on
  // the paper basket), so the engine's own findings miss by ₪12 and the analyzer leads.
  const promos = [{ ...PROMO_A20[0], minQty: 20 }];
  const r = await receive([[['A', 12, 5.5], ['B', 10]]], { A: 24, B: 10 },
    [{ kind: 'surplus', productId: 'A', quantity: 12 }, { kind: 'price', productId: 'A', quantity: 12, billedUnitPriceExVat: 5.5, expectedUnitPriceExVat: 4, amountExVat: 9 },
      { kind: 'price', productId: 'A', quantity: 12, billedUnitPriceExVat: 5.5, expectedUnitPriceExVat: 4, amountExVat: 9 }], { promos });
  assert.equal(r.run('aiScanEvaluation.analyzerLed'), true);
  assert.deepEqual(json(r, 'aiScanEvaluation.engineFindings.filter(f => f.type === "price").map(f => [f.productId, f.amount])'), [['A', 6]]);
  const { saved, month } = await closeAndSave(r);
  assert.deepEqual(claimOf(saved), { amount: 6, items: [{ productId: 'A', qty: 12, amount: 6, reason: 'price' }] });
  assert.deepEqual(month, { recEx: 116, pendingSupplierCreditEx: 6, netEx: 110 });
});

test('everything arrived: the claim is the engine\'s own amount to the agora (a product on two rows at two prices, with a promotion)', async () => {
  // Catalog ₪4.65 with 15% off → expected ₪3.9525 (not rounded). 9 × ₪4.75 + 1 × ₪4.93.
  const catalog = CATALOG.map(p => p.id === 'A' ? { ...p, price: 4.65 } : p);
  const r = await receive([[['A', 9, 4.75], ['A', 1, 4.93], ['B', 5]]], { A: 10, B: 5 }, null,
    { catalog, promos: [{ ...PROMO_A20[0], pct: 15 }] });
  const finding = json(r, 'aiScanEvaluation.findings.find(f => f.type === "price")');
  assert.equal(finding.amount, 8.16);
  const { saved, month } = await closeAndSave(r);
  // A cap recomputed as (average price − expected) × qty lands on ₪8.15 — nothing was missing, nothing to cap.
  assert.deepEqual(claimOf(saved), { amount: 8.16, items: [{ productId: 'A', qty: 10, amount: 8.16, reason: 'price' }] });
  assert.equal(saved.aiAudit.findings.find(f => f.type === 'price').amount, 8.16);
  assert.deepEqual(month, { recEx: 72.68, pendingSupplierCreditEx: 8.16, netEx: 64.52 });
});

// ─── the missing goods arrive later ("הסחורה הגיעה") ─────────────────────────
// The claim covers the billed units that arrived because a missing unit is deducted
// at the paper price. When the missing units arrive later they are paid at the paper
// price, so their price gap goes back into the claim — and comes out again if the
// goods credit is cancelled.
async function goodsLater(r, shortCredit) {
  r.context.cloudTasks = [];
  r.run('runCloudTask = async (name, task) => { cloudTasks.push(task); return true; }');
  if (shortCredit) r.run(`receipts[0].shortCreditNotes = [{ amount: ${shortCredit}, at: 1 }]`);
  r.run("openShortGoodsPrompt('rc1')");
  await r.run('confirmShortGoodsCredit()');
  const month = () => json(r, '(d => ({ recEx: d.recEx, pendingSupplierCreditEx: d.pendingSupplierCreditEx, netEx: d.netEx }))(receiptRangeData(null, null))');
  return { month, claim: () => claimOf(json(r, 'receipts[0]')), task: json(r, 'cloudTasks').at(-1) };
}
test('goods later: 12 billed at ₪5.50 (list ₪5), 4 arrived, 8 came later — the claim grows to ₪6 and the month pays ₪110', async () => {
  const r = await receive([[['A', 12, 5.5], ['B', 10]]], { A: 4, B: 10 });
  const { saved, month: atClose } = await closeAndSave(r);
  assert.deepEqual(claimOf(saved), { amount: 2, items: [{ productId: 'A', qty: 4, amount: 2, reason: 'price' }] });
  assert.deepEqual(atClose, { recEx: 72, pendingSupplierCreditEx: 2, netEx: 70 });
  const later = await goodsLater(r);
  assert.deepEqual(later.claim(), { amount: 6, items: [{ productId: 'A', qty: 12, amount: 6, reason: 'price' }] });
  assert.deepEqual(later.month(), { recEx: 116, pendingSupplierCreditEx: 6, netEx: 110 }); // was ₪114
  assert.equal(later.task.data.supplierCreditClaim.amount, 6, 'the grown claim is written with the goods credit');
  assert.deepEqual(later.task.data.shortGoodsCredit.claimTopUp, [{ productId: 'A', qty: 8, amount: 4 }]);
  // Cancelling the goods credit takes the addition back out.
  await r.run("cancelShortGoodsCredit('rc1')");
  assert.deepEqual(later.claim(), { amount: 2, items: [{ productId: 'A', qty: 4, amount: 2, reason: 'price' }] });
  assert.deepEqual(later.month(), { recEx: 72, pendingSupplierCreditEx: 2, netEx: 70 });
});

test('goods later after a partial money credit: only the units the goods covered go back into the claim', async () => {
  // ₪22 of the ₪44 shortage was credited in money (4 units at the paper ₪5.50); the goods cover the other 4.
  const r = await receive([[['A', 12, 5.5], ['B', 10]]], { A: 4, B: 10 });
  await closeAndSave(r);
  const later = await goodsLater(r, 22);
  assert.deepEqual(later.claim(), { amount: 4, items: [{ productId: 'A', qty: 8, amount: 4, reason: 'price' }] });
  assert.deepEqual(later.month(), { recEx: 94, pendingSupplierCreditEx: 4, netEx: 90 }); // 8 × ₪5 + ₪50
});

test('goods later on the manual promotion claim: 4 of 12 arrived at the full price, the other 8 came later — claim ₪12, month ₪98', async () => {
  const r = harness.runtime('tnuva', { data: { products: CATALOG, promos: PROMO_A20, items: [], paper: null } });
  r.run(`buzz = () => {}; receiptList = [{ productId: 'A', name: 'גבינה א בדיקה', barcode: '7290000000008', qty: 4 }, { productId: 'B', name: 'חלב ב בדיקה', barcode: '7290000000015', qty: 10 }];
    receiptNotes = [{ amount: 110 }]; recomputeNoteTotal(); openReconcile(); rcStep = 'manual';`);
  r.run("reconcileSetNoteLive('A', '12')");
  r.run("manualTogglePromoClaim('A')"); r.node('pmClaim').onclick();
  r.run('saveReconciledReceipt({ skipChecked: true })');
  r.run('flushReceiptDraftToCloud=async()=>{receiptSync.dirty=false;return true;}');
  await r.run('confirmReceipt()');
  for (let i = 0; i < 5; i++) await tick();
  r.context.savedRc = { ...r.writes.slice().reverse().find(w => w && w.data && Array.isArray(w.data.items)).data, id: 'rc1' };
  r.run('receipts = [savedRc]; returns = [];');
  assert.equal(json(r, 'receipts[0].supplierCreditClaim.amount'), 4);
  const later = await goodsLater(r);
  assert.deepEqual(json(r, 'receipts[0].supplierCreditClaim.items.map(i => [i.productId, i.qty, i.expectedDiscount])'), [['A', 12, 12]]);
  assert.deepEqual(later.month(), { recEx: 110, pendingSupplierCreditEx: 12, netEx: 98 }); // 12 × ₪4 + ₪50
});

// ─── the paper, not the claim, sets the cap ──────────────────────────────────

test('an analyzer claim whose "billed" price contradicts the paper (says ₪5.50, the paper ₪5): no claim', async () => {
  const r = await receive([[['A', 12], ['B', 10]]], { A: 4, B: 10 }, [
    { kind: 'price', productId: 'A', quantity: 12, billedUnitPriceExVat: 5.5, expectedUnitPriceExVat: 5, amountExVat: 40 }]);
  assert.equal(r.run('aiAnalyzeResult.accepted'), true);
  const { saved, month } = await closeAndSave(r);
  assert.equal(saved.supplierCreditClaim, null);
  assert.deepEqual(month, { recEx: 70, pendingSupplierCreditEx: 0, netEx: 70 });
});

test('an analyzer "overcharge" on a product the paper billed below the expected price: no claim', async () => {
  // A billed at ₪4.50 (expected ₪5), B 2 short: the ₪4 net gap is closed by a "+₪4 price on A" claim.
  const r = await receive([[['A', 12, 4.5], ['B', 10]]], { A: 12, B: 8 }, [
    { kind: 'price', productId: 'A', quantity: 12, billedUnitPriceExVat: 5.5, expectedUnitPriceExVat: 5, amountExVat: 4 }]);
  assert.equal(r.run('aiAnalyzeResult.accepted'), true);
  const { saved } = await closeAndSave(r);
  assert.equal(saved.supplierCreditClaim, null);
});

test('a small over-claim is still capped (₪1.20 on 12 billed at ₪5.10, 11 arrived → ₪1.10)', async () => {
  const r = await receive([[['A', 12, 5.1], ['B', 10]]], { A: 11, B: 10 });
  const { saved } = await closeAndSave(r);
  assert.deepEqual(claimOf(saved), { amount: 1.1, items: [{ productId: 'A', qty: 11, amount: 1.1, reason: 'price' }] });
});

test('a price finding that never had a claim (paper cheaper than expected) is saved as before, without a noClaim mark', async () => {
  const r = await receive([[['A', 12, 4.5], ['B', 10]]], { A: 12, B: 10 });
  const { saved } = await closeAndSave(r);
  const finding = saved.aiAudit.findings.find(f => f.type === 'price');
  assert.deepEqual([finding.productId, finding.amount], ['A', -6]);
  assert.equal('noClaim' in finding, false);
  assert.equal(saved.supplierCreditClaim, null);
});

test('manual check, 14 arrived of 12 billed: the promotion claim covers the 12 billed, not the 14', () => {
  const r = harness.runtime('tnuva', { data: { products: CATALOG, promos: PROMO_A20, items: [], paper: null } });
  r.run(`buzz = () => {}; receiptList = [{ productId: 'A', name: 'גבינה א בדיקה', barcode: '7290000000008', qty: 14 }, { productId: 'B', name: 'חלב ב בדיקה', barcode: '7290000000015', qty: 10 }];
    receiptNotes = [{ amount: 110 }]; recomputeNoteTotal(); openReconcile(); rcStep = 'manual';`);
  r.run("reconcileSetNoteLive('A', '12')");
  r.run("manualTogglePromoClaim('A')"); r.node('pmClaim').onclick();
  r.run('saveReconciledReceipt({ skipChecked: true })');
  assert.deepEqual(json(r, 'pendingReceipt').supplierCreditClaim.items.map(i => [i.productId, i.qty, i.expectedDiscount]), [['A', 12, 12]]);
});

// The manual check (no scan) has the same rule: "the supplier did not honour the
// promo" flips the line to the full price, so the claim is on billed units that arrived.
for (const order of ['paper quantity first, then the promo', 'the promo first, then the paper quantity']) {
  test('manual check: 12 billed at full price, promo 20%, 4 arrived — ' + order + ': claim ₪4, pay ₪66', () => {
    const r = harness.runtime('tnuva', { data: { products: CATALOG, promos: PROMO_A20, items: [], paper: null } });
    r.run(`buzz = () => {}; receiptList = [{ productId: 'A', name: 'גבינה א בדיקה', barcode: '7290000000008', qty: 4 }, { productId: 'B', name: 'חלב ב בדיקה', barcode: '7290000000015', qty: 10 }];
      receiptNotes = [{ amount: 110 }]; recomputeNoteTotal(); openReconcile(); rcStep = 'manual';`);
    const markPromo = () => { r.run("manualTogglePromoClaim('A')"); r.node('pmClaim').onclick(); };
    const enterPaper = () => r.run("reconcileSetNoteLive('A', '12')");
    if (order.startsWith('paper')) { enterPaper(); markPromo(); } else { markPromo(); enterPaper(); }
    r.run('saveReconciledReceipt({ skipChecked: true })');
    const pending = json(r, 'pendingReceipt');
    assert.deepEqual(pending.lines.find(l => l.productId === 'A'), { productId: 'A', name: 'גבינה א בדיקה', barcode: '7290000000008', qty: 4, unitPrice: 5, basePrice: 5, lineTotal: 20, promoPct: 0, noteQty: 12 });
    assert.equal(pending.ex, 70); // ₪110 − 8 missing × ₪5
    assert.equal(pending.supplierCreditClaim.amount, 4); // before v117, paper first: 12 × ₪1
    assert.deepEqual(pending.supplierCreditClaim.items.map(i => [i.productId, i.qty, i.expectedDiscount]), [['A', 4, 4]]);
  });
}

// ─── the paper quantity (noteQty) when several findings touch one product ────

const PAPER = [['A', 12], ['B', 10]];
for (const [label, claims] of [
  ['shortage 6, then substitution A→B 2', [{ kind: 'shortage', productId: 'A', quantity: 6 }, { kind: 'substitution', productId: 'A', substituteProductId: 'B', quantity: 2 }]],
  ['substitution A→B 2, then shortage 6', [{ kind: 'substitution', productId: 'A', substituteProductId: 'B', quantity: 2 }, { kind: 'shortage', productId: 'A', quantity: 6 }]]
]) {
  test('paper quantity: ' + label + ' — A saved as billed 12, B as billed 10, in either order', async () => {
    const r = await receive([PAPER], { A: 4, B: 12 }, claims);
    assert.equal(r.run("aiScanEvaluation.findings.filter(f => f.productId === 'A' && f.type === 'shortage').length"), 2);
    const { lines } = await closeAndSave(r);
    assert.deepEqual(lines, { A: { qty: 4, noteQty: 12 }, B: { qty: 12, noteQty: 10 } });
  });
}

test('paper quantity: the substitute is not on the paper at all — A 12, D billed 0', async () => {
  const r = await receive([PAPER], { A: 4, B: 10, D: 2 }, [
    { kind: 'shortage', productId: 'A', quantity: 6 }, { kind: 'substitution', productId: 'A', substituteProductId: 'D', quantity: 2 }]);
  const { lines } = await closeAndSave(r);
  assert.deepEqual(lines, { A: { qty: 4, noteQty: 12 }, B: { qty: 10, noteQty: undefined }, D: { qty: 2, noteQty: 0 } });
});

test('paper quantity: two shortage claims 5 + 3 on A printed on two rows (7 + 5) — A 12', async () => {
  const r = await receive([[['A', 7], ['A', 5], ['B', 10]]], { A: 4, B: 10 }, [
    { kind: 'shortage', productId: 'A', quantity: 5 }, { kind: 'shortage', productId: 'A', quantity: 3 }]);
  const { lines, pending } = await closeAndSave(r);
  assert.deepEqual(lines.A, { qty: 4, noteQty: 12 });
  assert.equal(pending.ex, 70);
});

test('paper quantity: A on two documents (5 + 7), engine-led — A 12', async () => {
  const r = await receive([[['A', 5], ['B', 10]], [['A', 7]]], { A: 4, B: 10 });
  assert.equal(r.run('receiptNoteTotal'), 110);
  const { lines, pending, history } = await closeAndSave(r);
  assert.deepEqual(lines, { A: { qty: 4, noteQty: 12 }, B: { qty: 10, noteQty: undefined } });
  assert.equal(pending.ex, 70);
  assert.ok(history.includes('חויב בתעודה 12 · נסרק בפועל 4 · חסר 8'), history);
});

test('paper quantity: shortage and surplus of B from different claims — A 12, B 10 (a surplus of 1, not a shortage)', async () => {
  const r = await receive([PAPER], { A: 4, B: 11 }, [
    { kind: 'substitution', productId: 'A', substituteProductId: 'B', quantity: 3 },
    { kind: 'shortage', productId: 'A', quantity: 5 }, { kind: 'shortage', productId: 'B', quantity: 2 }]);
  const { lines } = await closeAndSave(r);
  assert.deepEqual(lines, { A: { qty: 4, noteQty: 12 }, B: { qty: 11, noteQty: 10 } });
});

test('paper quantity: a product never scanned, explained by two claims — a line billed 3, received 0', async () => {
  const r = await receive([[['A', 12], ['B', 10], ['C', 3]]], { A: 12, B: 11 }, [
    { kind: 'substitution', productId: 'C', substituteProductId: 'B', quantity: 1 }, { kind: 'shortage', productId: 'C', quantity: 2 }]);
  const { lines } = await closeAndSave(r);
  assert.deepEqual(lines, { A: { qty: 12, noteQty: undefined }, B: { qty: 11, noteQty: 10 }, C: { qty: 0, noteQty: 3 } });
});

test('paper quantity: one engine finding — saved exactly as always, and applying twice changes nothing', async () => {
  const r = await receive([PAPER], { A: 4, B: 10 });
  r.click('ai-confirm-findings');
  r.run('saveReconciledReceipt = () => {}');
  r.click('ai-apply');
  const first = json(r, 'reconcileData.map(l => [l.productId, l.received, l.noteQty, l.price])');
  r.run('aiApplyInvoiceResult()');
  assert.deepEqual(json(r, 'reconcileData.map(l => [l.productId, l.received, l.noteQty, l.price])'), first);
  assert.deepEqual(first, [['A', 4, 12, 5], ['B', 10, 10, 5]]);
});

test('paper quantity: one engine finding, saved — A 4/12, ₪70, no claim, history billed · scanned · missing', async () => {
  const r = await receive([PAPER], { A: 4, B: 10 });
  const { lines, pending, saved, month, history } = await closeAndSave(r);
  assert.deepEqual(lines, { A: { qty: 4, noteQty: 12 }, B: { qty: 10, noteQty: undefined } });
  assert.equal(pending.ex, 70);
  assert.equal(saved.supplierCreditClaim, null);
  assert.deepEqual(month, { recEx: 70, pendingSupplierCreditEx: 0, netEx: 70 });
  assert.ok(history.includes('חויב בתעודה 12 · נסרק בפועל 4 · חסר 8'), history);
});
