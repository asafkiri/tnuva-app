// v113: Tnuva rounds every promo discount per paper row before it prints the
// summary "סד הנחה בגין מבצעים"; the app aggregates per product and rounds once.
// These tests drive the whole module (scan -> evaluation -> apply -> save) with
// papers built the way Tnuva builds them, from the user's real catalog values.
import test from 'node:test';
import assert from 'node:assert/strict';
import {runtime} from './receipt-scan-harness.mjs';

const cents = n => Math.round(n * 100);
const json = (r, expression) => JSON.parse(r.run('JSON.stringify(' + expression + ')'));
// [barcode, name, catalog price, paper qty] — the user's real 30-row delivery (23/9).
const REAL = [
 ['7290004131074','חלב 3% ועדת מהדרין בקרטון 1 ליטר',5.36,160],['7290000056845','חלב 3% 1.5 ליטר ועדת מהדרין 1.5 ליטר',8.04,12],
 ['7290110325619','משקה שיבולת שועל 1 ליטר',8.82,12],['7290110327514','משקה שיבולת שועל בטעם אגוזי לוז 1 ליטר',8.82,8],
 ['7290116936291','חלב תנובה 3% שומן 2 ליטר',10.72,18],['7290000043890','ריוויון תנובה 1.5% שומן 1 ל',9.45,12],
 ['7290000044248','ריוויון תנובה 1.5% שומן 500 מל',5.46,12],['7290110321277',"קוטג' בקטנה 100 גרם",2.02,20],
 ['7290000044880','באדי תות 500 גרם',7.26,6],['7290110322014','טופו טבעי 300 גרם',8.88,5],
 ['7290116936123','יוגורט חלבון יופלה GO דובדבן',4.39,6],['7290000040042','יופלה תות 3% 150 גרם',3.69,12],
 ['7290000040066','יופלה דובדבן 3% 150 גרם',3.69,12],['7290004130916','יופלה פירות יער 3% 150 גרם',3.69,12],
 ['7290004124205','דיאט יופלה תות 150 גרם',3.69,12],['7290004126759','דיאט יופלה פירות יער 150 גרם',3.69,12],
 ['7290004120108','דיאט יופלה דובדבן 150 גרם',3.69,12],['7290000051376','דיאט יופלה אננס 150 גרם',3.69,12],
 ['7290004122195','גוש חלב פרוס מהדרין 200 גרם',11.37,9],['7290000046327','גלבוע 22% שומן 200 גרם',10.55,9],
 ['7290000057118','עמק סמי מעדנייה כשרות מהדרין 400 גרם',19.6,9],['7290110320850','פתיתי עמק 28% שומן 200 גרם',12.23,10],
 ['7290004125400','אשל מהדרין 200 מ"ל',1.41,240],['7290000048185','גבינה לבנה תנובה 5% 250 גרם',4.19,24],
 ['7290004127800','גבינה לבנה תנובה 5% 500 גרם',8.38,12],['7290004127817','גבינה לבנה תנובה 9% 500 גרם',8.38,12],
 ['7290004127329',"קוטג' ועדת מהדרין 5% 250 גרם",4.6,24],['59259','ארגז חלב ירוק',15.1,13],
 ['59549','ארגז גבינה תל יוסף',22,2],['59631','ארגז פלסטיק 30/40 אפור',13.5,9]];
const EXTRA = [['7290016682038','מיץ תפוז 400 מי"ל',5.75],['7290016682359','שמוטי 2 ליטר',18.5],['7290110328627','יוגורט גו סמיך 0% בננה קרמל 200 גרם',4.39]];
const MILK = '7290004131074', OAT = '7290110325619', HAZEL = '7290110327514', EMEK = '7290000057118', OJ = '7290016682038', SHMUTI = '7290016682359', YOG = '7290110328627';
const products = [...REAL, ...EXTRA].map(([barcode, name, price]) => ({id: 'barcode_' + barcode, name, barcode, price, listPrice: price, discountPct: 0, discountSet: true}));
const price = barcode => products.find(p => p.barcode === barcode).price;
const promo = (id, pct, barcodes) => ({id, type: 'receipt', name: id, pct, minQty: 1, minUnit: 'unit', cartonSize: null,
  start: '2020-01-01', end: '2099-12-31', productIds: barcodes.map(b => 'barcode_' + b)});
