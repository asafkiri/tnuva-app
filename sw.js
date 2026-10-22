// גרסה 146 — השורה שתוקנה ממסך החוסרים נשארת ירוקה במקומה; טעית? מורידים את המספר והחוסר חוזר
// קליטת תנובה — service worker v1 (מעבר-דרך, בלי מטמון)
// בכוונה אין כאן שום cache בשלב הזה: אנחנו בצפי לגרסאות תכופות,
// ומטמון ישן היה מציג גרסה קודמת. ההתקנה כאפליקציה עובדת גם כך.
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));
self.addEventListener('fetch', e => {});
