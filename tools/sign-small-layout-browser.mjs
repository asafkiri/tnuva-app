// v121 — "2 בדף (קטן)" בהכנת שלטי מבצע, בדפדפן אמיתי.
// ביקשו הדפסה כמו "2 בדף (גדול)", רק מוקטנת — אותו דף עם שוליים לבנים מסביב.
// הבדיקה שומרת על:
// - ארבעה כפתורי פריסה בסדר 4 / 2 קטן / 2 גדול / 1, ובדיוק אחד מסומן — זה שבמצב.
// - "2 בדף (קטן)" נשאר A4 לאורך (1240×1754): מחוץ למלבן הממורכז של 88% הכל לבן
//   לגמרי, בזמן שב"2 בדף (גדול)" המסגרת האדומה יושבת בתוך אותה רצועה.
// - הדף הקטן הוא הדף הגדול מוקטן ל־88% סביב מרכז ה־A4 — אותה כותרת, מחיר, רשימת
//   ברקודים ושבירת שורות. משווים פיקסלים מול הדף הגדול שהוקטן כתמונה, והמסגרת
//   האדומה יושבת במקום הצפוי. ביקורת שלילית: הזזה של 2px וקנה 0.89 נכשלים.
// - רצועת "ברקודים לקופה": תמונות הברקוד מוקטנות יחד עם כל השאר, הרצועה דוחפת את
//   השלט השני לעמוד 2 בדיוק כמו בגדול, וכל עמוד קטן. הספרייה נטענת באמצע (עצלה),
//   והציור החוזר אחרי הטעינה נשאר קטן.
// - השיתוף מוציא בדיוק את העמודים שבתצוגה: A4 לאורך, אחד לכל עמוד.
// - "2 בדף (גדול)", "4 בדף" ו"1 בדף (רוחב)" מבטלים את המצב הקטן.
// - עם 3 שלטים "2 בדף (קטן)" לא עובר (אותה הגנה כמו בגדול), ומופיעה הודעה.
// - חזרה לבחירה וחזרה לעריכה, או ציור מחדש של הכרטיסים, משאירים את המצב הקטן.
// הנתונים סינתטיים (מבצעי תנובה בדויים), והשעון קבוע על 1.10.2026.
// אין גישה לרשת: JsBarcode מוגש מקומית — כברירת מחדל תחליף קטן שמצייר פסים
// כמו הספרייה (קנבס לבן, פסים שחורים, ספרות מתחת); SIGN_TEST_JSBARCODE=<קובץ>
// מגיש את JsBarcode.all.min.js האמיתי במקומו.
//
// הרצה: node tools/sign-small-layout-browser.mjs   (Playwright + Chromium)
// משתנים: RECEIPT_TEST_APP — עותק אחר של index.html (כמו בשאר הבדיקות);
//          SIGN_TEST_CHROMIUM — קובץ הרצה של Chromium; SIGN_TEST_JSBARCODE — ראה למעלה;
//          SIGN_TEST_SHOTS — תיקיית התמונות (ברירת מחדל: <OS temp>/tnuva-sign-layouts).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const shots = process.env.SIGN_TEST_SHOTS || path.join(os.tmpdir(), 'tnuva-sign-layouts');
fs.mkdirSync(shots, { recursive: true });

// הדף הקטן: 88% מה־A4, ממורכז (17.3×12.3 ס״מ לשלט במקום 19.6×14).
const K = 0.88, W = 1240, H = 1754;
const OX = Math.round(W * (1 - K) / 2), OY = Math.round(H * (1 - K) / 2);
const BOX = { x0: OX, y0: OY, x1: OX + Math.round(W * K), y1: OY + Math.round(H * K) };
const TOL = 2;
// הדף הקטן מצויר בווקטור בקנה מידה 0.88; ההשוואה היא מול הדף הגדול שהוקטן כתמונה
// (דגימה דו־לינארית), ולכן ההבדל הוא רק בהחלקת קצוות. המספרים שנמדדו מודפסים בכל
// ריצה; הספים יושבים בין "זהה" לבין הזזה של 2px / קנה 0.89, והבדיקה מוכיחה שהם תופסים.
const MEAN_DIFF_MAX = 2.5, INK_DIFF_MAX = 15;
// פס ברקוד: עמודה עם רצף כהה אנכי של 50px ומעלה ברצועת הברקודים. הפסים גבוהים
// 78px (69 בקטן); טקסט ברצועה (ספרות, שם, עלות) אינו מגיע ל־25px.
const BAR_RUN = 50;

