// Service worker do Caderninho: deixa o app abrir mesmo sem internet.
// Estratégia: tenta a internet primeiro (assim as atualizações chegam sozinhas)
// e, se não houver internet, usa a cópia guardada no aparelho.
// Quando mudar algum arquivo do app, troque o número da VERSAO abaixo.
const VERSAO = 'caderninho-v1';
const ARQUIVOS = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'manifest.json',
  'icon-192.png',
  'icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(nomes => Promise.all(nomes.filter(n => n !== VERSAO).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then(resp => {
        const copia = resp.clone();
        caches.open(VERSAO).then(c => c.put(req, copia));
        return resp;
      })
      .catch(() => caches.match(req).then(r => r || caches.match('index.html')))
  );
});