const promos = [promo('oat', 18, [OAT, HAZEL]), promo('emek', 7, [EMEK]), promo('juice', 15, [OJ]), promo('shmuti', 15, [SHMUTI]), promo('yogurt', 20, [YOG])];
const pctOf = barcode => (promos.find(p => p.productIds.includes('barcode_' + barcode)) || {}).pct || 0;
// Per-row discount in agorot, computed at full precision and rounded per row.
// tie: how Tnuva settles an exact half agora ('even' is what the history shows).
function rowDiscount(unitCents, qty, pct, tie) {
  const n = unitCents * qty * pct, r = n % 100, base = (n - r) / 100;
  if (r !== 50) return r > 50 ? base + 1 : base;
  return tie === 'up' ? base + 1 : tie === 'down' ? base : base + (base % 2);
}
// lines: [barcode, qty, printedUnitPrice?]; notGiven: barcodes whose promo the paper did not give.
function paperDoc(noteIndex, lines, {tie = 'even', notGiven = [], extraCents = 0} = {}) {
  let items = 0, disc = extraCents;
  const rows = lines.map(([barcode, qty, unit = price(barcode)], i) => {
    const unitCents = Math.round(unit * 100), gross = unitCents * qty; items += gross;
    const pct = pctOf(barcode);
    if (pct && !notGiven.includes(barcode)) disc += rowDiscount(unitCents, qty, pct, tie);
    return {section: 'items', sourcePage: 1, lineNumber: i + 1, code: barcode.slice(-8).replace(/^0+/, ''), description: products.find(p => p.barcode === barcode).name,
      quantity: qty, unitPriceExVat: unit, lineTotalExVat: gross / 100, promoStar: !!pct, confidence: .95};
  });
  const sub = items - disc;
  return {noteIndex, docNumber: 'T' + noteIndex, docType: 'invoice', docDate: '23/09/2026', pageCount: 1, vatPct: 18, rows, confidence: .95,
    itemsSectionTotalExVat: items / 100, promoDiscountExVat: disc / 100, itemsPrintedLines: rows.length, returnsSectionTotalExVat: null, returnsPrintedLines: null,
    subtotalExVat: sub / 100, netToChargeExVat: sub / 100, vatAmount: null, totalInclVat: null, warnings: []};
}
// received: {barcode: qty} overrides of the physical count (default = paper qty).
async function receive(docsLines, options = {}, received = {}) {
  const docs = docsLines.map((lines, i) => paperDoc(i, lines, options));
  const qty = new Map();
  docsLines.flat().forEach(([barcode, q]) => qty.set(barcode, (qty.get(barcode) || 0) + q));
  const items = [...qty].map(([barcode, q]) => ({productId: 'barcode_' + barcode, name: products.find(p => p.barcode === barcode).name, barcode,
    qty: barcode in received ? received[barcode] : q}));
  const data = {products, promos, items, paper: {ok: true, serviceVersion: 13, model: 'fixture', requestId: 'promo-rounding', scan: {warnings: [], documents: docs}}};
  const r = runtime('tnuva', {data});
  r.run("openScanner=()=>{}; closeScanner=()=>{}; scanBeep=()=>{}; buzz=()=>{}; refreshScanHost=()=>{}; showConfirm=(t,x,l,fn)=>fn();");
  await r.scan(docs.length);
  // Photo-first: the anchors come from the paper itself, as in the user's flow.
  assert.equal(cents(r.run('receiptNoteTotal')), docs.reduce((sum, d) => sum + cents(d.subtotalExVat), 0));
  r.run('openReconcile()');
  r.docs = docs;
  return r;
}
const evaluation = r => json(r, `(e => ({valid: e.valid, errors: e.errors, printed: e.promoDiscountPrinted, rebuilt: e.promoDiscountRebuilt, residual: e.promoDiscountResidual,
  closure: e.closure.ok, gap: e.promoRoundingGap, findings: e.findings.filter(f => f.type !== 'printed_promo' || !f.productId).map(f => ({type: f.type, productId: f.productId || null, amount: f.amount}))}))(aiScanEvaluation)`);