// ---- נתונים: שלושה מבצעים פעילים, ברקודים תקניים (EAN-13) ----
const ean = body => body + (10 - [...body].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0) % 10) % 10;
const P = (id, name, n, price) => ({ id, name, barcode: ean('729000' + String(n).padStart(6, '0')), price });
const products = [
  P('yog3', 'יוגורט 3% 200 גרם', 101, 2.71), P('yog15', 'יוגורט 1.5% 200 גרם', 102, 2.71),
  P('yog0', 'יוגורט 0% 200 גרם', 103, 2.71), P('yogVan', 'יוגורט וניל 150 גרם', 104, 2.95),
  P('yogStr', 'יוגורט תות 150 גרם', 105, 2.95), P('yogPea', 'יוגורט אפרסק 150 גרם', 106, 2.95),
  P('milky', 'מילקי שוקולד 170 גרם', 201, 3.12), P('milkyB', 'מילקי בננה 170 גרם', 202, 3.12),
  P('cheese', 'גבינה לבנה 5% 250 גרם', 301, 4.40), P('cheese9', 'גבינה לבנה 9% 250 גרם', 302, 4.85)
];
const promo = (id, name, pct, productIds) => ({ id, name, pct, start: '2026-10-01', end: '2026-10-31', type: 'receipt', productIds });
const promos = [
  promo('pr_yog', 'יוגורטים 200/150 גרם', 15, ['yog3', 'yog15', 'yog0', 'yogVan', 'yogStr', 'yogPea']),
  promo('pr_milky', 'מילקי', 10, ['milky', 'milkyB']),
  promo('pr_cheese', 'גבינה לבנה', 12, ['cheese', 'cheese9'])
];

// ---- האפליקציה: index.html האמיתי, בלי Firebase, Tailwind וגופנים מהרשת ----
const appFile = process.env.RECEIPT_TEST_APP || new URL('../index.html', import.meta.url);
const html = fs.readFileSync(appFile, 'utf8');
const moduleSource = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]
  .replace(/^import[\s\S]*?from "https:\/\/www\.gstatic\.com\/firebasejs\/[^"\n]+";\n/gm, '');
const setup = `
const initializeApp=()=>({}),getAuth=()=>({currentUser:null}),signInAnonymously=async()=>({}),onAuthStateChanged=()=>{};
const initializeFirestore=()=>({}),getFirestore=()=>({}),persistentLocalCache=()=>({}),persistentMultipleTabManager=()=>({});
const collection=(..._)=>({}),doc=(_db,...p)=>p.join('/'),query=(..._)=>({}),orderBy=()=>({}),limit=()=>({}),where=()=>({});
const onSnapshot=()=>()=>{},getDoc=async()=>({exists:()=>false,data:()=>null}),getDocs=async()=>({docs:[],forEach(){}});
const deleteDoc=async()=>{},addDoc=async()=>({}),updateDoc=async()=>{},setDoc=async()=>{};
const writeBatch=()=>({set(){},update(){},delete(){},commit:async()=>{}}),runTransaction=async()=>{throw new Error('no cloud in sign test')};
`;
const replay = `
products=${JSON.stringify(products)};promos=${JSON.stringify(promos)};
runCloudTask=async()=>true;runCloudTaskSilent=async()=>true;
window.fetch=async(url)=>{throw new Error('External network is forbidden in local replay: '+url)};
// השיתוף נלכד במקום לפתוח את חלון השיתוף של המכשיר
window.__shared=null;
Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
Object.defineProperty(navigator,'share',{configurable:true,value:async d=>{window.__shared=d.files;}});
window.t={
  state:()=>({view:currentView,step:signMaker&&signMaker.step,perPage:signMaker&&signMaker.perPage,small:!!(signMaker&&signMaker.small),smallPage:typeof signSmallPage==='function'&&signSmallPage(),
    pages:signMaker&&signMaker._pages?signMaker._pages.length:0,signs:signMaker?signMaker.signs.map(s=>({title:s.title,kind:s.kind,price:s.price,validUntil:s.validUntil,withBarcodes:!!s.withBarcodes})):[]}),
  pages:()=>signMaker&&signMaker._pages,
  barcodesLoading:()=>!!drawSignCanvas._loading
};
setView('promos');window.t.loaded=true;
`;
const css = `.hidden{display:none!important}.flex{display:flex}.grid{display:grid}.grid-cols-4{grid-template-columns:repeat(4,minmax(0,1fr))}.flex-wrap{flex-wrap:wrap}.flex-1{flex:1}.gap-1{gap:.25rem}.gap-2{gap:.5rem}.fixed{position:fixed}.sticky{position:sticky}.top-0{top:0}.bottom-0{bottom:0}.bottom-24{bottom:6rem}.inset-x-0{left:0;right:0}.z-40{z-index:40}.pointer-events-none{pointer-events:none}.items-center{align-items:center}.justify-center{justify-content:center}.justify-between{justify-content:space-between}.w-full{width:100%}.block{display:block}.max-w-3xl{max-width:48rem}.mx-auto{margin-left:auto;margin-right:auto}.bg-white{background:white}.bg-slate-100{background:#f1f5f9}.bg-slate-200{background:#e2e8f0}.bg-rose-600{background:#e11d48}.text-white{color:white}.p-3{padding:.75rem}.p-4{padding:1rem}.pb-24{padding-bottom:6rem}.rounded-lg{border-radius:.5rem}.font-black{font-weight:900}body{margin:0;font:16px Arial}header{background:#047857;padding:14px;z-index:30}button,input{font:inherit;padding:8px;max-width:100%;box-sizing:border-box}button{cursor:pointer}canvas{display:block}[class*="z-50"]{z-index:50}[class*="z-\\["]{z-index:10000}[id$="Modal"]{background:#0008;align-items:center;justify-content:center}`;
const pageHtml = html.replace(/<script\s+src="https:[^"]+"><\/script>/g, '').replace(/<link[^>]+(?:href="https:[^"]+"|rel="(?:manifest|preconnect)")[^>]*>/g, '')
  .replace(/<script type="module">[\s\S]*?<\/script>/, () => '<script type="module">' + setup + moduleSource + replay + '</script>')
  .replace('</head>', '<style>' + css + '</style></head>');

