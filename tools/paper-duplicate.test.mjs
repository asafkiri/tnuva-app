import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime, fakeCloud } from './receipt-scan-harness.mjs';

// v141: a duplicate paper is recognised by its amount and date, never by the printed
// document number. Amounts and gaps mirror the real history (synthetic ids only).
const saved = (id, date, amount, lines, extra = {}) => ({ id, date, docDate: date, timestamp: Date.parse(date + 'T06:00:00Z'),
  status: 'ok', count: lines, noteParts: [{ amount, lines }], totalExVat: amount, ...extra });

async function receiving({ amount = 2225.29, lines = 18, day = '2026-10-01', history = [], noDoc = false } = {}) {
  const cloud = fakeCloud(), a = runtime('tnuva', { cloud });
  await cloud.tick();
  // One counted unit priced at the paper amount, so the counted goods agree with the paper.
  a.run(`todayStr = () => '${day}'; receipts = ${JSON.stringify(history)};
    products.find(p => p.id === 'milk').price = ${amount};
    receiptEntryMode='manual'; receiptAnchorSource='manual'; receiptOpened=true; receiptNoDoc=${noDoc};
    receiptList=[{productId:'milk',name:'חלב בדיקה',qty:1}];
    receiptNotes=${noDoc ? '[]' : `[{amount:${amount},units:null,lines:${lines}}]`}; recomputeNoteTotal();
    receiptLinesConfirmed=true; saveReceiptDraft();`);
  return { a, cloud };
}
const DUP = 'ייתכן שהתעודה כבר נקלטה';
const dialog = a => a.node('confirmModal').classList.contains('hidden') || a.node('confirmTitle').textContent !== DUP ? null
  : { title: a.node('confirmTitle').textContent, text: a.node('confirmMsg').textContent, ok: a.node('confirmOk').textContent };

test('the same paper on the same day stops for a confirmation that names the earlier receipt', async () => {
  const { a } = await receiving({ history: [saved('receipt_first', '2026-10-01', 2225.29, 18)] });
  a.run('finishReceipt()');
  const d = dialog(a);
  assert.equal(d.title, DUP);
  assert.match(d.text, /כבר נקלטה תעודה בסכום ₪2,225\.29 · 18 שורות ב־/);
  assert.equal(a.run('pendingReceipt'), null);
  a.events.get('confirmOk:click')();
  assert.ok(a.run('pendingReceipt'), 'confirmed: continues to the summary');
});

test('a similar amount a few days apart is caught; a different delivery is not', async () => {
  // Typed one agora off, two days later.
  let { a } = await receiving({ amount: 1758.1, day: '2026-10-17', history: [saved('receipt_x', '2026-10-15', 1758.09, 20)] });
  a.run('finishReceipt()'); assert.ok(dialog(a));
  // Real neighbours: 1669.44 (18.8) vs 1635.00 (20.8), and 2222.09 (27.9) vs 2225.29 (1.10).
  ({ a } = await receiving({ amount: 1635, lines: 13, day: '2026-08-20', history: [saved('r1', '2026-08-18', 1669.44, 20)] }));
  a.run('finishReceipt()'); assert.equal(dialog(a), null); assert.ok(a.run('pendingReceipt'));
  ({ a } = await receiving({ amount: 2225.29, day: '2026-10-01', history: [saved('r2', '2026-09-27', 2222.09, 19)] }));
  a.run('finishReceipt()'); assert.equal(dialog(a), null);
  // Same amount, but more than three days apart.
  ({ a } = await receiving({ amount: 1758.09, day: '2026-10-19', history: [saved('r3', '2026-10-15', 1758.09, 20)] }));
  a.run('finishReceipt()'); assert.equal(dialog(a), null);
});

test('the line count is shown but not required, and every paper of a multi-paper receipt is compared', async () => {
  const history = [saved('multi', '2026-09-08', 2462.74, 26, { noteParts: [{ amount: 2462.74, lines: 26 }, { amount: 203.04, lines: 1 }] })];
  const { a } = await receiving({ amount: 203.04, lines: 3, day: '2026-09-09', history });
  a.run('finishReceipt()');
  assert.match(dialog(a).text, /₪203\.04 · 1 שורות/);
});

test('the receipt being completed, and a no-document receiving, never match themselves', async () => {
  let { a } = await receiving({ history: [saved('receipt_nodoc', '2026-10-01', 2225.29, 18)] });
  a.run(`receiptDraftId='receipt_nodoc'; receiptAttachTarget={id:'receipt_nodoc'}; finishReceipt()`);
  assert.equal(dialog(a), null);
  ({ a } = await receiving({ noDoc: true, history: [saved('r', '2026-10-01', 2225.29, 18)] }));
  a.run('receiptDupConfirmed=true; finishReceipt()'); assert.equal(dialog(a), null);
});

test('an approval belongs to that amount: changing the paper asks again', async () => {
  const history = [saved('r1', '2026-10-01', 2225.29, 18), saved('r2', '2026-10-02', 1386, 12)];
  const { a } = await receiving({ history });
  a.run('finishReceipt()'); a.events.get('confirmOk:click')();
  a.run(`hideReceiptSummary(); pendingReceipt=null; receiptNotes=[{amount:1386,units:null,lines:12}]; recomputeNoteTotal(); finishReceipt()`);
  assert.match(dialog(a).text, /₪1,386\.00/);
});

test('a copy saved on another phone after the summary opened is caught before the final save', async () => {
  const { a, cloud } = await receiving();
  a.run('finishReceipt()');
  assert.ok(a.run('pendingReceipt'));
  a.run(`receipts = ${JSON.stringify([saved('other_phone', '2026-10-01', 2225.29, 18)])}`);
  await a.run('confirmReceipt()');
  assert.equal(cloud.paths('/receipts/').length, 0);
  assert.equal(dialog(a).ok, 'זה משלוח אחר — שמור');
  a.events.get('confirmOk:click')();
  await new Promise(r => setTimeout(r, 50)); await cloud.tick();
  assert.equal(cloud.paths('/receipts/').length, 1, a.toasts.join('\n'));
});
