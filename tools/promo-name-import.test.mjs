import test from 'node:test';
import assert from 'node:assert/strict';
import * as harness from './receipt-scan-harness.mjs';

const product = (id, name, price = 18.42) => ({ id, name, price, barcode: '' });
const cheese = product('cheese', 'בולגרית 5% 250 גרם');
const parts = (name = 'בולגרית 5%', list = '18.42', pct = '15%', promo = '15.66', code = '############') =>
  [{ x: 84, s: '₪ ' + promo }, { x: 139, s: pct }, { x: 196, s: list }, { x: 300, s: name }, { x: 474, s: code }];
const source = (overrides = {}) => ({ sourceLine: 1, page: 1, bc: '', colors: ['blue'], parts: parts(), missingBarcode: true, ...overrides });
const row = (overrides = {}) => ({ barcode: null, name: 'בולגרית 5%', listPrice: 18.42, discountPct: 15, promoPrice: 15.66,
  sourceLine: 1, productId: 'cheese', candidateProductIds: ['cheese'], matchConfidence: .99,
  noteKind: 'none', noteText: null, ...overrides });
function runtime(products = [cheese]) {
  const c = harness.runtime('tnuva', { data: { products, promos: [], items: [] } });
  c.run("currentView='promos'; renderPromos=()=>{};");
  return c;
}
function verify(c, rows = [row()], sources = [source()]) {
  c.context.promoAiFixture = { validFrom: '2026-10-01', validTo: '2026-10-31', rows, warnings: [] };
  c.context.promoParsedFixture = { validFrom: '2026-10-01', validTo: '2026-10-31', rows: [], sourceRows: sources, colorsByBarcode: {} };
  return c.run('tnvVerifyAiSheet(promoAiFixture, promoParsedFixture)');
}
const json = value => JSON.parse(JSON.stringify(value));

test('barcode-free rows survive extraction, including blank cells and shortened codes', () => {
  const c = runtime();
  for (const code of ['############', '', '729001427620']) {
    c.context.partsFixture = parts('משקה סויה', '7.67', '15%', '6.52', code);
    const parsed = c.run('tnvParsePromoRow(partsFixture)');
    assert.equal(parsed.missingBarcode, true);
    assert.equal(parsed.bc, '');
  }
});

test('the PDF parser keeps names on separate baselines and attaches only the closest price', async () => {
  const c = runtime();
  const textLine = (y, values) => values.map(p => ({ str: p.s, transform: [1, 0, 0, 1, p.x, y] }));
  const anchor = parts('', '14', '15%', '', '############').filter(p => p.s.trim() !== '₪');
  c.context.pdfFixture = { OPS: {}, getDocument: () => ({ promise: Promise.resolve({ numPages: 1,
    getPage: async () => ({ getOperatorList: async () => ({ fnArray: [], argsArray: [] }),
      getTextContent: async () => ({ items: [
        ...textLine(800, [{ x: 200, s: 'אוקטובר 2026' }]),
        ...textLine(708, [{ x: 84, s: '₪ 11.90' }, { x: 300, s: 'יוגורט 3%' }]),
        ...textLine(700, anchor),
        ...textLine(677, [{ x: 84, s: '₪ 9.00' }]),
        ...textLine(670, parts('מוצר שני', '10', '10%', '', '############').filter(p => p.s.trim() !== '₪'))
      ] }) }) }) }) };
  const parsed = await c.run('tnvParsePromoSheet(pdfFixture,new Uint8Array(),()=>null)');
  assert.equal(parsed.needsCatalog, true);
  assert.equal(parsed.sourceRows.length, 2);
  assert.equal(parsed.validFrom, '2026-10-01');
  c.context.sourceFixture = parsed.sourceRows[0];
  assert.equal(c.run('tnvPromoSourceHasNumbers(sourceFixture,14,15,11.9)'), true);
  assert.equal(c.run('tnvPromoSourceHasNumbers(sourceFixture,10,10,9)'), false);
});

test('a clear name match uses only an existing product id and retains grouping colors', () => {
  const c = runtime();
  const result = verify(c);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].productId, 'cheese');
  assert.equal(result.rows[0].bc, '', 'no barcode is fabricated');
  assert.deepEqual(json(result.rows[0].colors), ['blue']);
  assert.equal(result.rows[0].minUnits, 1);
  c.context.rowsFixture = result.rows;
  assert.equal(c.run('tnvBuildGroups(rowsFixture)[0].products[0].productId'), 'cheese');
});

