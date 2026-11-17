// תעודה במבנה של תעודת 10.11.2026 (סינתטית, בלי נתונים פרטיים) — אותו מבנה כמו ב-long-receipt-cards.test.mjs: 11 שורות, ושבע החלטות
// שמחכות לעובד — חמישה זיהויים לפי המחיר, מחלוקת אחת בין הקריאות (שורה 10), ושורה אחת בלי מוצר (שורה 11: הקוד אינו במאגר).
// משמש את paper-gate.test.mjs ואת paper-gate-browser.mjs (v165).
const r2 = n => Math.round(n * 100) / 100;
const LONG_PRODUCTS = [
  { id: 'milk', name: 'חלב 3% ועדת מהדרין בקרטון 1 ליטר', barcode: '7290004131074', price: 5.36 },
  { id: 'vanilla', name: 'משקה חלב וניל 2% קרטון 1 ליטר', barcode: '7290116934273', price: 6.7 },
  { id: 'soy', name: 'משקה סויה מועשר 1 ליטר', barcode: '7290004125578', price: 7.32 },
  { id: 'cream', name: 'שמנת חמוצה 15% רבנות 200 מ"ל', barcode: '72963746', price: 2.1 },
  { id: 'cream2', name: 'שמנת חמוצה 15% מהדרין 200 מ"ל', barcode: '7290004125455', price: 2.1 },
  { id: 'prili', name: 'פרילי תות 125 גרם', barcode: '72961506', price: 2.58 },
  { id: 'prili500', name: 'פרילי תות 500 גרם', barcode: '7290000044712', price: 8.32 },
  { id: 'forest', name: 'יופלה פירות יער בשמנת 3% 150 גרם', barcode: '7290004130916', price: 3.69 },
  { id: 'greek', name: 'יופלה יוגורט בסגנון יווני עם תות 140 גרם', barcode: '7290116936369', price: 3.69 },
  { id: 'emek', name: 'עמק סמי מעדנייה כשרות מהדרין 400 גרם', barcode: '7290000057118', price: 19.6 },
  { id: 'yellow', name: "גבינה צהובה עמק 28% 400 ג' ואקום 400 גרם", barcode: '7290116935638', price: 19.6 },
  { id: 'crate', name: 'ארגז חלב ירוק', barcode: '59259', price: 15.1 },
  { id: 'cottage5', name: "קוטג' ועדת מהדרין 5% 250 גרם", barcode: '7290004127329', price: 4.6 },
  { id: 'cottage9', name: "קוטג' ועדת מהדרין 9% 250 גרם", barcode: '7290004127336', price: 4.6 }
];
const read = (stage, value, selected = false) => ({ stage, value, ...(selected ? { selected: true } : {}) });
const unseen = stage => ({ stage, value: null, seen: false, unmatched: 'numbers_differ' });
const agreement = (kind, code, stages) => ({ code, kind, stages });
const codeField = (reads, agreed, other) => ({ field: 'code', selected: reads.find(r => r.selected).value, other, confirmed: 0, reads, agreement: agreed });
const swap = (quantity, unit) => [{ field: 'quantity', selected: quantity, other: unit, confirmed: 0 }, { field: 'unitPriceExVat', selected: unit, other: quantity, confirmed: 0 }];
// הקריאה שנבחרה (המודל החזק) — מה שהיא קראה בנייר, שורה-שורה, כמו ב-10.11.
const lines = [
  { lineNumber: 1, code: '4131074', description: 'חלב תנובה קרו מר', quantity: 96, unitPriceExVat: 5.36 },
  { lineNumber: 2, code: '16934273', description: 'חלב ניגל תנובה 2%', quantity: 8, unitPriceExVat: 6.7, promoStar: true },
  { lineNumber: 3, code: '4125578', description: 'אשל 1.7% ל תנובה', quantity: 8, unitPriceExVat: 7.32 },
  { lineNumber: 4, code: '12963746', description: 'שמנת 15% סמל', quantity: 30, unitPriceExVat: 2.1 },
  { lineNumber: 5, code: null, description: 'פרילי 500', quantity: 12, unitPriceExVat: 2.58 },
  { lineNumber: 6, code: '44712', description: 'פרילי 500', quantity: 6, unitPriceExVat: 8.32 },
  { lineNumber: 7, code: '1303916', description: 'יופ. טורט', quantity: 12, unitPriceExVat: 3.69 },
  { lineNumber: 8, code: '117118', description: 'טונה 400גר פרות', quantity: 9, unitPriceExVat: 19.6 },
  { lineNumber: 9, code: '594259', description: 'מארז חלבי 9%', quantity: 9, unitPriceExVat: 15.1 },
  { lineNumber: 10, code: '4127336', description: "קוטג' 250 מ. מהדרין", quantity: 18, unitPriceExVat: 4.6 },
  { lineNumber: 11, code: '4136916', description: 'יופ.שזיף 3%', quantity: 12, unitPriceExVat: 3.69 }
];
const disputedRows = [
  { rowIndex: 0, lineNumber: 1, code: '4131074', fields: swap(96, 5.36) },
  { rowIndex: 1, lineNumber: 2, code: '16934273', fields: swap(8, 6.7) },
  { rowIndex: 2, lineNumber: 3, code: '4125578', fields: [codeField([read('consensus_escalation', '4125578', true), unseen('consensus_1'), unseen('consensus_2'), read('second_strong_read', '4125578')],
    agreement('strong_strong', '4125578', ['consensus_escalation', 'second_strong_read']), '1635578')].concat(swap(8, 7.32)) },
  // שורה 4: שתי החזקות קראו 12963746 (הנייר: 72963746), הזולה 72963476 — אף קריאה לא קראה נכון; תיקון ספרה מגיע לשמנת רבנות.
  { rowIndex: 3, lineNumber: 4, code: '12963746', fields: [codeField([read('consensus_escalation', '12963746', true), unseen('consensus_1'), read('consensus_2', '72963476'), read('second_strong_read', '12963746')],
    agreement('strong_strong', '12963746', ['consensus_escalation', 'second_strong_read']), '72963476')] },
  // שורה 5: המודל החזק לא קרא קוד ולקח את השם של השורה הבאה; הזולה קראה 72961506 — פרילי תות 125.
  { rowIndex: 4, lineNumber: 5, code: null, fields: [codeField([read('consensus_escalation', null, true), unseen('consensus_1'), read('consensus_2', '72961506'), read('second_strong_read', null)], null, '72961506')] },
  // שורה 7: `other` הוא הקוד של הזולה שבאותו מיקום (41309316, לא במאגר); הקוד הנכון 4130916 יושב ב-reads.
  { rowIndex: 6, lineNumber: 7, code: '1303916', fields: [codeField([read('consensus_escalation', '1303916', true), unseen('consensus_1'), read('consensus_2', '4130916'), read('second_strong_read', '130916')], null, '41309316')] },
  // שורה 8: שתי החזקות קראו 117118 (הנייר: 57118), הזולה 57118 — עמק סמי, ₪19.60 בדיוק.
  { rowIndex: 7, lineNumber: 8, code: '117118', fields: [codeField([read('consensus_escalation', '117118', true), unseen('consensus_1'), read('consensus_2', '57118'), read('second_strong_read', '117118')],
    agreement('strong_strong', '117118', ['consensus_escalation', 'second_strong_read']), '57118')] },
  { rowIndex: 8, lineNumber: 9, code: '594259', fields: [codeField([read('consensus_escalation', '594259', true), unseen('consensus_1'), read('consensus_2', '59259'), read('second_strong_read', '59459')], null, '59259')] },
  // שורה 10: שכנים באותו מחיר — קוטג' 9% נבחר, הזולה קראה קוטג' 5%, הקריאה השלישית קוד שלישי: שאלה.
  { rowIndex: 9, lineNumber: 10, code: '4127336', fields: [codeField([read('consensus_escalation', '4127336', true), read('consensus_1', '4127329'), read('consensus_2', '4172923')], null, '4127329')] },
  // שורה 11: שתי הזולות הסכימו על 4136619 (אינו במאגר), החזקה 4136916 (אינו במאגר): הסכמה בין קריאות — בלי ניחושים (כלל 150/5).
  { rowIndex: 10, lineNumber: 11, code: '4136916', fields: [codeField([read('consensus_escalation', '4136916', true), read('consensus_1', '4136619'), read('consensus_2', '4136619')],
    agreement('cheap_cheap', '4136619', ['consensus_1', 'consensus_2']), '4136619')] }
].map(row => ({ noteIndex: 0, description: lines[row.rowIndex].description, ...row }));

