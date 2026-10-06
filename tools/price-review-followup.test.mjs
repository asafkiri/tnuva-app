import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime } from './receipt-scan-harness.mjs';

// Synthetic document reproducing the two independent blockers: a price-assisted
// identity and an unconfigured starred promotion. No private backup is embedded.
const products = [
  { id: 'gil', name: 'גיל מהדרין 200 מ"ל', barcode: '7290004125417', price: 1.29 },
  { id: 'soy', name: 'משקה סויה', barcode: '7290000000008', price: 7.32 },
  { id: 'oat', name: 'שיבולת שועל', barcode: '7290000000015', price: 8.82 },
  { id: 'hazelnut', name: 'שיבולת שועל אגוזי לוז', barcode: '7290110327514', price: 8.82 },
  { id: 'feta5', name: 'בולגרית 5%', barcode: '7290004120634', price: 18.42 },
  { id: 'feta24', name: 'בולגרית 24%', barcode: '7290004120610', price: 18.42 }
];
const qty = [72, 8, 4, 4, 4, 4];
const rows = products.map((p, i) => ({ section: 'items', sourcePage: 1, lineNumber: i + 1,
  code: i === 0 ? '4125471' : p.barcode.slice(-8).replace(/^0+/, ''), description: p.name,
  quantity: qty[i], unitPriceExVat: p.price, lineTotalExVat: Math.round(qty[i] * p.price * 100) / 100,
  promoStar: i > 0, confidence: .9 }));
const gross = Math.round(rows.reduce((n, r) => n + r.lineTotalExVat, 0) * 100) / 100;
const fixture = { products, promos: [{ id: 'known', name: 'מבצע ידוע', pct: 15, start: '2026-10-01', end: '2026-10-31',
  minQty: 1, minUnit: 'unit', type: 'receipt', productIds: ['soy', 'oat', 'feta5', 'feta24'] }], items: [],
  paper: { ok: true, serviceVersion: 16, model: 'gpt-5.6-terra', requestId: 'price-help-fixture',
    consensus: { attempted: true, reads: 2, completedReads: 2, agreed: false, escalated: true,
      model: 'gpt-5.6-luna', escalationModel: 'gpt-5.6-terra', disputedRows: [
        { noteIndex: 0, rowIndex: 4, lineNumber: 5, code: rows[4].code,
          fields: [{ field: 'quantity', selected: 4, other: 6 }] }] },
    scan: { warnings: [], documents: [{ noteIndex: 0, docDate: null, docType: 'invoice', pageCount: 1,
      rows, confidence: .9, itemsSectionTotalExVat: gross, itemsPrintedLines: rows.length, printedLines: rows.length,
      promoDiscountExVat: 41.46, documentDiscountExVat: 41.46, subtotalExVat: gross - 41.46,
      netToChargeExVat: gross - 41.46, warnings: [] }] } } };

async function scan() {
  const c = runtime('tnuva', { data: structuredClone(fixture) });
  c.run(`todayStr = () => '2026-10-06'; currentView='receiving'; mainMode='receiving';
    refreshScanHost=()=>{};
    aiScanDocuments=[{noteIndex:0,amount:null,units:null,lines:null,
      pages:[{dataUrl:'data:image/jpeg;base64,Zml4dHVyZQ==',orientationConfirmed:true}]}];`);
  await c.run('tnuvaStartPaperScan()');
  c.click('rowfix-confirm', null, {doc:'0', row:'4'});
  return c;
}
const read = (c, expr) => JSON.parse(c.run(`JSON.stringify(${expr})`));
const audit = c => read(c, 'receiptPriceAudit()');
const view = c => c.run('receiptPriceAuditHtml()');
const raw = c => c.run('JSON.stringify(aiScanResponse.scan.documents[0].__tnuvaPaper)');
function confirmIdentity(c) { c.click('rowfix-pick', null, { doc:'0', row:'0', product:'gil' }); }
function editor(c) { c.click('price-add-promo', null, { doc:'0', row:'3' }); }
function fill(c, pct = 15) {
  c.run(`$('promoName').value='מבצע אגוזי לוז'; $('promoPct').value='${pct}';
    $('promoStart').value='2026-10-06'; $('promoEnd').value='2026-10-06'; $('promoMin').value='1';`);
}

test('a hidden repaired identity becomes an actionable blocker without discarding prior approvals', async () => {
  const c = await scan(), a = audit(c);
  assert.equal(read(c, 'receiptRowActions().decided'), 1);
  assert.deepEqual(read(c, 'receiptRowActions().unidentified.map(x=>x.row.line)'), [1]);
  assert.equal(a.documents[0].knownSummaryDiscount, 36.17);
  assert.equal(a.documents[0].summaryRemainder, 5.29);
  assert.equal(a.rows.filter(r => r.basePriceCheckable && !r.printedVsCatalog.off).length, 5);
  const html = view(c);
  assert.match(html, /זה גיל מהדרין 200 מ&quot;ל — אשר זיהוי/);
  assert.match(html, /5\/6 מחירי בסיס תואמים/);
  assert.doesNotMatch(html, /6\/6 לא נבדקו|התאריך לא נקרא|הבדיקה מניחה/);
  assert.match(html, /הנחה שעדיין צריך להסביר: ₪5.29/);
  assert.match(html, /data-role="price-add-promo" data-doc="0" data-row="3"/);
  assert.match(html, /<details data-price-date><summary/);
});