// תחליף JsBarcode: אותו חוזה שהאפליקציה משתמשת בו — JsBarcode(canvas, code, options)
// קובע את גודל הקנבס ומצייר פסים בגובה options.height ברוחב options.width לכל מודול.
const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const jsBarcodeStub = `window.JsBarcode=function(cv,code,o){
  o=Object.assign({width:2,height:100,margin:10,displayValue:true,fontSize:20,font:'monospace',background:'#ffffff',lineColor:'#000000'},o||{});
  if(o.format==='EAN13'&&!/^\\d{13}$/.test(code))throw new Error('Invalid EAN13');
  const L=${JSON.stringify(L)};const bits='101'+[...String(code)].map(c=>L[(c.charCodeAt(0)-48+10)%10]).join('')+'101';
  cv.width=bits.length*o.width+2*o.margin;cv.height=o.height+2*o.margin+(o.displayValue?o.fontSize+2:0);
  const ctx=cv.getContext('2d');ctx.fillStyle=o.background;ctx.fillRect(0,0,cv.width,cv.height);ctx.fillStyle=o.lineColor;
  for(let i=0;i<bits.length;i++)if(bits[i]==='1')ctx.fillRect(o.margin+i*o.width,o.margin,o.width,o.height);
  if(o.displayValue){ctx.font=o.fontSize+'px '+o.font;ctx.textAlign='center';ctx.fillText(code,cv.width/2,o.margin+o.height+o.fontSize);}
};`;
const jsBarcodeSource = process.env.SIGN_TEST_JSBARCODE ? fs.readFileSync(process.env.SIGN_TEST_JSBARCODE, 'utf8') : jsBarcodeStub;

let server, browser, page, url;
const errors = [], external = [], barcodeRequests = [];
let releaseBarcodes; const barcodesGate = new Promise(resolve => { releaseBarcodes = resolve; });

const state = () => page.evaluate(() => window.t.state());
const role = (r, attrs = '') => page.locator('#app [data-role="' + r + '"]' + attrs).first();
const LAYOUT = [
  { label: '4 בדף', pp: '4', small: null },
  { label: '2 בדף (קטן)', pp: '2', small: '1' },
  { label: '2 בדף (גדול)', pp: '2', small: null },
  { label: '1 בדף (רוחב)', pp: '1', small: null }
];
const layoutBtn = i => role('sign-pp', '[data-pp="' + LAYOUT[i].pp + '"]' + (LAYOUT[i].small ? '[data-small="1"]' : ':not([data-small])'));
const [L4, L2S, L2B, L1] = [0, 1, 2, 3];
const expectedIndex = s => s.perPage === 4 ? L4 : s.perPage === 1 ? L1 : s.small ? L2S : L2B;

