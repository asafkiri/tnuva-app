// גרסה 150 — הסכמת קריאות על הקוד: מחלוקת שקריאה חזקה וזולה, או שתי חזקות, הסכימו עליה נסגרת לבד כשהמחיר מאשר
// קליטת תנובה — service worker v1 (מעבר-דרך, בלי מטמון)
// בכוונה אין כאן שום cache בשלב הזה: אנחנו בצפי לגרסאות תכופות,
// ומטמון ישן היה מציג גרסה קודמת. ההתקנה כאפליקציה עובדת גם כך.
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));
self.addEventListener('fetch', e => {});
