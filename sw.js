// גרסה 166 — סגירת התעודה אינה מחכה למנתח; ושמירה שלא אושרה אינה נועלת את הקליטה בלי הסבר ("אשר וקלוט" בודק ומנסה שוב בעצמו)
// קליטת תנובה — service worker v1 (מעבר-דרך, בלי מטמון)
// בכוונה אין כאן שום cache בשלב הזה: אנחנו בצפי לגרסאות תכופות,
// ומטמון ישן היה מציג גרסה קודמת. ההתקנה כאפליקציה עובדת גם כך.
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));
self.addEventListener('fetch', e => {});