test('identity confirmation alone does not invent the missing promotion or change received goods', async () => {
  const c = await scan(), before = raw(c), counted = c.run('JSON.stringify(receiptList)');
  confirmIdentity(c);
  assert.equal(audit(c).complete, false);
  assert.equal(read(c, 'receiptRowActions().total'), 0);
  assert.equal(audit(c).documents[0].summaryPending, true);
  assert.equal(audit(c).documents[0].summaryRemainder, 5.29);
  assert.match(view(c), /6\/6 מחירי בסיס תואמים/);
  assert.equal(raw(c), before);
  assert.equal(c.run('JSON.stringify(receiptList)'), counted);
  assert.equal(c.writes.length, 0);
  assert.doesNotMatch(c.run('receiptPriceAuditHtml(null,{actions:false})'), /data-role="price-add-promo"/);
});

test('missing promo opens a reviewable proposal and cancel returns to intake without saving', async () => {
  const c = await scan(); confirmIdentity(c); editor(c);
  const draft = read(c, 'promoEdit');
  assert.equal(c.run('currentView'), 'promoEdit');
  assert.deepEqual(draft.productIds, ['hazelnut']);
  assert.equal(draft.pct, 15);
  assert.equal(draft.start, '2026-10-06');
  assert.equal(draft.end, '2026-10-06');
  assert.match(draft.receiptNotice, /המוצע.*חושב.*בדוק מול דף המבצעים/);
  assert.equal(c.writes.length, 0);
  c.click('pe-cancel');
  assert.equal(c.run('currentView'), 'receiving');
  assert.equal(c.run('promos.length'), 1);
  assert.equal(audit(c).complete, false);
});

test('saving the reviewed promo resolves the audit, preserves approvals and survives draft restoration', async () => {
  const c = await scan(), before = raw(c), counted = c.run('JSON.stringify(receiptList)');
  // v128 approval format is supported without asking the same paper question again.
  c.run("for(const d of Object.values(receiptRowDecisions)){delete d.stamp.quantity;delete d.stamp.total;}");
  confirmIdentity(c); editor(c); fill(c);
  await c.run('savePromoEntity()');
  assert.equal(c.writes.length, 1);
  assert.equal(c.writes[0].data.pct, 15);
  assert.deepEqual(c.writes[0].data.productIds, ['hazelnut']);
  assert.equal(c.run('currentView'), 'receiving');
  assert.equal(audit(c).complete, true);
  assert.ok(audit(c).rows.every(r => r.result === 'match'));
  assert.equal(read(c, 'receiptRowActions().decided'), 1);
  assert.equal(read(c, 'receiptRowActions().total'), 0);
  assert.equal(raw(c), before);
  assert.equal(c.run('JSON.stringify(receiptList)'), counted);
  assert.match(view(c), /המחירים שנבדקו תואמים/);
  c.run('saveReceiptDraft()');
  const restored = runtime('tnuva', {storage:c.storage,data:{...structuredClone(fixture),promos:read(c,'promos')}});
  restored.run("todayStr=()=> '2026-10-06';restoreReceiptDraft();");
  assert.equal(audit(restored).complete, true);
  assert.equal(read(restored, 'receiptRowActions().decided'), 1);
  assert.equal(restored.requests.length, 0);
  assert.equal(c.requests.filter(r => r.url.endsWith('/scan')).length, 1);
});

test('failed promo save stays reviewable and does not mark the price audit complete', async () => {
  const c = await scan(); confirmIdentity(c); editor(c); fill(c);
  c.run('runCloudTask=async()=>false');
  await c.run('savePromoEntity()');
  assert.equal(c.run('currentView'), 'promoEdit');
  assert.equal(c.run('promoEdit.returnView'), 'receiving');
  assert.equal(c.run('promos.length'), 1);
  assert.equal(audit(c).complete, false);
  c.click('pe-cancel');
  assert.equal(c.run('currentView'), 'receiving');
});

test('fresh paper quantity changes invalidate a row approval while promotion allocation alone does not', async () => {
  const c = await scan();
  assert.equal(read(c,'receiptRowActions().decided'), 1);
  c.run('aiScanResponse.scan.documents[0].__tnuvaPaper.rows[4].quantity=5');
  assert.equal(read(c,'receiptRowActions().decided'), 0);
});

test('an obsolete missing-promo button cannot open or create a duplicate promo', async () => {
  const c = await scan(); confirmIdentity(c);
  c.run("promos[0].productIds.push('hazelnut')");
  assert.equal(c.run('receiptOpenPricePromo(0,3)'), false);
  assert.equal(c.run('currentView'), 'receiving');
  assert.equal(c.writes.length, 0);
});
