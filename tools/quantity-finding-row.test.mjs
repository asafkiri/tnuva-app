// v114: the shortage/surplus row shows billed · scanned · gap — but only when the
// arithmetic closes; otherwise it falls back to the plain one-line row.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as harness from './receipt-scan-harness.mjs';

const create = () => harness.runtime('tnuva');
const strip = s => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const cells = h => Object.fromEntries([...h.matchAll(/<div class="text-\[10px\] font-bold text-slate-500">([^<]*)<\/div><div class="text-base font-black [^"]*">([^<]*)<\/div>/g)].map(m => [m[1], m[2]]));
const ROW = '<div class="py-2 border-t border-black/5 first:border-t-0">';
function rowCells(html, name) {
  const start = html.indexOf(name, html.indexOf('אלה הבעיות שנמצאו'));
  assert.ok(start > 0, name);
  const end = html.indexOf(ROW, start);
  return cells(html.slice(start, end < 0 ? undefined : end));
}
function row(r, { billed, scanned, finding, type = 'shortage', basketComplete = true, hasAgg = billed != null }) {
  r.context.rowFinding = finding;
  return r.run(`aiScanEvaluation = { aggregates: new Map(${hasAgg ? `[['p1', { qty: ${billed} }]]` : '[]'}), basketComplete: ${basketComplete} };
    reconcileData = ${scanned == null ? '[]' : `[{ productId: 'p1', received: ${scanned} }]`};
    aiQuantityFindingRowHtml(rowFinding, '${type}', 'head')`);
}

test('engine shortage: three cells and a sentence that closes', () => {
  const h = row(create(), { billed: 24, scanned: 12, finding: { type: 'shortage', productId: 'p1', name: 'קוטג׳', qty: 12 } });
  assert.deepEqual(cells(h), { 'חויב בתעודה': '24', 'נסרק בפועל': '12', 'חסר': '12' });
  assert.ok(strip(h).includes('נסרקו 12 יח׳ מתוך 24 שחויבו בתעודה'));
  assert.ok(strip(h).startsWith('קוטג׳ חסר 12 יח׳'));
});

test('surplus on the paper: wording does not say "out of"', () => {
  const h = row(create(), { billed: 12, scanned: 15, type: 'surplus', finding: { type: 'surplus', productId: 'p1', name: 'חלב', qty: 3 } });
  assert.deepEqual(cells(h), { 'חויב בתעודה': '12', 'נסרק בפועל': '15', 'עודף': '3' });
  assert.ok(strip(h).includes('חויבו 12 יח׳ בתעודה ונסרקו 15'));
});

test('surplus not on the paper: billed 0; a zero-quantity paper row is not "absent"', () => {
  const r = create();
  let h = row(r, { billed: null, scanned: 4, type: 'surplus', finding: { type: 'surplus', productId: 'p1', name: 'קפה', qty: 4 } });
  assert.deepEqual(cells(h), { 'חויב בתעודה': '0', 'נסרק בפועל': '4', 'עודף': '4' });
  assert.ok(strip(h).includes('המוצר לא מופיע בתעודה, ונסרקו 4 יח׳'));
  h = row(r, { billed: 0, scanned: 4, type: 'surplus', finding: { type: 'surplus', productId: 'p1', name: 'קפה', qty: 4 } });
  assert.ok(strip(h).includes('בתעודה רשומות 0 יח׳, ונסרקו 4 יח׳'));
});

test('a finding whose qty is not billed − scanned (analyzer claim) keeps the plain row', () => {
  const h = row(create(), { billed: 6, scanned: 6, finding: { type: 'shortage', productId: 'p1', name: 'חלב', qty: 1, claimId: 'claim-0' } });
  assert.deepEqual(cells(h), {});
  assert.equal(strip(h), 'חלב חסר 1 יח׳');
});

test('partial basket: "billed" is labelled as resolved rows only', () => {
  const h = row(create(), { billed: 12, scanned: 10, basketComplete: false, finding: { type: 'shortage', productId: 'p1', name: 'קוטג׳', qty: 2 } });
  assert.deepEqual(cells(h), { 'חויב (שורות שזוהו)': '12', 'נסרק בפועל': '10', 'חסר': '2' });
  assert.ok(strip(h).includes('לא כל התעודה נקראה'));
});

test('degenerate states never throw and never leak NaN/undefined', () => {
  const r = create();
  const f = JSON.stringify({ type: 'shortage', productId: 'p1', name: 'x', qty: 2 });
  for (const setup of [
    'aiScanEvaluation = null; reconcileData = null;',
    'aiScanEvaluation = {}; reconcileData = undefined;',
    "aiScanEvaluation = { aggregates: { p1: { qty: 3 } } }; reconcileData = [];",
    "aiScanEvaluation = { aggregates: new Map([['p1', { qty: 3 }]]) }; reconcileData = [null, { productId: 'p1', received: 1 }];",
    "aiScanEvaluation = { aggregates: new Map([['p1', { qty: '3' }]]) }; reconcileData = [{ productId: 'p1', received: '1' }];"
  ]) {
    const h = r.run(setup + ' aiCompactFindingGroupHtml("shortage", "חוסרים", [' + f + '])');
    assert.ok(h.includes('חסר 2 יח׳'), setup);
    assert.ok(!/NaN|undefined|null/.test(strip(h)), setup);
  }
  assert.equal(r.run("aiScanEvaluation = null; aiQuantityFindingRowHtml(null, 'shortage', 'h').includes('חסר 0 יח׳')"), true);
});

test('real scan: every rendered row closes against the engine numbers', async () => {
  const products = [
    { id: 'milk', name: 'חלב בדיקה', barcode: '7290000000008', price: 5 },
    { id: 'coffee', name: 'קפה בדיקה', barcode: '7290000000015', price: 5 }
  ];
  const rows = [{ section: 'items', sourcePage: 1, lineNumber: 1, code: '8', barcode: '7290000000008',
    barcodeObserved: '7290000000008', barcodeReadType: 'full', barcodeMatchMethod: 'exact_full', description: 'חלב בדיקה',
    quantity: 10, unitPriceExVat: 5, lineTotalExVat: 50, promoStar: false, confidence: .95 }];
  const data = { products, promos: [],
    items: [{ productId: 'milk', name: 'חלב בדיקה', barcode: '7290000000008', qty: 7 }, { productId: 'coffee', name: 'קפה בדיקה', barcode: '7290000000015', qty: 4 }],
    paper: { ok: true, serviceVersion: 11, model: 'fixture', requestId: 'row-test', scan: { warnings: [], documents: [{
      noteIndex: 0, docNumber: 'INV-1', invoiceNumber: 'INV-1', docType: 'invoice', docDate: '17/09/2026',
      pageCount: 1, vatPct: 18, rows, confidence: .95, itemsSectionTotalExVat: 50, promoDiscountExVat: 0,
      documentDiscountExVat: 0, itemsPrintedLines: 1, printedLines: 1, returnsSectionTotalExVat: null,
      returnsPrintedLines: null, subtotalExVat: 50, netToChargeExVat: 50, printedUnits: null, totalUnits: null, warnings: [] }] } } };
  const r = harness.runtime('tnuva', { data });
  r.run("openScanner=()=>{}; closeScanner=()=>{}; scanBeep=()=>{}; buzz=()=>{}; refreshScanHost=()=>{};");
  await r.scan(1);
  r.run("receiptNotes = [{ amount: 50, lines: 1 }]; recomputeNoteTotal(); saveReceiptDraft(); openReconcile();");
  assert.equal(r.run('rcStep'), 'ai');
  const html = r.node('app').innerHTML;
  assert.ok(!/התצוגה נכשלה/.test(html));
  assert.deepEqual(rowCells(html, 'חלב בדיקה'), { 'חויב בתעודה': '10', 'נסרק בפועל': '7', 'חסר': '3' });
  assert.deepEqual(rowCells(html, 'קפה בדיקה'), { 'חויב בתעודה': '0', 'נסרק בפועל': '4', 'עודף': '4' });
});

// v116: the same billed · scanned · gap wherever a shortage/surplus is shown by
// default — the analyzer's claim card (it replaces the engine rows whenever its
// claims close), the close summary and the saved receipt's difference rows.
const tick = () => new Promise(resolve => setImmediate(resolve));
const CATALOG = [
  { id: 'A', name: 'גבינה א בדיקה', barcode: '7290000000008', price: 5 },
  { id: 'B', name: 'חלב ב בדיקה', barcode: '7290000000015', price: 5 },
  { id: 'C', name: 'קפה ג בדיקה', barcode: '7290000000022', price: 5 }
];
function paperScan(paper, scanned) {
  const rows = Object.entries(paper).map(([id, quantity], i) => {
    const p = CATALOG.find(x => x.id === id);
    return { section: 'items', sourcePage: 1, lineNumber: i + 1, code: String(i + 1), barcode: p.barcode, barcodeObserved: p.barcode,
      barcodeReadType: 'full', barcodeMatchMethod: 'exact_full', description: p.name, quantity, unitPriceExVat: p.price,
      grossLineTotalExVat: quantity * p.price, lineTotalExVat: quantity * p.price, lineDiscountExVat: 0, promoStar: false, confidence: .95 };
  });
  const total = rows.reduce((a, row) => a + row.lineTotalExVat, 0);
  return { products: CATALOG, promos: [],
    items: Object.entries(scanned).map(([id, qty]) => { const p = CATALOG.find(x => x.id === id); return { productId: id, name: p.name, barcode: p.barcode, qty }; }),
    paper: { ok: true, serviceVersion: 10, model: 'fixture', requestId: 'v116', scan: { warnings: [], documents: [{
      noteIndex: 0, docNumber: 'INV-1', invoiceNumber: 'INV-1', docType: 'invoice', docDate: '17/09/2026', pageCount: 1, vatPct: 18,
      rows, confidence: .95, itemsSectionTotalExVat: total, promoDiscountExVat: 0, documentDiscountExVat: 0,
      itemsPrintedLines: rows.length, printedLines: rows.length, returnsSectionTotalExVat: null, returnsPrintedLines: null,
      subtotalExVat: total, netToChargeExVat: total, printedUnits: null, totalUnits: null, warnings: [] }] } } };
}
// The live analyzer (not the harness stub) runs on its own after the count, as in
// production; the service's reply is the only fake.
async function analyzerLed(paper, scanned, claims, cloud = null) {
  const r = harness.runtime('tnuva', { data: paperScan(paper, scanned), cloud });
  if (cloud) await cloud.tick();
  r.run("openScanner=()=>{}; closeScanner=()=>{}; scanBeep=()=>{}; buzz=()=>{}; refreshScanHost=()=>{};");
  const original = r.context.fetch;
  r.context.fetch = async (url, options) => {
    if (!(options?.body && JSON.parse(options.body).mode === 'analyze')) return original(url, options);
    const body = JSON.stringify({ ok: true, analysis: { claims, summary: 'fixture' } });
    return { ok: true, status: 200, text: async () => body, json: async () => JSON.parse(body) };
  };
  r.run('aiRunAnalyzer = auditOriginalAnalyzer');
  await r.scan(1);
  r.run('finishReceipt()');
  for (let i = 0; i < 20; i++) await tick();
  assert.equal(r.run('rcStep'), 'ai');
  assert.equal(r.run('!!(aiAnalyzeResult && aiAnalyzeResult.accepted && aiScanEvaluation.analyzerLed)'), true);
  return r;
}
const CARD = '<div class="rounded-xl border p-2.5 ';
function claimCards(html) {
  const start = html.indexOf('נסגר בדיוק ✓');
  assert.ok(start > 0, 'analyzer box');
  const box = html.slice(start, html.indexOf('המנתח הוביל', start));
  return box.split(CARD).slice(1).map(h => ({ html: CARD + h, text: strip(CARD + h), cells: cells(h) }));
}
const grids = html => (html.match(/נסרק בפועל/g) || []).length;

test('v116 analyzer-led shortage (the default view): billed · scanned · missing under the claim', async () => {
  const r = await analyzerLed({ A: 12, B: 10 }, { A: 4, B: 10 }, [{ kind: 'shortage', productId: 'A', quantity: 8, amountExVat: 40, evidence: 'שורה 1: 12 יח׳' }]);
  const html = r.node('app').innerHTML;
  const [card, ...rest] = claimCards(html);
  assert.equal(rest.length, 0);
  assert.ok(card.text.startsWith('חוסר חוסר: 8 × גבינה א בדיקה · ₪40.00'), card.text);
  assert.deepEqual(card.cells, { 'חויב בתעודה': '12', 'נסרק בפועל': '4', 'חסר': '8' });
  assert.ok(card.text.includes('נסרקו 4 יח׳ מתוך 12 שחויבו בתעודה'));
  assert.ok(card.text.endsWith('שורה 1: 12 יח׳'), 'evidence stays last');
  assert.ok(!/NaN|undefined|null/.test(card.text));
  assert.equal(grids(html), 1, 'the engine rows are replaced, not repeated');
});

test('v116 re-evaluated scan (paper date filled in): the engine row has the numbers, the stale analyzer card does not repeat them', async () => {
  const r = await analyzerLed({ A: 12, B: 10 }, { A: 4, B: 10 }, [{ kind: 'shortage', productId: 'A', quantity: 8, amountExVat: 40 }]);
  assert.deepEqual(claimCards(r.node('app').innerHTML)[0].cells, { 'חויב בתעודה': '12', 'נסרק בפועל': '4', 'חסר': '8' });
  // Filling the date rebuilds aiScanEvaluation without the analyzer's lead, so
  // the engine rows come back while the accepted box is still drawn.
  assert.equal(r.run("priceAuditSetDate(0, '2026-09-17')"), true);
  r.run('renderReconcile()');
  for (let i = 0; i < 10; i++) await tick();
  const html = r.node('app').innerHTML;
  assert.equal(r.run('aiScanEvaluation.analyzerLed === true'), false);
  assert.deepEqual(rowCells(html, 'גבינה א בדיקה'), { 'חויב בתעודה': '12', 'נסרק בפועל': '4', 'חסר': '8' });
  const [card] = claimCards(html);
  assert.deepEqual(card.cells, {});
  assert.equal(card.text, 'חוסר חוסר: 8 × גבינה א בדיקה · ₪40.00 ₪40.00');
  assert.equal(grids(html), 1, 'one grid on the page, not two');
});

test('v116 analyzer surplus of a product not on the paper: billed 0', async () => {
  const r = await analyzerLed({ A: 12, B: 10 }, { A: 12, B: 10, C: 4 }, [{ kind: 'surplus', productId: 'C', quantity: 4, amountExVat: 20 }]);
  const [card] = claimCards(r.node('app').innerHTML);
  assert.deepEqual(card.cells, { 'חויב בתעודה': '0', 'נסרק בפועל': '4', 'עודף': '4' });
  assert.ok(card.text.includes('המוצר לא מופיע בתעודה, ונסרקו 4 יח׳'));
});

test('v116 claims that close on money but not per product keep the plain card', async () => {
  // A: 12 − 4 = 8 but the claim says 4; B: nothing missing but the claim says 4.
  // Together they close the ₪ gap, so the analyzer is accepted — the numbers
  // would contradict the claim, so only C (6 − 2 = 4) gets them.
  const r = await analyzerLed({ A: 12, B: 10, C: 6 }, { A: 4, B: 10, C: 2 }, [
    { kind: 'shortage', productId: 'A', quantity: 4 }, { kind: 'shortage', productId: 'B', quantity: 4 }, { kind: 'shortage', productId: 'C', quantity: 4 }]);
  const cards = claimCards(r.node('app').innerHTML);
  assert.deepEqual(cards.map(c => c.cells), [{}, {}, { 'חויב בתעודה': '6', 'נסרק בפועל': '2', 'חסר': '4' }]);
  assert.equal(cards[0].text, 'חוסר חוסר: 4 × גבינה א בדיקה');
});

test('v116 two quantity claims on one product (substitution split): no numbers for it; the substitution card stays plain', async () => {
  // A: shortage 8 and (via B→A) surplus 8; B: shortage 8 (via B→A) and surplus 8.
  // Each claim alone "closes" (12 − 4 = 8, 18 − 10 = 8) while the product's net
  // claim is 0 — the same-product guard keeps both plain. C is clean.
  const r = await analyzerLed({ A: 12, B: 10, C: 6 }, { A: 4, B: 18, C: 2 }, [
    { kind: 'shortage', productId: 'A', quantity: 8 }, { kind: 'substitution', productId: 'B', substituteProductId: 'A', quantity: 8 },
    { kind: 'surplus', productId: 'B', quantity: 8 }, { kind: 'shortage', productId: 'C', quantity: 4 }]);
  const html = r.node('app').innerHTML;
  const cards = claimCards(html);
  assert.deepEqual(cards.map(c => c.text.split(' ')[0]), ['חוסר', 'החלפה', 'עודף', 'חוסר']);
  assert.deepEqual(cards.map(c => c.cells), [{}, {}, {}, { 'חויב בתעודה': '6', 'נסרק בפועל': '2', 'חסר': '4' }]);
  assert.equal(grids(html), 1);
});

test('v116 close summary: a line with a difference shows billed · scanned · gap', async () => {
  const r = await analyzerLed({ A: 12, B: 10 }, { A: 4, B: 10 }, [{ kind: 'shortage', productId: 'A', quantity: 8, amountExVat: 40 }]);
  r.click('ai-confirm-findings');
  r.run('aiApplyInvoiceResult()');
  const text = strip(r.node('rsBody').innerHTML);
  assert.ok(text.includes('גבינה א בדיקה חויב בתעודה 12 · נסרק בפועל 4 · חסר 8 · ₪5.00 ליח׳ ₪20.00'), text);
  assert.ok(text.includes('חלב ב בדיקה התקבל 10 × ₪5.00 ₪50.00'), 'a line without a difference is unchanged');
  // Surplus and promo lines, straight through the renderer.
  r.run(`presentReconcileSummary([
    { name: 'יוגורט', qty: 13, noteQty: 10, unitPrice: 4.5, promoPct: 10, lineTotal: 58.5 },
    { name: 'שמנת', qty: 3, unitPrice: 2, promoPct: 0, lineTotal: 6 }], 64.5, true, {})`);
  const surplus = strip(r.node('rsBody').innerHTML);
  assert.ok(surplus.includes('יוגורט חויב בתעודה 10 · נסרק בפועל 13 · עודף 3 · ₪4.50 ליח׳ · מבצע 10% ₪58.50'), surplus);
  assert.ok(surplus.includes('שמנת התקבל 3 × ₪2.00 ₪6.00'));
});

test('v116 saved receipt: the difference row shows billed · scanned after a real close', async () => {
  const cloud = harness.fakeCloud();
  const r = await analyzerLed({ A: 12, B: 10 }, { A: 4, B: 10 }, [{ kind: 'shortage', productId: 'A', quantity: 8, amountExVat: 40 }], cloud);
  r.click('ai-confirm-findings');
  r.run('aiApplyInvoiceResult()');
  await r.run('confirmReceipt()');
  const saved = r.writes.slice().reverse().find(w => w && w.data && Array.isArray(w.data.items));
  assert.ok(saved, 'receipt saved');
  r.context.savedRc = { ...saved.data, id: 'rc1' };
  r.run("receipts = [savedRc]; receiptHistoryFilter = 'all'; renderReceiptsHistory()");
  const html = r.node('app').innerHTML;
  const box = strip(html.slice(html.indexOf('הפרשים מול התעודה'), html.indexOf('<button data-role="rc-offset-choose"')));
  assert.equal(box, 'הפרשים מול התעודה חסר: גבינה א בדיקה חויב בתעודה 12 · נסרק בפועל 4 · חסר 8 יח׳ · ₪40.00');
});

test('v116 saved receipt: numbers only where they close; offsets and charges keep today\'s row', () => {
  const r = harness.runtime('tnuva');
  r.context.rc = { id: 'rc9', timestamp: Date.parse('2026-09-17T08:00:00Z'), date: '2026-09-17', status: 'open',
    noteTotalInc: 1000, noteParts: [{ amount: 1000 }],
    items: [
      { productId: 'A', name: 'גבינה', qty: 4, noteQty: 12, unitPrice: 5, lineTotal: 20 },       // clean shortage
      { productId: 'C', name: 'קפה', qty: 13, noteQty: 10, unitPrice: 7, lineTotal: 91 },        // clean surplus
      { productId: 'D', name: 'שוקו', qty: 2, noteQty: 6, unitPrice: 3, lineTotal: 6 },          // 1 of 4 offset against another receipt
      { productId: 'E', name: 'לבן', qty: 1, noteQty: 5, unitPrice: 9, lineTotal: 9 },           // same-price internal offset with F
      { productId: 'F', name: 'מעדן', qty: 2, noteQty: 1, unitPrice: 9, lineTotal: 18 },
      { productId: 'G', name: 'חמאה', qty: 5, noteQty: 2, unitPrice: 11, lineTotal: 55 },        // supplier charged 1 of the 3
      { productId: 'deposit-recv-x', name: 'פיקדון', qty: 9, noteQty: 6, unitPrice: 13, lineTotal: 117, isDeposit: true }],
    externalOffsets: [{ id: 'x1', otherId: 'rc8', productId: 'D', dir: 'short', qty: 1, source: 'auto' }],
    overChargeNotes: [{ id: 'oc1', productId: 'G', name: 'חמאה', n: 1, amount: 11, at: 1 }] };
  r.run("receipts = [rc]; receiptHistoryFilter = 'all'; renderReceiptsHistory()");
  const html = r.node('app').innerHTML;
  const rows = [...html.matchAll(/<div class="font-bold truncate">([^<]*)<\/div><div class="text-\[11px\] opacity-80">([^<]*)<\/div>/g)].map(m => (m[1] + ' | ' + m[2]).replace(/\u00a0/g, ' ')); // v116: רווח קשיח בין תווית למספר
  assert.deepEqual(rows, [
    'חסר: גבינה | חויב בתעודה 12 · נסרק בפועל 4 · חסר 8 יח׳ · ₪40.00',
    'חסר: שוקו | 3 יח׳ · ₪9.00',
    'חסר: לבן | 3 יח׳ · ₪27.00',
    'עודף: קפה | חויב בתעודה 10 · נסרק בפועל 13 · עודף 3 יח׳ · ₪21.00',
    'עודף: חמאה | 2 יח׳ · ₪22.00',
    'עודף: פיקדון | 3 יח׳ · ₪39.00'
  ]);
  // Two difference rows for one product (two paper lines at two prices): the
  // offset leaves the shortage row at 5 = 12 − 7 for the product, yet a surplus
  // row of the same product is still open next to it — no numbers for either.
  r.context.rc2 = { ...r.context.rc, id: 'rc10', overChargeNotes: [],
    externalOffsets: [{ id: 'x2', otherId: 'rc8', productId: 'A', dir: 'short', qty: 3, source: 'auto' }],
    items: [{ productId: 'A', name: 'גבינה', qty: 4, noteQty: 12, unitPrice: 5, lineTotal: 20 }, { productId: 'A', name: 'גבינה', qty: 3, noteQty: 0, unitPrice: 6, lineTotal: 18 }] };
  r.run("receipts = [rc2]; renderReceiptsHistory()");
  const two = [...r.node('app').innerHTML.matchAll(/<div class="text-\[11px\] opacity-80">([^<]*)<\/div>/g)].map(m => m[1]);
  assert.deepEqual(two, ['5 יח׳ · ₪25.00', '3 יח׳ · ₪18.00']);
});