const promoMissing = ev => ev.findings.filter(f => f.type === 'promo_missing').map(f => f.productId);
// Close through the ordinary buttons, then persist exactly as the summary screen does.
async function applyAndSave(r) {
  if (!r.node('app').innerHTML.includes('data-role="ai-apply"')) r.click('ai-confirm-findings');
  r.click('ai-apply');
  assert.equal(r.run('aiScanError'), '', 'apply rolled back');
  assert.ok(r.run('!!pendingReceipt'), 'no pending receipt');
  const pending = json(r, 'pendingReceipt');
  r.run('flushReceiptDraftToCloud=async()=>{receiptSync.dirty=false;return true;}');
  await r.run('confirmReceipt()');
  const saved = r.writes.find(w => w.path?.includes('receipts'))?.data;
  assert.ok(saved, 'receipt was not written');
  return {pending, saved};
}
const realLines = () => REAL.map(([barcode, , , qty]) => [barcode, qty]);

test('the user\'s real delivery: all promos given, only the 32-milk shortage, apply and save close', async () => {
  const r = await receive([realLines()], {}, {[MILK]: 128});
  const ev = evaluation(r);
  assert.equal(r.docs[0].promoDiscountExVat, 44.1);
  assert.equal(ev.valid, true, ev.errors.join(';'));
  assert.deepEqual(ev.findings.filter(f => f.type !== 'document_discount'), [{type: 'shortage', productId: 'barcode_' + MILK}, {type: 'printed_promo', productId: null, amount: 44.1}]);
  assert.equal(ev.printed, 44.1); assert.equal(ev.rebuilt, 44.1); assert.equal(ev.residual, 0);
  assert.equal(r.run('aiScanEvaluation.closure.expectedAmountDelta'), 171.52);
  const {pending, saved} = await applyAndSave(r);
  assert.equal(pending.roundingAdjustment, 0); assert.equal(pending.unresolvedAmountGap, 0);
  assert.equal(pending.ex, 3359.66); assert.equal(pending.supplierCreditClaim, null);
  assert.equal(saved.totalExVat, 3359.66); assert.equal(saved.noteTotalInc, 3531.18);
});

for (const tie of ['up', 'down', 'even']) test('exact half-agora promo rows (' + tie + ') are not a missing promo and close to the paper', async () => {
  // 6 × 5.75 × 15% = 5.175 and 9 × 18.50 × 15% = 24.975
  const r = await receive([[[MILK, 10], [OJ, 6], [SHMUTI, 9]]], {tie});
  const ev = evaluation(r), printed = r.docs[0].promoDiscountExVat;
  assert.equal(printed, {up: 30.16, down: 30.14, even: 30.16}[tie]);
  assert.equal(ev.valid, true, ev.errors.join(';'));
  assert.deepEqual(promoMissing(ev), []);
  assert.equal(ev.rebuilt, printed); assert.equal(ev.residual, 0);
  const {pending, saved} = await applyAndSave(r);
  const appLines = cents(pending.grossEx);
  assert.equal(cents(pending.roundingAdjustment), cents(r.docs[0].subtotalExVat) - appLines);
  assert.ok(Math.abs(pending.roundingAdjustment) <= 0.02);
  assert.equal(pending.status, 'ok'); assert.equal(pending.unresolvedAmountGap, 0);
  assert.equal(saved.totalExVat, r.docs[0].subtotalExVat); assert.equal(saved.roundingAdjustment, pending.roundingAdjustment);
});

