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
