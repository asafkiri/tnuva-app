// A billed product can be missing from the delivery: choosing its identity must
// work without a physical barcode, and must never count it as received.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime } from './receipt-scan-harness.mjs';

const products = [
  { id: 'pizza', name: 'פתיתים מיוחדים לפיצה השף הלבן 500 גרם', barcode: '7290004128432', price: 18.04 },
  { id: 'feta', name: 'בולגרית פיראוס 5% 250 גרם', barcode: '7290004120634', price: 18.42 },
  { id: 'cream', name: 'שמנת עמידה לבישול 15% השף הלבן 250 מ"ל', barcode: '7290004125721', price: 6.77 },
  { id: 'yolo', name: 'YOLO שוקולד חלב 123 גרם', barcode: '7290014761056', price: 3.47 },
  { id: 'hidden', name: 'פתיתים לפיצה מוצר מוסתר', barcode: '7290000888888', price: 18.04, hidden: true }
];
const paperRows = [
  { lineNumber: 1, code: null, description: 'פתיתים מיוחדים לפיצה השף הלבן 500 גרם', quantity: 6, unitPriceExVat: 18.04, lineTotalExVat: 108.24 },
  { lineNumber: 2, code: '4120634', description: 'בולגרית פיראוס 5% 250 גרם', quantity: 4, unitPriceExVat: 18.42, lineTotalExVat: 73.68 },
  { lineNumber: 3, code: '4125721', description: 'שמנת לבישול 15%', quantity: 1, unitPriceExVat: 20, lineTotalExVat: 20 }
].map(row => ({ ...row, section: 'items', sourcePage: 1, promoStar: false, confidence: .8 }));
const fixture = {
  products, promos: [], items: [],
  paper: {
    ok: true, serviceVersion: 16, model: 'gpt-5.6-terra', requestId: 'row-product-search-fixture',
    consensus: {
      attempted: true, reads: 2, completedReads: 2, agreed: false, escalated: true,
      model: 'gpt-5.6-luna', escalationModel: 'gpt-5.6-terra',
      disputedRows: [{ noteIndex: 0, rowIndex: 1, lineNumber: 2, code: '4120634',
        fields: [{ field: 'quantity', selected: 4, other: 6 },
          { field: 'unitPriceExVat', selected: 18.42, other: 10.78 },
          { field: 'lineTotalExVat', selected: 73.68, other: 64.68 }] }]
    },
    scan: { warnings: [], documents: [{ noteIndex: 0, docNumber: 'search-test', docType: 'invoice',
      docDate: '06/10/2026', pageCount: 1, vatPct: 18, rows: paperRows, confidence: .8,
      itemsSectionTotalExVat: 201.92, itemsPrintedLines: 3, printedLines: 3,
      promoDiscountExVat: 0, documentDiscountExVat: 0, subtotalExVat: 201.92,
      netToChargeExVat: 201.92, warnings: [] }] }
  }
};

async function scanned() {
  const c = runtime('tnuva', { data: structuredClone(fixture) });
  c.run(`currentView = 'receiving'; mainMode = 'receiving'; scanPurpose = 'receiving';
    refreshScanHost = () => {};
    openScanner = () => { scannerOpened = true; };
    closeScanner = () => { scannerOpened = false; };
    scanBeep = () => {}; buzz = () => {};
    aiScanDocuments = [{ noteIndex: 0, amount: null, units: null, lines: null,
      pages: [{ dataUrl: 'data:image/jpeg;base64,Zml4dHVyZQ==', orientationConfirmed: true }] }];`);
  await c.run('tnuvaStartPaperScan()');
  return c;
}
const read = (c, expression) => JSON.parse(c.run(`JSON.stringify(${expression})`));
const rowAt = (c, index) => read(c, `aiScanResponse.scan.documents[0].rows[${index}]`);
const searchIds = (c, query) => read(c, `receiptRowProductSearchMatches(${JSON.stringify(query)}).map(product => product.id)`);
const open = (c, sourceIndex) => c.run(`receiptOpenRowProductSearch(0, ${sourceIndex})`);
const select = (c, productId) => c.run(`receiptSelectSearchedRowProduct(${JSON.stringify(productId)})`);
function modalClick(c, role, product) {
  const target = { dataset: { role, product }, closest: selector => selector === '[data-role]' ? target : null };
  return c.events.get('receiptRowProductSearchModal:click')({ target });
}

test('catalog search finds names in either word order, full or partial barcode and supplier code', async () => {
  const c = await scanned();
  assert.deepEqual(searchIds(c, 'פיצה הלבן'), ['pizza']);
  assert.deepEqual(searchIds(c, '  הלבן   פיצה  '), ['pizza']);
  assert.deepEqual(searchIds(c, 'yolo חלב'), ['yolo']);
  for (const query of ['7290004128432', '128432', '4128432']) {
    assert.deepEqual(searchIds(c, query), ['pizza'], query);
  }
  assert.deepEqual(searchIds(c, 'פיצה חסרבמאגר'), []);
  assert.deepEqual(searchIds(c, 'מוסתר'), []);
  assert.deepEqual(searchIds(c, '7290000888888'), []);
});