for (const [label, docs] of [['two rows of one invoice', [[[MILK, 10], [OAT, 6], [OAT, 6]]]], ['two invoices', [[[MILK, 10], [OAT, 6]], [[MILK, 10], [OAT, 6]]]]]) {
  test('the same promo product on ' + label + ' is rounded per row, and the save records the agora', async () => {
    // Tnuva: 9.5256 -> 9.53 twice = 19.06; the app: 12 × 7.2324 = 86.79 against paper 86.78.
    const r = await receive(docs);
    const ev = evaluation(r);
    assert.equal(ev.printed, 19.06);
    assert.equal(ev.valid, true, ev.errors.join(';'));
    assert.deepEqual(promoMissing(ev), []);
    assert.deepEqual(ev.gap, {cents: -1, rows: 2});
    const {pending, saved} = await applyAndSave(r);
    assert.equal(pending.roundingAdjustment, -0.01);
    assert.equal(pending.status, 'ok'); assert.equal(pending.unresolvedAmountGap, 0);
    const paper = r.docs.reduce((sum, d) => sum + cents(d.subtotalExVat), 0) / 100;
    assert.equal(pending.ex, paper); assert.equal(saved.totalExVat, paper); assert.equal(saved.roundingAdjustment, -0.01);
  });
}

test('the rounding allowance never absorbs a shortage and is dropped on any manual edit', async () => {
  const r = await receive([[[MILK, 10], [OAT, 6], [OAT, 6]]], {}, {[MILK]: 7});
  const ev = evaluation(r);
  assert.equal(ev.valid, true, ev.errors.join(';'));
  assert.deepEqual(ev.findings.filter(f => f.type === 'shortage').map(f => f.productId), ['barcode_' + MILK]);
  r.click('ai-confirm-findings'); r.run('saveReconciledReceipt=()=>{}'); r.click('ai-apply');
  assert.equal(r.run('aiScanError'), '');
  assert.deepEqual(json(r, 'reconcilePromoRoundingGap'), {cents: -1, rows: 2});
  assert.equal(r.run('reconcileMoneyBalanced()'), true);
  r.run(`reconcileSetPriceLive('barcode_${OAT}', String(reconcileData.find(l => l.productId === 'barcode_${OAT}').price))`);
  assert.equal(r.run('reconcilePromoRoundingGap'), null);
  assert.equal(r.run('reconcileMoneyBalanced()'), false);
});

for (const [label, missing] of [['noEmek', EMEK], ['noOat1', OAT], ['noOat2', HAZEL]]) {
  test('partial promo discount (' + label + ') flags only the promo that was not given, and closes', async () => {
    const r = await receive([realLines()], {notGiven: [missing]}, {[MILK]: 128});
    const ev = evaluation(r);
    assert.equal(ev.valid, true, ev.errors.join(';'));
    assert.equal(ev.closure, true);
    assert.deepEqual(promoMissing(ev), ['barcode_' + missing]);
    const expectedMissing = {[EMEK]: 12.35, [OAT]: 19.05, [HAZEL]: 12.7}[missing];
    assert.equal(ev.findings.find(f => f.type === 'promo_missing').amount, expectedMissing);
    assert.equal(ev.findings.find(f => f.type === 'printed_promo').amount, r.docs[0].promoDiscountExVat);
    assert.equal(ev.residual, -expectedMissing);
    const {pending, saved} = await applyAndSave(r);
    assert.equal(pending.status, 'open'); assert.equal(pending.unresolvedAmountGap, 0);
    assert.equal(pending.supplierCreditClaim.amount, expectedMissing);
    assert.deepEqual(pending.supplierCreditClaim.items.map(i => i.productId), ['barcode_' + missing]);
    assert.equal(saved.supplierCreditClaim.amount, expectedMissing);
  });
}

test('partial coverage with a promo product split over two rows accuses nobody: the promo may be missing on one row only', async () => {
  // The oat promo could have been given on one row and not the other; decomposing
  // per product would then blame a same-sum product whose promo did come.
  const r = await receive([[[MILK, 10], [OAT, 6], [OAT, 6], [HAZEL, 8], [EMEK, 9]]], {notGiven: [EMEK]});
  const ev = evaluation(r);
  assert.equal(ev.printed, 31.76);
  assert.equal(ev.valid, false);
  assert.deepEqual(promoMissing(ev), []);
  assert.match(ev.errors.join(';'), /אי אפשר לדעת איזה מבצע לא ירד/);
  r.run('aiApplyInvoiceResult()');
  assert.equal(r.run('!!pendingReceipt'), false);
});

