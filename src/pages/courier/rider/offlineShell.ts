/**
 * Liga a casca offline do aplicativo dos entregadores.
 *
 * O service worker só é registrado quando um entregador abre a área dele:
 * visitantes do site e a equipe do painel não são afetados. Depois de
 * registrado, os arquivos já carregados (e as telas de rota, carregadas aqui
 * de propósito) ficam guardados para abrir o aplicativo sem internet.
 */
export async function enableOfflineShell(preload: Array<() => Promise<unknown>>): Promise<void> {
  if (import.meta.env.DEV || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  try {
    await navigator.serviceWorker.register('/sw.js')
    const registration = await navigator.serviceWorker.ready
    await Promise.allSettled(preload.map((load) => load()))

    const urls = new Set<string>()
    const add = (value: string | null | undefined) => {
      if (!value) return
      const url = new URL(value, window.location.href)
      if (url.origin === window.location.origin && url.pathname.startsWith('/assets/')) urls.add(url.pathname)
    }
    for (const entry of performance.getEntriesByType('resource')) add(entry.name)
    document.querySelectorAll<HTMLScriptElement>('script[src]').forEach((node) => add(node.src))
    document.querySelectorAll<HTMLLinkElement>('link[href]').forEach((node) => add(node.href))
    registration.active?.postMessage({ type: 'CACHE_URLS', urls: [...urls] })
  } catch {
    // sem service worker o aplicativo continua funcionando; só não reabre sem internet
  }
}