test('every open row card offers catalog search, including the disputed row in the screenshot', async () => {
  const c = await scanned();
  const actions = read(c, 'receiptRowActions()');
  assert.deepEqual(actions.unidentified.map(item => item.row.sourceIndex), [0]);
  assert.deepEqual(actions.disputed.map(item => item.row.sourceIndex), [1]);
  assert.deepEqual(actions.priced.map(item => item.row.sourceIndex), [2]);
  c.run('renderReceiving()');
  for (const index of [0, 1, 2]) {
    assert.match(c.node('app').innerHTML,
      new RegExp(`data-role="rowfix-search"[^>]*data-doc="0"[^>]*data-row="${index}"`));
  }
  c.click('rowfix-search', null, { doc: '0', row: '1' });
  assert.equal(c.node('receiptRowProductSearchModal').classList.contains('hidden'), false);
  assert.equal(c.run('scanPurpose'), 'receiving', 'search does not start a camera scan');
});

test('selecting a catalog identity preserves paper evidence and leaves received quantities untouched', async () => {
  const c = await scanned();
  // Some other goods were received, but the selected product never arrived.
  c.run("receiptList = [{ productId: 'cream', name: 'שמנת', barcode: '7290004125721', qty: 2 }]");
  const received = read(c, 'receiptList');
  const paper = read(c, 'aiScanResponse.scan.documents[0].__tnuvaPaper');
  const consensus = read(c, 'aiScanResponse.perDocument');
  const before = rowAt(c, 0);
  assert.equal(open(c, 0), true);
  assert.equal(select(c, 'pizza'), true);
  const mapped = rowAt(c, 0);
  assert.equal(mapped.__tnuvaProductId, 'pizza');
  assert.equal(mapped.barcode, products[0].barcode);
  assert.equal(mapped.barcodeMatchMethod, 'user_confirmed');
  assert.equal(mapped.barcodeUserConfirmedFromMethod, 'picked_from_catalog');
  assert.equal(mapped.barcodeUserConfirmedFromCatalogHintId, 'pizza');
  assert.equal(read(c, 'aiResolveInvoiceBarcode(aiScanResponse.scan.documents[0].rows[0]).product').id, 'pizza');
  for (const field of ['quantity', 'unitPriceExVat', 'lineTotalExVat', 'description']) {
    assert.equal(mapped[field], before[field], field);
  }
  assert.deepEqual(read(c, 'receiptList'), received, 'choosing a billed product cannot receive it');
  assert.equal(c.run("aiScanEvaluation.findings.some(finding => finding.type === 'shortage' && finding.productId === 'pizza' && finding.qty === 6)"),
    true, 'all six billed but absent units remain a shortage');
  assert.deepEqual(read(c, 'aiScanResponse.scan.documents[0].__tnuvaPaper'), paper, 'immutable OCR evidence');
  assert.deepEqual(read(c, 'aiScanResponse.perDocument'), consensus, 'all competing OCR readings remain');
  assert.equal(c.requests.filter(request => request.url.endsWith('/scan')).length, 1, 'no new OCR scan');
  assert.equal(c.writes.length, 0, 'no product or price changes');
  assert.equal(c.node('receiptRowProductSearchModal').classList.contains('hidden'), true);

  c.run('saveReceiptDraft()');
  const restored = runtime('tnuva', { data: structuredClone(fixture), storage: c.storage });
  restored.run('restoreReceiptDraft()');
  assert.equal(rowAt(restored, 0).barcodeUserConfirmedFromMethod, 'picked_from_catalog');
  assert.equal(read(restored, 'aiResolveInvoiceBarcode(aiScanResponse.scan.documents[0].rows[0]).product').id, 'pizza');
  assert.deepEqual(read(restored, 'receiptList'), received);
  assert.deepEqual(read(restored, 'aiScanResponse.scan.documents[0].__tnuvaPaper'), paper);
});

test('the modal input filters immediately and its own delegated pick listener saves the selection', async () => {
  const c = await scanned();
  c.click('rowfix-search', null, { doc: '0', row: '0' });
  c.node('receiptRowProductSearchInput').value = 'מוצרשלאקיים';
  c.events.get('receiptRowProductSearchInput:input')({ target: c.node('receiptRowProductSearchInput') });
  assert.equal(c.node('receiptRowProductSearchResults').innerHTML, '');
  assert.match(c.node('receiptRowProductSearchStatus').textContent, /לא נמצא מוצר/);
  c.node('receiptRowProductSearchInput').value = 'פיצה הלבן';
  c.events.get('receiptRowProductSearchInput:input')({ target: c.node('receiptRowProductSearchInput') });
  const results = c.node('receiptRowProductSearchResults').innerHTML;
  assert.match(results, /data-role="rowfix-search-pick" data-product="pizza"/);
  assert.match(results, /7290004128432/);
  assert.doesNotMatch(results, /data-product="(?:feta|cream|hidden)"/);
  modalClick(c, 'rowfix-search-pick', 'pizza');
  assert.equal(rowAt(c, 0).__tnuvaProductId, 'pizza');
  assert.equal(c.node('receiptRowProductSearchModal').classList.contains('hidden'), true);
  assert.deepEqual(read(c, 'receiptList'), []);
});