// ארבעת הכפתורים בסדר, ובדיוק אחד מסומן — זה שמתאים למצב
async function assertButtons(expect, why) {
  const btns = await page.$$eval('#app [data-role="sign-pp"]', bs => bs.map(b => ({
    label: b.textContent.trim(), pp: b.dataset.pp, small: b.dataset.small || null, on: b.classList.contains('bg-rose-600'),
    row: b.parentElement.className, head: b.parentElement.previousElementSibling ? b.parentElement.previousElementSibling.textContent.trim() : '' })));
  assert.deepEqual(btns.map(b => ({ label: b.label, pp: b.pp, small: b.small })), LAYOUT, why + ': four layout buttons in order');
  assert.ok(btns.every(b => /\bgrid-cols-4\b/.test(b.row) && b.head === 'תצוגה מקדימה של הדף'), why + ': buttons sit in their own 4-column row under the preview label');
  const on = btns.map((b, i) => b.on ? i : -1).filter(i => i >= 0);
  assert.deepEqual(on, [expect], why + ': exactly one active button, ' + LAYOUT[expect].label + ' (got ' + on.map(i => LAYOUT[i].label).join(',') + ')');
  const s = await state();
  assert.equal(expectedIndex(s), expect, why + ': active button matches state ' + JSON.stringify({ perPage: s.perPage, small: s.small }));
}

