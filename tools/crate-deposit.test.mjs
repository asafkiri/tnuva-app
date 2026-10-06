import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime } from './receipt-scan-harness.mjs';

const crate = { id: 'crate', name: 'ארגז פלסטיק 30/40 אפור', barcode: '59631', price: 13.5 };
const milk = { id: 'milk', name: 'חלב בדיקה', barcode: '7290000000008', price: 5 };
const read = (c, expr) => JSON.parse(c.run(`JSON.stringify(${expr})`));
function fixture(received = 7) {
  const rows = [
    { code: '59631', description: 'ארגז פלסטי 30/40 אפור בקבוק פקדון', quantity: 7, unitPriceExVat: 13.5, lineTotalExVat: 94.5 },
    { code: '8', description: milk.name, quantity: 10, unitPriceExVat: 5, lineTotalExVat: 50 }
  ].map((r, i) => ({ ...r, section: 'items', sourcePage: 1, lineNumber: i + 1, confidence: .95 }));
  return { products: [crate, milk], promos: [],
    items: [{ productId: crate.id, name: crate.name, barcode: crate.barcode, qty: received },
      { productId: milk.id, name: milk.name, barcode: milk.barcode, qty: 10 }],
    paper: { ok: true, serviceVersion: 16, scan: { documents: [{ noteIndex: 0, pageCount: 1,
      docType: 'invoice', docDate: '2026-10-06', rows, confidence: .95, itemsPrintedLines: 2,
      itemsSectionTotalExVat: 144.5, promoDiscountExVat: 0, subtotalExVat: 144.5, warnings: [] }] } } };
}
async function scanned(data = fixture()) {
  const c = runtime('tnuva', { data });
  c.run(`todayStr=()=> '2026-10-06'; refreshScanHost=()=>{}; openScanner=()=>{}; closeScanner=()=>{}; logAction=()=>{};`);
  await c.scan();
  c.run('finishReceipt()');
  return c;
}

test('crate with appended deposit text is counted, matched and closes without a false surplus', async () => {
  const c = await scanned();
  assert.equal(c.run('aiScanEvaluation.valid'), true);
  assert.deepEqual(read(c, 'aiScanEvaluation.errors'), []);
  assert.deepEqual(read(c, 'aiScanEvaluation.findings.filter(f=>["shortage","surplus"].includes(f.type))'), []);
  assert.equal(c.run('aiScanEvaluation.aggregates.get("crate").qty'), 7);
  assert.equal(c.run('aiScanEvaluation.depositRows.length'), 0);
  assert.equal(c.run('aiScanEvaluation.extractedUnits'), 17);
  assert.equal(c.run('aiDocRowUnits(aiScanResponse.scan.documents[0])'), 17);
  assert.equal(c.run('tnuvaPaperCheck(aiScanResponse.scan.documents[0],1).units'), 17);
  const paper = c.run('JSON.stringify(aiScanResponse.scan.documents[0].__tnuvaPaper)');
  c.click('ai-apply');
  assert.equal(c.run('rcStep'), 'balanced');
  assert.equal(c.run('reconcileMoneyBalanced()'), true);
  assert.equal(c.run('reconcileData.find(l=>l.productId==="crate").noteQty'), 7);
  assert.equal(c.run('JSON.stringify(aiScanResponse.scan.documents[0].__tnuvaPaper)'), paper);
  assert.equal(c.run('products.find(p=>p.id==="crate").deposit == null'), true);
  assert.match(c.node('rsBody').innerHTML, /144.50/);
});

for (const [received, kind, qty] of [[5, 'shortage', 2], [9, 'surplus', 2], [0, 'shortage', 7]]) {
  test(`real crate ${kind} with ${received} received closes with the discrepancy preserved`, async () => {
    const c = await scanned(fixture(received));
    assert.equal(c.run('aiScanEvaluation.valid'), true);
    assert.deepEqual(read(c, 'aiScanEvaluation.findings.filter(f=>["shortage","surplus"].includes(f.type)).map(f=>({type:f.type,qty:f.qty,productId:f.productId}))'),
      [{ type: kind, qty, productId: 'crate' }]);
    c.click('ai-confirm-findings');
    c.click('ai-apply');
    assert.equal(c.run('rcStep'), 'balanced');
    assert.equal(c.run('reconcileMoneyBalanced()'), true);
    assert.deepEqual(read(c, 'reconcileData.filter(l=>l.productId==="crate").map(l=>({received:l.received,noteQty:l.noteQty}))'), [{ received, noteQty: 7 }]);
    assert.match(c.node('rsBody').innerHTML, new RegExp(kind === 'shortage' ? 'חסר ' + qty : 'עודף ' + qty));
  });
}

test('restored draft reuses the paper without another scan or editing the count', async () => {
  const c = await scanned();
  c.run('saveReceiptDraft()');
  const r = runtime('tnuva', { storage: c.storage, data: fixture() });
  r.context.savedDraft = JSON.parse(c.storage.get('tn_receipt_draft'));
  r.run(`todayStr=()=> '2026-10-06'; refreshScanHost=()=>{}; openScanner=()=>{}; closeScanner=()=>{};
    restoreReceiptDraft(savedDraft); finishReceipt();`);
  assert.equal(r.run('aiScanEvaluation.valid'), true);
  assert.equal(r.run('aiScanEvaluation.aggregates.get("crate").qty'), 7);
  assert.equal(r.run('receiptList.find(l=>l.productId==="crate").qty'), 7);
  assert.equal(r.requests.length, 0);
});

test('unconfigured separate deposits remain blocked and never fabricate a surplus', async () => {
  for (const description of ['בקבוק פקדון', 'פיקדון ארגז לא מזוהה']) {
    const data = fixture();
    data.paper.scan.documents[0].rows[0].description = description;
    if (description.includes('לא מזוהה')) data.paper.scan.documents[0].rows[0].code = null;
    const c = await scanned(data);
    assert.equal(c.run('aiScanEvaluation.valid'), false);
    assert.equal(c.run('aiScanEvaluation.basketComplete'), false);
    assert.match(c.run('aiScanEvaluation.errors.join(" ")'), /לא הוגדר פיקדון/);
    assert.equal(c.run('aiScanEvaluation.findings.some(f=>f.type==="surplus")'), false);
  }
});

test('a configured separate deposit is still money only, once', async () => {
  const data = fixture();
  data.products[0] = { ...crate, deposit: .3 };
  data.paper.scan.documents[0].rows[0] = { ...data.paper.scan.documents[0].rows[0],
    description: 'פיקדון ארגז', unitPriceExVat: .3, lineTotalExVat: 2.1 };
  data.paper.scan.documents[0].itemsSectionTotalExVat = 52.1;
  data.paper.scan.documents[0].subtotalExVat = 52.1;
  const c = await scanned(data);
  assert.equal(c.run('aiScanEvaluation.depositRows.length'), 1);
  assert.equal(c.run('aiScanEvaluation.depositRows[0].cents'), 210);
  assert.equal(c.run('aiScanEvaluation.aggregates.has("crate")'), false);
  assert.equal(c.run('aiDocRowUnits(aiScanResponse.scan.documents[0])'), 10);
});