test('a printed discount one agora short with no half-agora rows is a gap, not rounding', async () => {
  const r = await receive([[[MILK, 10], [OAT, 12], [HAZEL, 8], [EMEK, 9]]], {extraCents: -1});
  const ev = evaluation(r);
  assert.equal(ev.printed, 44.09);
  assert.equal(ev.gap, null);
  r.run('aiApplyInvoiceResult()');
  assert.equal(r.run('!!pendingReceipt'), false);
});

test('a partial discount that more than one promo set explains accuses nobody and stays locked', async () => {
  // Oat 8 and hazelnut 8 are worth the same 12.70: which one was not given is unknowable.
  const r = await receive([[[MILK, 10], [OAT, 8], [HAZEL, 8], [EMEK, 9]]], {notGiven: [OAT]});
  const ev = evaluation(r);
  assert.equal(ev.valid, false);
  assert.deepEqual(promoMissing(ev), []);
  assert.equal(ev.errors.length, 1, ev.errors.join(';'));
  assert.match(ev.errors[0], /מכסה רק חלק ממבצעי המערכת \(₪37\.75\): חסרים ₪12\.70/);
  assert.match(ev.errors[0], /אי אפשר לדעת איזה מבצע לא ירד/);
  assert.match(ev.errors[0], /כוכבית/);
  r.run('aiApplyInvoiceResult()');
  assert.equal(r.run('!!pendingReceipt'), false);
});

test('no printed promo discount at all: every promo is still flagged, as before', async () => {
  const r = await receive([realLines()], {notGiven: [OAT, HAZEL, EMEK]}, {[MILK]: 128});
  const ev = evaluation(r);
  assert.equal(ev.valid, true, ev.errors.join(';'));
  assert.deepEqual(promoMissing(ev).sort(), ['barcode_' + OAT, 'barcode_' + HAZEL, 'barcode_' + EMEK].sort());
});

test('a discount above the system promos keeps the missing-catalog-promo answer (extra5)', async () => {
  const r = await receive([realLines()], {extraCents: 500}, {[MILK]: 128});
  const ev = evaluation(r);
  assert.equal(ev.valid, false);
  assert.equal(ev.residual, 5);
  assert.ok(ev.findings.some(f => f.type === 'promo_missing_catalog' && f.amount === 5));
  assert.match(ev.errors[0], /^חסר מבצע במאגר: יוגורט חלבון יופלה GO דובדבן 19% \(₪5\.00\)/);
  assert.deepEqual(promoMissing(ev), []);
});

test('the smallest real missing promo (1 yogurt, 4.39 @ 20% = 0.88) among several promo rows is still flagged', async () => {
  const r = await receive([[[MILK, 10], [OAT, 12], [HAZEL, 8], [EMEK, 9], [YOG, 1]]], {notGiven: [YOG]});
  const ev = evaluation(r);
  assert.equal(ev.valid, true, ev.errors.join(';'));
  assert.deepEqual(promoMissing(ev), ['barcode_' + YOG]);
  assert.equal(ev.findings.find(f => f.type === 'promo_missing').amount, 0.88);
  const {pending} = await applyAndSave(r);
  assert.equal(pending.supplierCreditClaim.amount, 0.88);
});

for (const qty of [1, 12]) test('a genuine 1-agora-per-unit price difference on a promo product is not hidden (qty ' + qty + ')', async () => {
  // Tnuva charged 8.83 instead of 8.82 and gave the promo on its own price.
  const r = await receive([[[MILK, 10], [OAT, qty, 8.83]]]);
  const ev = evaluation(r);
  assert.equal(ev.gap, null);
  // The printed discount (18% of 8.83) is not the system promo on 8.82: the
  // rounding tolerance must not call it covered, and the receipt stays locked.
  assert.notEqual(ev.rebuilt, ev.printed);
  assert.ok(ev.findings.some(f => f.productId === 'barcode_' + OAT && ['price', 'promo_missing'].includes(f.type)), JSON.stringify(ev.findings));
  assert.equal(ev.valid, false);
  r.run('aiApplyInvoiceResult()');
  assert.equal(r.run('!!pendingReceipt'), false);
});