// כלי פיקסלים בתוך הדף — לא נוגעים במודול האפליקציה. כל "צילום" הוא כל עמודי התצוגה.
async function installPixelTools() {
  await page.evaluate(() => {
    const shots = {};
    const copy = cv => { const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; c.getContext('2d').drawImage(cv, 0, 0); return c; };
    const pixels = c => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const isRed = (d, i) => d[i] >= 180 && d[i + 1] <= 100 && d[i + 2] <= 130;
    const live = () => [...document.querySelectorAll('#signPages canvas')];
    window.px = {
      grab(name) { shots[name] = live().map(copy); return shots[name].map(c => ({ w: c.width, h: c.height })); },
      liveUrls() { return live().map(c => c.toDataURL('image/png')); },
      urls(name) { return shots[name].map(c => c.toDataURL('image/png')); },
      // פיקסלים שאינם לבן מלא מחוץ למלבן (ובתוכו), וכמה מהם אדומים
      outside(name, p, box) {
        const c = shots[name][p], d = pixels(c); let out = 0, outRed = 0, inside = 0, first = null;
        for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
          const i = (y * c.width + x) * 4;
          if (d[i] === 255 && d[i + 1] === 255 && d[i + 2] === 255 && d[i + 3] === 255) continue;
          if (x >= box.x0 && x < box.x1 && y >= box.y0 && y < box.y1) { inside++; continue; }
          out++; if (isRed(d, i)) outRed++; if (!first) first = { x, y, rgba: [d[i], d[i + 1], d[i + 2], d[i + 3]] };
        }
        return { out, outRed, inside, first };
      },
      redBox(name, p) {
        const c = shots[name][p], d = pixels(c); let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1, n = 0;
        for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
          if (!isRed(d, (y * c.width + x) * 4)) continue;
          n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
        return { x0, y0, x1, y1, n };
      },
      // עמודות עם רצף כהה אנכי ארוך בתוך רצועה — פסי ברקוד
      barColumns(name, p, y0, y1, run) {
        const c = shots[name][p], d = pixels(c); let cols = 0;
        for (let x = 0; x < c.width; x++) {
          let cur = 0, best = 0;
          for (let y = Math.max(0, Math.floor(y0)); y < Math.min(c.height, Math.ceil(y1)); y++) {
            const i = (y * c.width + x) * 4;
            if (d[i] + d[i + 1] + d[i + 2] < 200) { cur++; if (cur > best) best = cur; } else cur = 0;
          }
          if (best >= run) cols++;
        }
        return cols;
      },
      // עמוד גדול מוקטן כתמונה באותו translate+scale, מול העמוד הקטן
      compare(smallName, bigName, p, k, ox, oy) {
        const s = shots[smallName][p], b = shots[bigName][p];
        const ref = document.createElement('canvas'); ref.width = s.width; ref.height = s.height;
        const ctx = ref.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, ref.width, ref.height);
        ctx.translate(ox, oy); ctx.scale(k, k); ctx.drawImage(b, 0, 0);
        // mean: ממוצע הפרש לערוץ על כל הדף; inkMean: רק על פיקסלים שאינם לבנים באחד מהשניים
        const a = pixels(s), r = pixels(ref); let sum = 0, ink = 0, inkSum = 0;
        for (let i = 0; i < a.length; i += 4) {
          const diff = Math.abs(a[i] - r[i]) + Math.abs(a[i + 1] - r[i + 1]) + Math.abs(a[i + 2] - r[i + 2]);
          sum += diff;
          const blank = a[i] + a[i + 1] + a[i + 2] === 765 && r[i] + r[i + 1] + r[i + 2] === 765;
          if (!blank) { ink++; inkSum += diff; }
        }
        return { mean: sum / (a.length / 4 * 3), inkMean: inkSum / (ink * 3), ink };
      },
      // הקבצים ששותפו, מפוענחים מ־PNG, מול העמודים שבתצוגה — פיקסל בפיקסל
      async sharedVsPreview() {
        const files = window.__shared || [], pages = live(), out = [];
        for (let i = 0; i < files.length; i++) {
          const bmp = await createImageBitmap(files[i]);
          const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0);
          const pv = pages[i]; let same = !!pv && pv.width === c.width && pv.height === c.height;
          if (same) { const a = pixels(c), b = pixels(copy(pv)); for (let j = 0; j < a.length && same; j++) if (a[j] !== b[j]) same = false; }
          out.push({ name: files[i].name, type: files[i].type, w: c.width, h: c.height, same });
        }
        return { files: out, pages: pages.length };
      }
    };
  });
}
const savePages = async (name, file) => {
  const urls = await page.evaluate(n => px.urls(n), name);
  urls.forEach((u, i) => fs.writeFileSync(path.join(shots, file + (urls.length > 1 ? '-p' + (i + 1) : '') + '.png'), Buffer.from(u.split(',')[1], 'base64')));
};
const liveUrls = () => page.evaluate(() => px.liveUrls());
const grab = name => page.evaluate(n => px.grab(n), name);
const outside = (name, p, box) => page.evaluate(([n, p, b]) => px.outside(n, p, b), [name, p, box]);
const tolBox = { x0: BOX.x0 - TOL, y0: BOX.y0 - TOL, x1: BOX.x1 + TOL, y1: BOX.y1 + TOL };
// כל עמוד קטן: מחוץ למלבן 88% (עם 2px סבילות) — לבן מלא, ובפנים יש שלט
async function assertSmallPages(name, pages, why) {
  const g = await grab(name);
  assert.deepEqual(g, Array(pages).fill({ w: W, h: H }), why + ': ' + pages + ' small page(s), each A4 portrait');
  for (let p = 0; p < pages; p++) {
    const o = await outside(name, p, tolBox);
    assert.equal(o.out, 0, why + ' page ' + (p + 1) + ': non-white pixel outside the centered ' + K * 100 + '% box: ' + JSON.stringify(o.first));
    assert.ok(o.inside > 10000, why + ' page ' + (p + 1) + ': the sign is drawn inside the box');
  }
}
// עמוד שאינו קטן: המסגרת האדומה יושבת ברצועת השוליים
async function assertMarginsUsed(name, size, why) {
  const g = await grab(name);
  assert.deepEqual(g, [size], why + ': one page, canvas size');
  const o = await outside(name, 0, tolBox);
  assert.ok(o.out > 1000 && o.outRed > 1000, why + ': the red frame reaches into the margin band (' + JSON.stringify(o) + ')');
  return o;
}
const fmt = r => 'mean ' + r.mean.toFixed(3) + '/ch, ink ' + r.inkMean.toFixed(2) + '/ch';
const compare = (small, big, p, k, dx) => page.evaluate(([s, b, p, k, dx]) => px.compare(s, b, p, k, Math.round(1240 * (1 - k) / 2) + dx, Math.round(1754 * (1 - k) / 2) + dx), [small, big, p, k, dx]);
// העמוד הקטן = העמוד הגדול מוקטן; והסף תופס הזזה של 2px וקנה 0.89
async function assertScaledCopy(small, big, p, why) {
  const cmp = await compare(small, big, p, K, 0), shifted = await compare(small, big, p, K, 2), rescaled = await compare(small, big, p, 0.89, 0);
  console.log(why + ' page ' + (p + 1) + ' — small vs big scaled as an image: ' + fmt(cmp) + ' over ' + cmp.ink + ' ink px | shifted 2px: ' + fmt(shifted) + ' | scale 0.89: ' + fmt(rescaled));
  assert.ok(cmp.mean < MEAN_DIFF_MAX, why + ' page ' + (p + 1) + ': small page is the big page scaled (mean diff ' + cmp.mean + ')');
  assert.ok(cmp.inkMean < INK_DIFF_MAX, why + ' page ' + (p + 1) + ': small page is the big page scaled (ink diff ' + cmp.inkMean + ')');
  assert.ok(shifted.mean > MEAN_DIFF_MAX && shifted.inkMean > INK_DIFF_MAX, why + ': the comparison catches a 2px shift: ' + JSON.stringify(shifted));
  assert.ok(rescaled.mean > MEAN_DIFF_MAX && rescaled.inkMean > INK_DIFF_MAX, why + ': the comparison catches a 0.89 scale: ' + JSON.stringify(rescaled));
}
// עד שהציור החוזר שאחרי טעינת JsBarcode הסתיים (עמודים חדשים, הטעינה נגמרה)
async function waitForBarcodeRedraw() {
  await page.waitForFunction(() => window.JsBarcode && !window.t.barcodesLoading() && window.t.pages() !== window.__pagesBefore, null, { timeout: 10000 });
}

