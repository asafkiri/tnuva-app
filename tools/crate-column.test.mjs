// v149: עמודת 📦 במסך עריכת המוצרים קובעת רק את גודל הארגז (כפתור "+ ארגז" בקליטה),
// כמו שההסבר מעל הרשימה אומר. עד כאן היא כתבה רק boxSize, ומוצר שמעולם לא נשמר
// מהכרטיס נעשה "רק ארגזים שלמים" לבלש בלי שאיש סימן זאת.
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {runtime, fixture} from './receipt-scan-harness.mjs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function app(mutate) {
  const data = fixture('tnuva');
  if (mutate) mutate(data);
  const r = runtime('tnuva', {data});
  // הכתיבה המושהית של העמודה — נלכדת כמו שאר הכתיבות לענן
  r.run('runCloudTaskSilent = async (name, task) => { testWrites.push(structuredClone(task)); return true; }');
  return r;
}
// setTimeout מזויף בהרנס: מריצים רק את מה שנוסף מאז הסימון
function flushSince(r, n) { r.callbacks.slice(n).forEach(fn => fn()); }
function type(r, id, keys) {
  // כל הקשה היא אירוע input משלה, כמו בטלפון: "12" עובר דרך "1"
  const n = r.callbacks.length;
  keys.forEach(v => r.run(`saveBoxSize('${id}', '${v}')`));
  flushSince(r, n);
  return r.writes.at(-1);
}
const lastWrite = r => r.writes.at(-1);

test('the 📦 column explains itself and the card keeps the separate rule', () => {
  assert.match(html, /📦 מציין יחידות בארגז — מפעיל את כפתור "\+ ארגז" בקליטה\. אכיפת ״רק ארגזים שלמים״ לבלש מסומנת בכרטיס המוצר\./);
  assert.match(html, /המוצר מתקבל רק בארגזים שלמים<\/span><span[^>]*>הבלש יבדוק רק כפולות של ארגז שלם\. אל תסמן אם לפעמים מגיעות גם יחידות בודדות\./);
  assert.match(html, /const APP_VERSION = '150'/); // גרסה 150: הסכמת קריאות על הקוד
});

test('a product without a crate gets a size for the button only — the detective is not tightened', () => {
  const r = app();
  assert.equal(r.run('detectiveBoxSize(products[1])'), 0);
  const w = type(r, 'coffee', ['1', '12']);
  assert.deepEqual(w.data, {boxSize: 12, boxStrict: false});
  assert.equal(w.op, 'update');
  assert.equal(r.run('products[1].boxSize'), 12);
  assert.equal(r.run('products[1].boxStrict'), false);
  assert.equal(r.run('detectiveBoxSize(products[1])'), 0, 'the detective ignores the crate');
  r.run('qtyProduct = products[1]');
  assert.equal(r.run('qtyBoxSize()'), 12, 'the "+ ארגז" button follows the size');
  // the crate also reaches the detective candidates as 0 — one unit of coffee is still a valid move
  r.run("reconcileData = [{productId: 'milk', name: 'חלב בדיקה', price: 5, noteQty: 9, received: 9}]; receiptNoteTotal = 50; receiptNoteUnits = null;");
  const coffee = JSON.parse(r.run('JSON.stringify(detectiveBuildPriceGroups().flatMap(g => g.actors).find(a => a.productId === "coffee"))'));
  assert.equal(coffee.bs, 0);
});

test('a product that was already "whole crates only" stays so through a retyped size, keystroke by keystroke', () => {
  const r = app(d => { d.products[0].boxSize = 6; });   // ותיק: ארגז בלי דגל = קפדני
  assert.equal(r.run('detectiveBoxSize(products[0])'), 6);
  let w = type(r, 'milk', ['1', '12']);
  assert.deepEqual(w.data, {boxSize: 12, boxStrict: true}, 'the pass through "1" does not drop the rule');
  assert.equal(r.run('detectiveBoxSize(products[0])'), 12);
  w = type(r, 'milk', ['24']);
  assert.deepEqual(w.data, {boxSize: 24, boxStrict: true});
  const strictProduct = app(d => { d.products[0].boxSize = 6; d.products[0].boxStrict = true; });
  assert.deepEqual(type(strictProduct, 'milk', ['', '1', '12']).data, {boxSize: 12, boxStrict: true}, 'an explicit rule survives clearing and retyping in one go');
  const released = app(d => { d.products[0].boxSize = 6; d.products[0].boxStrict = false; });
  assert.deepEqual(type(released, 'milk', ['12']).data, {boxSize: 12, boxStrict: false}, 'a product released in the card stays released');
});

test('clearing the size removes the crate; a size typed later, after the save, is for the button only', () => {
  const r = app(d => { d.products[0].boxSize = 12; });
  assert.deepEqual(type(r, 'milk', ['']).data, {boxSize: 0, boxStrict: false});
  assert.equal(r.run('detectiveBoxSize(products[0])'), 0);
  assert.deepEqual(type(r, 'milk', ['6']).data, {boxSize: 6, boxStrict: false});
  assert.equal(r.run('detectiveBoxSize(products[0])'), 0);
  assert.equal(r.run('qtyProduct = products[0]; qtyBoxSize()'), 6);
  // "1" alone is not a crate
  assert.deepEqual(type(r, 'coffee', ['1']).data, {boxSize: 0, boxStrict: false});
});

test('the product card shows the truth after the column: unchecked for a new crate, checked for an old one', () => {
  const r = app(d => { d.products[0].boxSize = 12; });
  type(r, 'coffee', ['1', '12']);
  // ההרנס מזייף צמתים בלי ערך-מחרוזת של input — הכרטיס קורא אותו כמחרוזת
  for (const id of ['prod_name', 'prod_barcode', 'prod_price', 'prod_posPrice', 'prod_creditPrice', 'prod_deposit', 'prod_average', 'prod_billingPackSize', 'prod_boxSize', 'prod_cartonPrice', 'prod_cartonUnits']) {
    const n = r.node(id); let v = '';
    Object.defineProperty(n, 'value', { configurable: true, get: () => v, set: x => { v = x == null ? '' : String(x); } });
  }
  r.run('pricingCatsLoaded = true; openProdModal(products[1], false, "")');
  assert.equal(r.run("$('prod_boxSize').value"), '12');
  assert.equal(r.run("$('prod_wholeCarton').checked"), false, 'coffee: size without the rule');
  r.run('openProdModal(products[0], false, "")');
  assert.equal(r.run("$('prod_boxSize').value"), '12');
  assert.equal(r.run("$('prod_wholeCarton').checked"), true, 'milk: an old crate product is still whole-crates-only');
});
