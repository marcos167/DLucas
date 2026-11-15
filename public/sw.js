/*
 * DLucas Express · casca offline do aplicativo dos entregadores.
 *
 * Guarda apenas a casca (index.html) e os arquivos estáticos com hash em
 * /assets/. Nenhuma chamada ao servidor de dados passa por aqui: registros do
 * entregador ficam na fila do aparelho (IndexedDB) e são enviados pelo
 * próprio aplicativo.
 */
const VERSION = 'v1'
const SHELL = `dlucas-shell-${VERSION}`
const ASSETS = `dlucas-assets-${VERSION}`
const SHELL_URL = '/index.html'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((cache) => cache.add(new Request(SHELL_URL, { cache: 'reload' })))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((key) => key.startsWith('dlucas-') && key !== SHELL && key !== ASSETS).map((key) => caches.delete(key)))
    await self.clients.claim()
  })())
})

// O aplicativo informa os arquivos que já carregou para que fiquem disponíveis sem rede.
self.addEventListener('message', (event) => {
  const data = event.data
  if (!data || data.type !== 'CACHE_URLS' || !Array.isArray(data.urls)) return
  event.waitUntil((async () => {
    const cache = await caches.open(ASSETS)
    await Promise.all(data.urls
      .filter((url) => typeof url === 'string' && url.startsWith('/assets/'))
      .map(async (url) => {
        if (await cache.match(url)) return
        try {
          const response = await fetch(url)
          if (response.ok) await cache.put(url, response)
        } catch {
          // sem rede agora: o arquivo entra no cache na próxima visita
        }
      }))
  })())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/apresentacao')) return

  // Navegação: sempre a versão da rede; sem rede, a casca guardada.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request)
        if (response.ok && (response.headers.get('content-type') || '').includes('text/html')) {
          const cache = await caches.open(SHELL)
          await cache.put(SHELL_URL, response.clone())
        }
        return response
      } catch (error) {
        const cached = await caches.match(SHELL_URL)
        if (cached) return cached
        throw error
      }
    })())
    return
  }

  // Arquivos com hash no nome nunca mudam: cache primeiro.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cache = await caches.open(ASSETS)
      const cached = await cache.match(request)
      if (cached) return cached
      const response = await fetch(request)
      if (response.ok) await cache.put(request, response.clone())
      return response
    })())
  }
})
