import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime } from './receipt-scan-harness.mjs';

// v141: without the printed document number, two photographed papers are told apart
// by their order in the photo ("תעודה 2"). Synthetic papers, one scan call per paper.
const products = [
  { id: 'milk', name: 'חלב 3% בקרטון 1 ליטר', barcode: '7290004131074', price: 5.36 },
  { id: 'oat', name: 'משקה שיבולת שועל 1 ליטר', barcode: '7290110325619', price: 8.82 },
  { id: 'top', name: 'יופלה און טופ פצפוצים 157 גרם', barcode: '7290110326210', price: 3.69 },
  { id: 'cream', name: 'שמנת חמוצה 15% 200 מ"ל', barcode: '72963746', price: 2.1 },
  { id: 'cheese', name: 'גבינה לבנה 5% 250 גרם', barcode: '7290004127329', price: 4.5 }
];
const r2 = n => Math.round(n * 100) / 100;
function paper(spec, { returns = false } = {}) {
  const rows = spec.map(([id, q]) => { const p = products.find(x => x.id === id);
    return { section: 'items', sourcePage: 1, lineNumber: null, code: p.barcode.length > 8 ? p.barcode.slice(-8).replace(/^0+/, '') : p.barcode,
      description: p.name, quantity: q, unitPriceExVat: p.price, lineTotalExVat: r2(q * p.price), promoStar: id === 'oat', confidence: .9 }; });
  const gross = r2(rows.reduce((n, r) => n + r.lineTotalExVat, 0));
  const promo = spec.some(s => s[0] === 'oat') ? r2(8.82 * .15 * spec.find(s => s[0] === 'oat')[1]) : 0;
  let subtotal = r2(gross - promo), returnsTotal = null;
  if (returns) {
    rows.push({ section: 'returns', sourcePage: 1, lineNumber: null, code: '72963746', description: 'שמנת חמוצה 15% 200 מ"ל',
      quantity: 2, unitPriceExVat: 2.1, lineTotalExVat: 4.2, promoStar: false, confidence: .9 });
    returnsTotal = 4.2; subtotal = r2(subtotal - 4.2);
  }
  return { noteIndex: 0, docType: 'invoice', docDate: null, pageCount: 1, vatPct: 18, rows, confidence: .9,
    itemsSectionTotalExVat: gross, itemsPrintedLines: spec.length, returnsSectionTotalExVat: returnsTotal,
    returnsPrintedLines: returns ? 1 : null, promoDiscountExVat: promo, subtotalExVat: subtotal, warnings: [] };
}
const promos = [{ id: 'drinks', name: 'משקה 15%', pct: 15, start: '2026-10-01', end: '2026-10-31', minQty: 1, minUnit: 'unit', type: 'receipt', productIds: ['oat'] }];
async function scan(papers) {
  const c = runtime('tnuva', { data: { products, promos, items: [], paper: { ok: true, serviceVersion: 17, scan: { warnings: [], documents: [] } } }, handoff: false });
  const original = c.context.fetch;
  c.context.fetch = async (url, options) => {
    if (!String(url).endsWith('/scan')) return original(url, options);
    const sent = options?.body || '', index = papers.findIndex((p, i) => sent.includes('UEFQRVI' + i));
    const body = JSON.stringify({ ok: true, serviceVersion: 17, model: 'fixture', requestId: 'p' + index,
      scan: { warnings: [], documents: papers[index] ? [papers[index]] : [] } });
    return { ok: true, status: 200, text: async () => body, json: async () => JSON.parse(body) };
  };
  c.run(`todayStr = () => '2026-10-15'; currentView='receiving'; mainMode='receiving'; refreshScanHost=()=>{};
    aiScanDocuments=${JSON.stringify(papers.map((p, i) => ({ noteIndex: i, amount: null, units: null, lines: null,
      pages: [{ dataUrl: 'data:image/jpeg;base64,UEFQRVI' + i, orientationConfirmed: true }] })))};`);
  await c.run('tnuvaStartPaperScan()');
  return c;
}
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('when the first of two papers was not read, the rows of the second still say "תעודה 2"', async () => {
  const c = await scan([null, paper([['milk', 10], ['top', 6]])]);
  assert.deepEqual(JSON.parse(c.run('JSON.stringify(aiScanResponse.scan.documents.map(d => d.noteIndex))')), [1]);
  const view = text(c.run('receiptPriceAuditHtml()'));
  assert.match(view, /תעודה 2 · עמוד 1/);
  assert.match(view, /תאריך התעודה 2/);
});

test('rows waiting for another paper say which rows and which paper', async () => {
  const c = await scan([paper([['milk', 96], ['oat', 4], ['cream', 10], ['top', 6]]), paper([['cheese', 12], ['milk', 10], ['cream', 4]], { returns: true })]);
  const help = text(c.run('receiptPriceSummaryHelpHtml(receiptPriceAudit(), true)'));
  assert.match(help, /מה נשאר להשלמת בדיקת המבצעים בתעודה 1\?/);
  assert.match(help, /כל 4 השורות בתעודה 1 ממתינות לתעודה 2: התעודה כוללת החזרות/);
  assert.doesNotMatch(help, /: תעודה 2:/);
});

test('a single paper gets no ordinal anywhere', async () => {
  const c = await scan([paper([['milk', 96], ['oat', 4], ['top', 6]])]);
  assert.doesNotMatch(text(c.run('receiptPriceAuditHtml()')), /תעודה 1/);
});