test('different sizes with the same printed name remain a choice even at the same price', () => {
  const c = runtime([cheese, product('large', 'בולגרית 5% 500 גרם')]);
  const result = verify(c);
  assert.equal(result.rows[0].productId, null);
  assert.deepEqual(json(result.rows[0].candidateProductIds), ['cheese', 'large']);
});

test('a source fat percentage or volume cannot be overridden by the AI name', () => {
  const c = runtime([product('cheese', 'בולגרית 16% 250 גרם')]);
  assert.equal(verify(c, [row({ name: 'בולגרית 16%' })]).rows[0].productId, null);
  const drinks = runtime([product('cheese', 'משקה סויה 1 ליטר', 18.42)]);
  assert.equal(verify(drinks, [row({ name: 'משקה סויה 1 ליטר' })], [source({ parts: parts('משקה סויה 500 מל') })]).rows[0].productId, null);
  assert.equal(drinks.run("tnvPromoIdentityConflict('משקה סויה 1000 מל','משקה סויה 1 ליטר')"), false);
});

test('unknown ids, low certainty and multiple AI candidates never auto-select', () => {
  for (const changes of [
    { productId: 'ghost', candidateProductIds: ['ghost'] },
    { matchConfidence: .4 },
    { candidateProductIds: ['cheese', 'other'] }
  ]) {
    const c = runtime([cheese, product('other', 'מוצר אחר')]);
    const result = verify(c, [row(changes)]);
    assert.equal(result.rows[0].productId, null);
  }
});

test('numbers must match the original columns even if invented numbers balance', () => {
  const c = runtime();
  for (const changes of [
    { listPrice: 20, discountPct: 15, promoPrice: 17 },
    { discountPct: 10, promoPrice: 16.58 },
    { listPrice: null },
    { sourceLine: 99 },
    { barcode: '7290000000008' }
  ]) assert.equal(verify(c, [row(changes)]).ok, false);
});

test('duplicate AI rows cannot count a product twice', () => {
  const c = runtime();
  const result = verify(c, [row(), row()]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rejected.length, 1);
});

test('manual selection and explicit skip finish at summary without creating a product', async () => {
  const c = runtime([cheese, product('large', 'בולגרית 5% 500 גרם', 20)]);
  const verified = verify(c, [row(), row({ sourceLine: 2 })], [source(), source({ sourceLine: 2 })]);
  c.context.importRows = verified.rows;
  c.run(`const sheet={validFrom:'2026-10-01',validTo:'2026-10-31',rows:importRows,groups:tnvBuildGroups(importRows)};
    promoImport={stage:'wizard',sheet,missing:promoImportMatch(sheet),unresolved:[],source:'ai'};
    promoImportOpenNextMissing();`);
  assert.equal(c.run('promoImport.stage'), 'matching');
  assert.match(c.run('promoImportHtml()'), /בחר מוצר למבצע/);
  assert.equal(c.run('JSON.stringify(testWrites)'), '[]');
  c.run("promoImportResolveName('large')");
  assert.equal(c.run('promoImport.stage'), 'matching');
  c.run('promoImportResolveName(null)');
  assert.equal(c.run('promoImport.stage'), 'summary');
  assert.equal(c.run('promoImport.sheet.groups[0].unitPriceExVat'), 20, 'regroup using the selected catalog price');
  assert.match(c.run('promoImportHtml()'), /מוצרים שדילגת עליהם/);
  assert.equal(c.run('JSON.stringify(testWrites)'), '[]');
  await c.run('promoImportCreateAll()');
  assert.equal(c.writes.length, 1);
  assert.deepEqual(json(c.writes[0].data.productIds), ['large']);
  assert.equal(c.writes[0].data.pct, 15);
  assert.equal(c.writes[0].data.minQty, 1);
  assert.equal(c.writes[0].data.start, '2026-10-01');
  assert.equal(c.writes[0].data.end, '2026-10-31');
});

test('valid printed barcodes still follow the existing local importer', () => {
  const c = runtime([{ ...cheese, barcode: '7290000000008' }]);
  c.context.partsFixture = parts('בולגרית 5%', '18.42', '15.00%', '15.66', '7290000000008');
  const parsed = c.run('tnvParsePromoRow(partsFixture)');
  assert.equal(parsed.bc, '7290000000008');
  c.context.sheetFixture = { groups: [{ products: [{ barcode: parsed.bc, name: parsed.name, listPrice: parsed.list }] }] };
  assert.deepEqual(json(c.run('promoImportMatch(sheetFixture)')), []);
  assert.deepEqual(json(c.context.sheetFixture.groups[0].productIds), ['cheese']);
});