// גאומטריית 2 בדף (כמו drawSignCanvas): משבצת 825px, הרצועה של שלט 1 מתחילה ב־889
const SLOT2 = Math.floor((H - 80 - 24) / 2), STRIP_Y = 40 + SLOT2 + 24, STRIP_ROWS = 2;
const stripBand = { y0: STRIP_Y + 48, y1: STRIP_Y + 48 + STRIP_ROWS * 164 };
const smallBand = { y0: OY + K * stripBand.y0, y1: OY + K * stripBand.y1 };
const bars = (name, p, band) => page.evaluate(([n, p, b, run]) => px.barColumns(n, p, b.y0, b.y1, run), [name, p, band, BAR_RUN]);

before(async () => {
  server = http.createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    // JsBarcode "מה־CDN" מוגש מקומית דרך route; כל השאר חסום
    res.setHeader('Content-Security-Policy', "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'none'");
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(pageHtml); }
    else { res.statusCode = 404; res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  url = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ headless: true, executablePath: process.env.SIGN_TEST_CHROMIUM, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 430, height: 920 }, serviceWorkers: 'block', locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
  await context.route('**/*', async route => {
    const u = route.request().url();
    if (u.startsWith(url) || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
    if (/jsbarcode/i.test(u)) {
      // הטעינה מעוכבת עד שהבדיקה משחררת אותה — כך רואים את הציור שלפני ואחרי
      barcodeRequests.push(u); await barcodesGate;
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: jsBarcodeSource });
    }
    external.push(u); return route.abort();
  });
  page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.dismiss());
  await page.clock.setFixedTime(new Date('2026-10-01T10:00:00+03:00'));
  await page.goto(url); await page.waitForFunction(() => window.t?.loaded);
  await installPixelTools();
});
after(async () => { await browser?.close(); server?.close(); });

test('two promo signs reach the edit step; four layout buttons, "4 בדף" active', async () => {
  await role('sign-start').click();
  await role('sign-pick', '[data-id="pr_yog"]').click();
  await role('sign-pick', '[data-id="pr_milky"]').click();
  await role('sign-next').click();
  await page.locator('#signPages canvas').first().waitFor({ state: 'attached' });
  for (const [i, price] of [[0, '9.90'], [1, '5.90']]) {
    await role('sign-kind', '[data-id="' + i + '"][data-kind="unit"]').click();
    await role('sign-f', '[data-id="' + i + '"][data-f="price"]').fill(price);
  }
  const s = await state();
  assert.equal(s.step, 'edit'); assert.equal(s.perPage, 4); assert.equal(s.small, false);
  assert.deepEqual(s.signs.map(x => [x.title, x.price, x.validUntil]), [['יוגורטים 200/150 גרם', '9.90', '31.10.2026'], ['מילקי', '5.90', '31.10.2026']]);
  await assertButtons(L4, 'start');
  await assertMarginsUsed('4', { w: W, h: H }, '4 per page');
  await savePages('4', '4');
});

test('"2 בדף (קטן)" is the "2 בדף (גדול)" page shrunk to 88% around the A4 centre', async () => {
  await layoutBtn(L2B).click();
  let s = await state(); assert.equal(s.perPage, 2); assert.equal(s.small, false);
  await assertButtons(L2B, '2 big');
  await assertMarginsUsed('2big', { w: W, h: H }, '2 big');
  await savePages('2big', '2big');

  await layoutBtn(L2S).click();
  s = await state(); assert.equal(s.perPage, 2); assert.equal(s.small, true); assert.equal(s.smallPage, true);
  await assertButtons(L2S, '2 small');
  await assertSmallPages('2small', 1, '2 small');
  await savePages('2small', '2small');
  await assertScaledCopy('2small', '2big', 0, 'two signs');

  const bigRed = await page.evaluate(() => px.redBox('2big', 0));
  const smallRed = await page.evaluate(() => px.redBox('2small', 0));
  const expectRed = { x0: OX + K * bigRed.x0, y0: OY + K * bigRed.y0, x1: OX + K * (bigRed.x1 + 1) - 1, y1: OY + K * (bigRed.y1 + 1) - 1 };
  console.log('red frame: big %j -> small %j (expected %j)', bigRed, smallRed, Object.fromEntries(Object.entries(expectRed).map(([k, v]) => [k, +v.toFixed(1)])));
  for (const k of ['x0', 'y0', 'x1', 'y1']) assert.ok(Math.abs(smallRed[k] - expectRed[k]) <= 3, 'red frame ' + k + ': ' + smallRed[k] + ' vs ' + expectRed[k].toFixed(1));
  // הגדול מגיע עד 40px מהקצה, כלומר לתוך רצועת השוליים של הקטן
  assert.ok(bigRed.x0 < BOX.x0 - TOL && bigRed.y0 < BOX.y0 - TOL && bigRed.x1 >= BOX.x1 + TOL && bigRed.y1 >= BOX.y1 + TOL, 'big frame reaches the margin band: ' + JSON.stringify(bigRed));
  assert.ok(smallRed.x0 >= BOX.x0 && smallRed.y0 >= BOX.y0 && smallRed.x1 < BOX.x1 && smallRed.y1 < BOX.y1, 'small frame stays inside the box: ' + JSON.stringify(smallRed));
});