// v113 (round 2): the rounding tolerance is given only to promo rows billed at
// the exact catalog price. A 1-2 agora overcharge on a promo product among many
// promo rows used to fit inside rows/2 and was booked as "התאמת עיגול תעודה".
const MANY = [[MILK, 10], [HAZEL, 8], [EMEK, 9], [OJ, 6], [SHMUTI, 9], [YOG, 3]];
const overcharged = (barcode, qty, unit) => [...MANY.filter(([b]) => b !== barcode), [barcode, qty, unit]];
for (const [label, lines] of [
  ['oat 1 @ 8.83 among 7 promo rows', [...MANY, [OAT, 1, 8.83]]],
  ['oat 2 @ 8.83 among 7 promo rows', [...MANY, [OAT, 2, 8.83]]],
  ['oat 3 @ 8.83 among 7 promo rows', [...MANY, [OAT, 3, 8.83]]],
  ['oat 1 @ 8.83 in the real promo set', [[MILK, 10], [OAT, 1, 8.83], [HAZEL, 8], [EMEK, 9]]],
  ['emek 2 @ 19.61', overcharged(EMEK, 2, 19.61)],
  ['shmuti 3 @ 18.51', overcharged(SHMUTI, 3, 18.51)],
  ['shmuti 1 @ 18.52', overcharged(SHMUTI, 1, 18.52)],
  ['yogurt 4 @ 4.40', overcharged(YOG, 4, 4.40)],
]) test('a small overcharge on a promo product among several promo rows is never booked as rounding (' + label + ')', async () => {
  const r = await receive([lines]);
  const ev = evaluation(r);
  assert.equal(ev.gap, null, JSON.stringify(ev.gap));
  r.run('aiApplyInvoiceResult()');
  assert.equal(r.run('reconcilePromoRoundingGap'), null);
  assert.equal(r.run('!!pendingReceipt'), false, 'the overcharge was accepted: ' + JSON.stringify(ev));
});

async function appliedWithAllowance() {
  const r = await receive([[[MILK, 10], [OAT, 6], [OAT, 6]]]);
  r.click('ai-confirm-findings'); r.run('saveReconciledReceipt=()=>{}'); r.click('ai-apply');
  assert.equal(r.run('aiScanError'), '');
  assert.deepEqual(json(r, 'reconcilePromoRoundingGap'), {cents: -1, rows: 2});
  assert.equal(r.run('reconcileMoneyBalanced()'), true);
  return r;
}
for (const [label, edit] of [
  ['typing a paper quantity', `reconcileSetNoteLive('barcode_${MILK}', String(reconcileData.find(l => l.productId === 'barcode_${MILK}').noteQty))`],
  ['stepping a paper quantity', `reconcileStepNote('barcode_${MILK}', 0)`],
  ['reopening the comparison screen', 'openReconcile()'],
  ['a detective solution', `detectiveApplyResolvedResult({solutions: [{components: [{allocations: [{moves: [{productId: 'barcode_${MILK}', delta: 1, unit: 5.36}]}]}]}]}, 0, 'x')`],
]) test('the promo rounding allowance is dropped by ' + label, async () => {
  const r = await appliedWithAllowance();
  r.run(edit);
  assert.equal(r.run('reconcilePromoRoundingGap'), null);
});

test('a rolled-back apply restores the allowance that was there before', async () => {
  const r = await receive([[[MILK, 10], [OAT, 6], [OAT, 6]]]);
  r.click('ai-confirm-findings'); r.run('saveReconciledReceipt=()=>{}');
  r.run('reconcilePromoRoundingGap = {cents: 7, rows: 9}; aiScanEvaluation.promoRoundingGap = {cents: 0, rows: 2}');
  r.click('ai-apply');
  assert.match(r.run('aiScanError'), /ההחלה לא נסגרה/);
  assert.deepEqual(json(r, 'reconcilePromoRoundingGap'), {cents: 7, rows: 9});
});
