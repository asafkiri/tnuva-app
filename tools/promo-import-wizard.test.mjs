import test from 'node:test';
import assert from 'node:assert/strict';
import * as harness from './receipt-scan-harness.mjs';

// גרסה 148: הרצף מ-30.10 — שני מוצרים נפתחים מהאשף, שורה בלי ברקוד מדולגת, ואז
// המוצר הבא עם ברקוד נפתח בעורך. עד כאן המסך שמאחורי העורך נשאר על הכרטיס
// הקודם (וכפתוריו היו מתים), ו"שמור מוצר" לא הראה דבר בזמן הבדיקה מול הענן.
function session() {
  const c = harness.runtime('tnuva', { data: { products: [], promos: [], items: [] } });
  // <input> אמיתי הופך ערך מספרי למחרוזת; הצומת של סביבת הבדיקה לא.
  const priceNode = c.node('prod_price'); let priceValue = '';
  Object.defineProperty(priceNode, 'value', { get: () => priceValue, set: x => { priceValue = x == null ? '' : String(x); } });
  c.run(`currentView='promos'; testRendered=''; testRenders=[];
    renderPromos=()=>{ testRendered=promoImportHtml(); testRenders.push(promoImport?promoImport.stage:null); };
    pricingCatsLoaded=true; pricingCats=[]; testRealCloudCheck=findCloudProductByBarcode; findCloudProductByBarcode=async()=>null;
    const mk=o=>Object.assign({bc:'',byName:false,productId:null,candidateProductIds:[],colors:[],note:'',
      effStart:'2026-11-01',effEnd:'2026-11-30',minUnits:1,datedNote:false,sourceName:''},o,{rowKey:'line:'+o.sourceLine,gp:o.list});
    const rows=[
      mk({sourceLine:10,bc:'7290116936864',name:'בולגרית מעודנת 16% עם זעתר',list:18.42,pct:30,promo:12.89}),
      mk({sourceLine:20,bc:'7290016682755',name:'שייק חלבון בטעם בננה וניל',list:7.42,pct:25,promo:5.57}),
      mk({sourceLine:30,byName:true,name:'מיץ תפוזים סחוט 1 ליטר בקבוק מרובע',sourceName:'מיץ תפוזים סחוט 1 ליטר בקבוק מרובע',list:14,pct:15,promo:11.9}),
      mk({sourceLine:40,bc:'7290016682342',name:'ולנסיה 2 ליטר',list:18.5,pct:10,promo:16.65}),
      mk({sourceLine:50,bc:'7290016682335',name:'מיץ תפוז סחוט 2 ליטר',list:18.5,pct:10,promo:16.65})];
    const sheet={validFrom:'2026-11-01',validTo:'2026-11-30',rows,groups:tnvBuildGroups(rows)};
    promoImport={stage:'wizard',sheet,missing:promoImportMatch(sheet),unresolved:[],source:'ai',audit:null};
    promoImportOpenNextMissing(); renderPromos();`);
  return c;
}
const json = value => JSON.parse(JSON.stringify(value));
const modalOpen = c => c.node('prodModal').classList.contains('flex') && !c.node('prodModal').classList.contains('hidden');
async function reachValencia(c) {
  await c.run('saveProd(false)'); await c.run('saveProd(false)');
  assert.equal(c.run('promoImport.stage'), 'matching');
  c.click('promo-import-name-skip');
}

test('the wizard follows the sheet order and the first two products save', async () => {
  const c = session();
  assert.deepEqual(json(c.run('promoImport.missing.map(m=>m.name)')),
    ['בולגרית מעודנת 16% עם זעתר', 'שייק חלבון בטעם בננה וניל', 'מיץ תפוזים סחוט 1 ליטר בקבוק מרובע', 'ולנסיה 2 ליטר', 'מיץ תפוז סחוט 2 ליטר']);
  assert.equal(c.node('prod_barcode').value, '7290116936864');
  await c.run('saveProd(false)');
  assert.equal(c.writes.length, 1);
  assert.equal(c.node('prod_barcode').value, '7290016682755');
  await c.run('saveProd(false)');
  assert.equal(c.writes.length, 2);
  assert.equal(c.run('promoImport.stage'), 'matching');
  assert.match(c.run('testRendered'), /בחר מוצר למבצע · נשארו 3/);
});