test('the importer sends names and prices, and tells the user if the server needs updating', async () => {
  const c = runtime([{ ...cheese, barcode: '7290000000008' }]);
  c.run(`aiFetchWithRetry=async(url,options)=>{testRequests=JSON.parse(options.body);return {ok:true,json:async()=>({ok:true,promoCatalogMatching:true,sheet:{rows:[]}})}};`);
  await c.run("promoImportAiRead({title:'אוקטובר 2026',lines:[{page:1,parts:[[474,'####']]}],needsCatalog:true})");
  const catalog = json(c.run('testRequests.sheet.catalog'));
  assert.equal(catalog[0].id, 'cheese');
  assert.equal(catalog[0].name, cheese.name);
  assert.equal(catalog[0].price, 18.42);
  assert.equal(Object.hasOwn(catalog[0], 'barcode'), false);
  c.run('aiFetchWithRetry=async()=>({ok:true,json:async()=>({ok:true,sheet:{rows:[]}})})');
  await assert.rejects(c.run("promoImportAiRead({title:'אוקטובר 2026',lines:[{}],needsCatalog:true})"), /גרסה 15/);
});

test('a barcode-free PDF reaches summary and writes promotions only after approval', async () => {
  const c = runtime();
  c.context.promoParsedFixture = { title: 'אוקטובר 2026', validFrom: '2026-10-01', validTo: '2026-10-31',
    needsCatalog: true, rows: [], problems: ['missing barcode'], unread: [{ bc: '', sourceLine: 1 }], notes: [],
    lines: [{ page: 1, parts: parts().map(p => [p.x, p.s]) }], sourceRows: [source()], colorsByBarcode: {} };
  c.context.promoAiFixture = { validFrom: '2026-10-01', validTo: '2026-10-31', rows: [row()], warnings: [] };
  c.run(`tnvLoadPdfjs=async()=>({}); promoImportFileArrayBuffer=async()=>[];
    tnvParsePromoSheet=async()=>promoParsedFixture; promoImportAiRead=async()=>promoAiFixture;`);
  await c.run("promoImportStart([{name:'promo.pdf',type:'application/pdf',size:1000}])");
  assert.equal(c.run('promoImport.stage'), 'summary');
  assert.equal(c.run('promoImport.source'), 'ai');
  assert.deepEqual(json(c.run('promoImport.unresolved')), []);
  assert.deepEqual(json(c.run('promoImport.sheet.groups[0].productIds')), ['cheese']);
  assert.equal(c.writes.length, 0);
  await c.run('promoImportCreateAll()');
  assert.equal(c.writes.length, 1);
  assert.deepEqual(json(c.writes[0].data.productIds), ['cheese']);
});

test('an older server can still reread printed barcodes without duplicating local rows', async () => {
  const c = runtime([{ ...cheese, barcode: '7290000000008' }]);
  c.context.promoParsedFixture = { title: 'אוקטובר 2026', validFrom: '2026-10-01', validTo: '2026-10-31', needsCatalog: false,
    rows: [{ bc: '7290000000008', rowKey: 'line:1', sourceLine: 1, name: cheese.name, list: 18.42, pct: 15, promo: 15.66, colors: [], gp: 18.42 }],
    problems: ['note'], unread: [], notes: [], lines: [{}],
    sourceRows: [source({ bc: '7290000000008', missingBarcode: false })], colorsByBarcode: {} };
  c.context.promoAiFixture = { validFrom: '2026-10-01', validTo: '2026-10-31',
    rows: [row({ barcode: '7290000000008', sourceLine: null })], warnings: [] };
  c.run(`tnvLoadPdfjs=async()=>({}); promoImportFileArrayBuffer=async()=>[];
    tnvParsePromoSheet=async()=>promoParsedFixture; promoImportAiRead=async()=>promoAiFixture;`);
  await c.run("promoImportStart([{name:'promo.pdf',type:'application/pdf',size:1000}])");
  assert.equal(c.run('promoImport.stage'), 'summary');
  assert.equal(c.run('promoImport.sheet.rows.length'), 1);
});