test('re-render, typing and back-to-edit keep "2 בדף (קטן)"', async () => {
  const smallUrls = await liveUrls();
  await role('sign-kind', '[data-id="0"][data-kind="unit"]').click();
  await assertButtons(L2S, 'after re-render');
  assert.deepEqual(await liveUrls(), smallUrls, 're-render draws the same small page');
  await role('sign-f', '[data-id="1"][data-f="price"]').fill('5.90');
  assert.equal((await state()).small, true);
  assert.deepEqual(await liveUrls(), smallUrls, 'typing redraws the same small page');
  await role('sign-back').click();
  assert.equal((await state()).step, 'pick');
  await role('sign-next').click();
  const s = await state(); assert.equal(s.step, 'edit'); assert.equal(s.perPage, 2); assert.equal(s.small, true);
  await assertButtons(L2S, 'back to edit');
  await assertSmallPages('2small-again', 1, 'back to edit');
  assert.deepEqual(await liveUrls(), smallUrls, 'back to edit draws the same small page');
});

test('barcode strip: lazy JsBarcode load keeps small mode, strip images scale, page 2 matches the big flow', async () => {
  // הרצועה מסומנת בזמן שהמצב קטן ו־JsBarcode עוד לא נטען
  assert.equal(await page.evaluate(() => !!window.JsBarcode), false, 'JsBarcode is not loaded yet');
  await page.evaluate(() => { window.__pagesBefore = window.t.pages(); });
  await role('sign-with-barcodes', '[data-id="0"]').click();
  let s = await state(); assert.equal(s.small, true); assert.equal(s.signs[0].withBarcodes, true);
  // לפני הטעינה: ספרות במקום פסים, אבל כבר שני עמודים קטנים
  assert.equal(s.pages, 2, 'the strip pushes the second sign to page 2 (before load)');
  await assertSmallPages('strip-small-preload', 2, 'strip, before JsBarcode');
  assert.equal(await bars('strip-small-preload', 0, smallBand), 0, 'no barcode bars before JsBarcode loads');
  assert.equal(await page.evaluate(() => window.t.barcodesLoading()), true, 'JsBarcode load is in flight');
  assert.equal(barcodeRequests.length, 1, 'JsBarcode requested once');

  await page.evaluate(() => { window.__pagesBefore = window.t.pages(); });
  releaseBarcodes();
  await waitForBarcodeRedraw();
  s = await state(); assert.equal(s.perPage, 2); assert.equal(s.small, true); assert.equal(s.pages, 2);
  await assertButtons(L2S, 'after the JsBarcode redraw');
  await assertSmallPages('strip-small', 2, 'strip, after the JsBarcode redraw');
  const smallBars = await bars('strip-small', 0, smallBand);
  await savePages('strip-small', '2small-barcodes');

  await layoutBtn(L2B).click();
  s = await state(); assert.equal(s.small, false); assert.equal(s.pages, 2, 'big flow has the same two pages');
  const g = await grab('strip-big');
  assert.deepEqual(g, [{ w: W, h: H }, { w: W, h: H }]);
  const bigBars = await bars('strip-big', 0, stripBand);
  await savePages('strip-big', '2big-barcodes');
  console.log('barcode bar columns in the strip: big ' + bigBars + ', small ' + smallBars);
  assert.ok(bigBars > 300, 'big strip has barcode images (' + bigBars + ' bar columns)');
  // אותם פסים, ברוחב 88%
  assert.ok(smallBars > bigBars * K * 0.8 && smallBars < bigBars * K * 1.2, 'small strip has the same barcode images, scaled (' + smallBars + ' vs ' + bigBars + ')');
  for (const p of [0, 1]) await assertScaledCopy('strip-small', 'strip-big', p, 'barcode strip');

  // השיתוף: אותם שני עמודים קטנים, A4 לאורך, פיקסל בפיקסל כמו בתצוגה
  await layoutBtn(L2S).click();
  await page.evaluate(() => { window.__shared = null; });
  await role('sign-download').click();
  await page.waitForFunction(() => window.__shared);
  const shared = await page.evaluate(() => px.sharedVsPreview());
  assert.deepEqual(shared, { pages: 2, files: [1, 2].map(i => ({ name: 'shelet-2026-10-01-' + i + '.png', type: 'image/png', w: W, h: H, same: true })) }, 'export is the previewed small pages');
  await assertSmallPages('strip-small-shared', 2, 'pages that were shared');

  // מורידים את הרצועה — חוזרים לעמוד קטן אחד
  await role('sign-with-barcodes', '[data-id="0"]').click();
  s = await state(); assert.equal(s.pages, 1); assert.equal(s.small, true);
  await assertSmallPages('2small-nostrip', 1, 'strip removed');
  assert.deepEqual(await page.evaluate(() => px.urls('2small-nostrip')), await page.evaluate(() => px.urls('2small')), 'strip removed draws the original small page');
});