test('skipping the name-only row opens the next editor and moves the screen to the wizard card', async () => {
  const c = session();
  await reachValencia(c);
  assert.equal(c.run('promoImport.stage'), 'wizard');
  assert.equal(modalOpen(c), true);
  assert.equal(c.node('prod_barcode').value, '7290016682342');
  assert.equal(c.node('prod_name').value, 'ולנסיה 2 ליטר');
  assert.equal(c.node('prod_price').value, '18.5');
  assert.match(c.run('testRendered'), /נשארו 2 מוצרים מהדף לפתוח במאגר/);
  assert.match(c.run('testRendered'), /המשך לפתיחת המוצר הבא/);
  assert.doesNotMatch(c.run('testRendered'), /בחר מוצר למבצע/);
  await c.run('saveProd(false)');
  assert.equal(c.writes.length, 3);
  assert.equal(c.writes[2].data.barcode, '7290016682342');
  assert.equal(c.node('prod_barcode').value, '7290016682335', 'the editor moved on to the last missing product');
  assert.match(c.run('testRendered'), /נשארו 1 מוצרים מהדף לפתוח במאגר/);
});

test('ביטול in the editor keeps the wizard alive: "המשך לפתיחת המוצר הבא" reopens the same product', async () => {
  const c = session();
  await reachValencia(c);
  c.run('hideProdModal()');
  assert.equal(modalOpen(c), false);
  assert.equal(c.run('promoImport.stage'), 'wizard');
  assert.match(c.run('testRendered'), /המשך לפתיחת המוצר הבא/);
  assert.doesNotMatch(c.run('testRendered'), /בחר מוצר למבצע/);
  const before = c.writes.length;
  c.click('promo-import-name-skip');          // כפתורי השלב הקודם אינם על המסך, וגם לא עושים דבר
  c.click('promo-import-name-create');
  assert.equal(modalOpen(c), false);
  assert.equal(c.writes.length, before);
  c.click('promo-import-next');
  assert.equal(modalOpen(c), true);
  assert.equal(c.node('prod_barcode').value, '7290016682342');
  assert.equal(c.run('!!promoImport.missing.find(m=>m.name==="ולנסיה 2 ליטר").done'), false);
  c.click('promo-import-close');
  assert.equal(c.run('promoImport'), null);
});

test('the cloud barcode check shows progress, and ביטול during it abandons the save', async () => {
  const c = session();
  await reachValencia(c);
  c.run('findCloudProductByBarcode=()=>new Promise(r=>{testRelease=r;})');
  const pending = c.run('saveProd(false)');
  assert.equal(c.run('cloudBusyEl.style.display'), 'flex', 'the busy pill is up while the check runs');
  assert.match(c.node('cloudBusyTxt').textContent, /בודק שהברקוד/);
  assert.equal(c.writes.length, 2);
  c.run('hideProdModal()');
  assert.equal(c.run('cloudBusyEl.style.display'), 'none', 'ביטול drops the pill at once');
  c.run('testRelease(null)');
  await pending;
  assert.equal(c.writes.length, 2, 'nothing is written after the editor was cancelled');
  assert.equal(modalOpen(c), false, 'and no further editor is opened');
  assert.equal(c.run('!!promoImport.missing.find(m=>m.name==="ולנסיה 2 ליטר").done'), false);
  assert.equal(c.run('promoImport.stage'), 'wizard');
});

test('a cloud check that never answers gives up after the time limit and the save goes through', async () => {
  const c = session();
  await reachValencia(c);
  c.run('findCloudProductByBarcode=testRealCloudCheck; getDocs=()=>new Promise(()=>{});');
  await c.run('saveProd(false)');
  assert.equal(c.writes.length, 3);
  assert.equal(c.writes[2].data.barcode, '7290016682342');
  assert.equal(c.run('cloudBusyEl.style.display'), 'none');
  assert.equal(c.node('prod_barcode').value, '7290016682335');
});

test('a cloud check that answers in time still blocks a duplicate barcode', async () => {
  const c = session();
  await reachValencia(c);
  c.run(`findCloudProductByBarcode=testRealCloudCheck;
    getDocs=async()=>({docs:[{id:'prod_old',data:()=>({barcode:'7290016682342',name:'ולנסיה ישן'})}]});`);
  await c.run('saveProd(false)');
  assert.equal(c.writes.length, 2, 'the duplicate from the cloud stops the save');
  assert.equal(modalOpen(c), true);
  assert.equal(c.node('prod_save').disabled, true);
  assert.deepEqual(json(c.toasts.at(-1)), 'הפריט כבר קיים: ולנסיה ישן');
});