test('choosing the identity cannot approve quantity or money disagreements or catalog price differences', async () => {
  const c = await scanned();
  assert.equal(open(c, 1), true);
  assert.equal(select(c, 'feta'), true);
  const actions = read(c, 'receiptRowActions()');
  assert.deepEqual(actions.disputed.map(item => item.row.sourceIndex), [1]);
  assert.deepEqual(actions.disputed[0].dispute.fields.map(item => item.field),
    ['quantity', 'unitPriceExVat', 'lineTotalExVat']);
  assert.equal(actions.decided, 0);
  assert.equal(rowAt(c, 1).quantity, 4);
  assert.equal(rowAt(c, 1).unitPriceExVat, 18.42);
  assert.equal(rowAt(c, 1).lineTotalExVat, 73.68);

  assert.equal(open(c, 2), true);
  assert.equal(select(c, 'cream'), true);
  assert.deepEqual(read(c, 'receiptRowActions().priced.map(item => item.row.sourceIndex)'), [2]);
  assert.equal(c.run("products.find(product => product.id === 'cream').price"), 6.77);
  assert.deepEqual(read(c, 'receiptList'), []);
});

test('cancelling search makes no changes and invalidates a later selection', async () => {
  const c = await scanned();
  const before = read(c, 'aiScanResponse');
  assert.equal(open(c, 0), true);
  c.run('receiptCloseRowProductSearch()');
  assert.equal(c.node('receiptRowProductSearchModal').classList.contains('hidden'), true);
  assert.equal(select(c, 'pizza'), false);
  assert.deepEqual(read(c, 'aiScanResponse'), before);
  assert.deepEqual(read(c, 'receiptList'), []);
});

test('a row changed or replaced while search is open cannot receive the stale selection', async () => {
  for (const change of [
    'aiScanResponse.scan.documents[0].rows[0].quantity = 7',
    'aiScanResponse.scan.documents[0].__tnuvaPaper.rows[0].quantity = 7',
    'aiScanResponse.scan.documents[0].rows[0] = structuredClone(aiScanResponse.scan.documents[0].rows[1])',
    'aiScanResponse.scan.documents = []'
  ]) {
    const c = await scanned();
    assert.equal(open(c, 0), true);
    c.run(change);
    const changed = read(c, 'aiScanResponse');
    assert.equal(select(c, 'pizza'), false, change);
    assert.deepEqual(read(c, 'aiScanResponse'), changed, change);
    assert.deepEqual(read(c, 'receiptList'), []);
  }
});

test('products removed or hidden after opening search cannot be selected', async () => {
  for (const change of [
    "products = products.filter(product => product.id !== 'pizza')",
    "products.find(product => product.id === 'pizza').hidden = true"
  ]) {
    const c = await scanned();
    assert.equal(open(c, 0), true);
    c.run(change);
    const before = read(c, 'aiScanResponse');
    assert.equal(select(c, 'pizza'), false, change);
    assert.deepEqual(read(c, 'aiScanResponse'), before);
    assert.deepEqual(read(c, 'receiptList'), []);
  }
});

test('duplicate or incomplete catalog barcodes cannot supply false identity evidence', async () => {
  for (const change of [
    "products.push({ id: 'duplicate', name: 'כפילות', barcode: '7290004128432', price: 18.04 })",
    "products.find(product => product.id === 'pizza').barcode = '123'"
  ]) {
    const c = await scanned();
    assert.equal(open(c, 0), true);
    c.run(change);
    const before = read(c, 'aiScanResponse');
    assert.equal(select(c, 'pizza'), false, change);
    assert.deepEqual(read(c, 'aiScanResponse'), before);
    assert.deepEqual(read(c, 'receiptList'), []);
  }
});

test('the no-match fallback opens the existing product editor without needing a physical scan', async () => {
  const c = await scanned();
  assert.equal(open(c, 0), true);
  modalClick(c, 'rowfix-search-new');
  assert.equal(c.node('receiptRowProductSearchModal').classList.contains('hidden'), true);
  assert.equal(c.node('prodTitle').textContent, 'מוצר חדש');
  assert.equal(c.node('prod_name').value, paperRows[0].description);
  assert.equal(c.node('prod_price').value, '18.04');
  assert.equal(c.node('prod_barcode').value, '');
  assert.equal(c.run('scanPurpose'), 'receiving');
  assert.deepEqual(read(c, 'receiptList'), []);
  assert.equal(rowAt(c, 0).__tnuvaProductId, null);
});