test('every other layout clears small mode', async () => {
  await layoutBtn(L2B).click();
  let s = await state(); assert.equal(s.perPage, 2); assert.equal(s.small, false);
  await assertButtons(L2B, 'small -> 2 big');
  await assertMarginsUsed('2big-again', { w: W, h: H }, 'small -> 2 big');
  assert.deepEqual(await liveUrls(), await page.evaluate(() => px.urls('2big')), 'small -> 2 big draws the original big page');

  await layoutBtn(L2S).click(); assert.equal((await state()).small, true);
  await layoutBtn(L4).click();
  s = await state(); assert.equal(s.perPage, 4); assert.equal(s.small, false);
  await assertButtons(L4, 'small -> 4');
  await assertMarginsUsed('4-again', { w: W, h: H }, 'small -> 4');
  assert.deepEqual(await liveUrls(), await page.evaluate(() => px.urls('4')), 'small -> 4 draws the original 4 page');

  // "1 בדף" דורש שלט אחד: מורידים את מילקי, המצב הקטן נשמר בדרך
  await layoutBtn(L2S).click(); assert.equal((await state()).small, true);
  await role('sign-back').click();
  await role('sign-pick', '[data-id="pr_milky"]').click();
  await role('sign-next').click();
  s = await state(); assert.equal(s.signs.length, 1); assert.equal(s.small, true);
  await assertButtons(L2S, 'one sign, small');
  await assertSmallPages('2small-one', 1, 'one sign, small');
  await layoutBtn(L1).click();
  s = await state(); assert.equal(s.perPage, 1); assert.equal(s.small, false); assert.equal(s.smallPage, false);
  await assertButtons(L1, 'small -> 1');
  await assertMarginsUsed('1', { w: H, h: W }, 'small -> 1 (landscape)');
  await savePages('1', '1');
});

test('three signs: "2 בדף (קטן)" is refused like "2 בדף (גדול)"', async () => {
  await layoutBtn(L4).click();
  await role('sign-back').click();
  await role('sign-pick', '[data-id="pr_milky"]').click();
  await role('sign-pick', '[data-id="pr_cheese"]').click();
  await role('sign-next').click();
  let s = await state(); assert.equal(s.signs.length, 3); assert.equal(s.perPage, 4);
  await assertButtons(L4, 'three signs');
  const threeUrls = await liveUrls();
  for (const i of [L2S, L2B]) {
    await page.evaluate(() => { document.getElementById('toastMsg').textContent = ''; });
    await layoutBtn(i).click();
    s = await state(); assert.equal(s.perPage, 4, LAYOUT[i].label + ' with 3 signs keeps 4'); assert.equal(s.small, false);
    await assertButtons(L4, LAYOUT[i].label + ' with 3 signs');
    assert.equal(await page.locator('#toastMsg').textContent(), 'בחרת 3 מבצעים — הסר כדי לעבור ל-2 בדף');
    assert.equal(await page.locator('#toast').evaluate(el => el.classList.contains('hidden')), false, 'toast shown');
    assert.deepEqual(await liveUrls(), threeUrls, LAYOUT[i].label + ' with 3 signs leaves the page as is');
  }
});

test('no page errors and no network', () => {
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  console.log('sign small layout: images in ' + shots);
});