// מבצע במאגר על קוטג' 5% בלבד: שמירה של כלל 109 שנכשלת, ולכן שכן באותו מחיר (שורה 10) נשאר שאלה לעובד
// — כמו שישה קוטג'ים ב-₪4.60 בחנות אמיתית.
const cottagePromo = { id: 'p5', name: "קוטג' 5% במבצע", pct: 10, start: '2026-11-01', end: '2026-11-30', minQty: 1, minUnit: 'unit', type: 'receipt', productIds: ['cottage5'] };
// הנחת מבצעים בסיכום התעודה (כמו ₪8.78 ב-10.11) בלי מבצע במאגר לשורה המסומנת: בדיקת המבצעים ממתינה,
// ולכן זיהוי לפי המחיר מחכה לאישור (כלל 119 מקבל אותו לבד רק כשאין הנחה שממתינה).
const DISCOUNT = 8.78;
function longFixture({ catalog = LONG_PRODUCTS, promos = [cottagePromo] } = {}) {
  const rows = lines.map(row => ({ promoStar: false, ...row, section: 'items', sourcePage: 1, confidence: .8, lineTotalExVat: r2(row.quantity * row.unitPriceExVat) }));
  const gross = r2(rows.reduce((n, r) => n + r.lineTotalExVat, 0));
  const subtotal = r2(gross - DISCOUNT);
  const consensus = { attempted: true, reads: 2, completedReads: 2, agreed: false, reason: 'reads_disagree', escalated: true, model: 'gpt-5.6-luna',
    escalationModel: 'gpt-5.6-terra', escalationSelected: true, escalationError: null, unverifiedSingleRead: false, strongReadSelection: true, codeAgreement: true,
    diffs: [], disputedRows, missingRows: [], docDateUnconfirmed: [],
    secondStrongRead: { outcome: 'code_agreed', stage: 'second_strong_read', model: 'gpt-5.6-terra', requestId: 'fixture', asked: 6, usage: null, closed: [], open: [], notAsked: [], differences: [], codes: [] } };
  const attempts = [
    { stage: 'consensus_1', requestedModel: 'gpt-5.6-luna', selected: false, outcome: 'read', paperError: 0 },
    { stage: 'consensus_2', requestedModel: 'gpt-5.6-luna', selected: false, outcome: 'read', paperError: 0 },
    { stage: 'consensus_escalation', requestedModel: 'gpt-5.6-terra', selected: true, outcome: 'read', paperError: 0 },
    { stage: 'second_strong_read', requestedModel: 'gpt-5.6-terra', selected: false, outcome: 'read' }];
  return { products: catalog, promos, items: [],
    paper: { ok: true, serviceVersion: 20, model: 'gpt-5.6-terra', requestId: 'long-receipt-fixture', consensus,
      scanAudit: { version: 1, attempts, secondStrongRead: consensus.secondStrongRead }, checksumRetryAttempted: false, checksumRetryModel: null,
      scan: { warnings: [], documents: [{ noteIndex: 0, docType: 'invoice', docDate: '10/11/2026', pageCount: 1, vatPct: 18, rows, confidence: .8,
        itemsSectionTotalExVat: gross, itemsPrintedLines: rows.length, printedLines: rows.length, returnsSectionTotalExVat: null, returnsPrintedLines: null,
        promoDiscountExVat: DISCOUNT, documentDiscountExVat: DISCOUNT, subtotalExVat: subtotal, netToChargeExVat: subtotal, warnings: [] }] } } };
}
export { LONG_PRODUCTS, longFixture, cottagePromo };
