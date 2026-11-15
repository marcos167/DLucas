// Servidor local que imita a API do Supabase sobre um PostgreSQL em memória
// (PGlite) carregado com as migrações reais e usuários fictícios.
//
// Serve para experimentar e homologar o módulo de distribuição no navegador
// sem tocar em nenhum projeto Supabase:
//
//   npx vite-node scripts/local-backend.mts            (porta 54321)
//   VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=local npm run dev
//
// Com LOCAL_APP_DIR apontando para um build feito com
// VITE_SUPABASE_URL=http://supabase.local.invalid, o mesmo processo serve a
// aplicação e a API na mesma origem (útil atrás de um proxy de pré-visualização).
//
// Todos os usuários entram com a senha informada em LOCAL_BACKEND_PASSWORD
// (os dados somem ao encerrar o processo).
import { existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { backend, COURIERS, startBackend, USERS } from '../src/test/logistics-backend'
import { createSupabaseEmulator } from '../src/test/supabase-emulator'

const port = Number(process.env.PORT ?? 54321)
const secret = process.env.LOCAL_BACKEND_PASSWORD
if (!secret) {
  console.error('Defina LOCAL_BACKEND_PASSWORD (a senha de todos os usuários fictícios).')
  process.exit(1)
}

const db = await startBackend()
// no navegador o usuário vem do token de cada requisição, não de uma variável do teste
const emulator = createSupabaseEmulator(db, { password: secret })
backend.emulator = emulator

const appDir = process.env.LOCAL_APP_DIR ? resolve(process.env.LOCAL_APP_DIR) : null
const PLACEHOLDER = 'http://supabase.local.invalid'
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
}

/** Arquivos do build; qualquer rota desconhecida recebe a casca da aplicação. */
function serveApp(pathname: string, origin: string): { status: number; type: string; body: Buffer } | null {
  if (!appDir) return null
  let file = normalize(join(appDir, decodeURIComponent(pathname)))
  if (!file.startsWith(appDir)) return { status: 403, type: 'text/plain', body: Buffer.from('proibido') }
  if (!existsSync(file) || statSync(file).isDirectory()) {
    if (pathname.startsWith('/assets/')) return { status: 404, type: 'text/plain', body: Buffer.from('não encontrado') }
    file = join(appDir, 'index.html')
  }
  const type = TYPES[extname(file)] ?? 'application/octet-stream'
  const raw = readFileSync(file)
  // o build não conhece o endereço público: a API fica na mesma origem de quem pediu
  const body = extname(file) === '.js' ? Buffer.from(raw.toString('utf8').replaceAll(PLACEHOLDER, origin)) : raw
  return { status: 200, type, body }
}

createServer(async (incoming, outgoing) => {
  try {
    const host = incoming.headers.host ?? `localhost:${port}`
    const pathname = (incoming.url ?? '/').split('?')[0]
    if (!/^\/(rest|auth|storage)\/v1\//.test(pathname)) {
      const local = /^(localhost|127\.|\[::1\])/.test(host)
      const proto = String(incoming.headers['x-forwarded-proto'] ?? (local ? 'http' : 'https')).split(',')[0]
      const file = serveApp(pathname, `${proto}://${host}`)
      if (file) {
        outgoing.writeHead(file.status, { 'Content-Type': file.type, 'Cache-Control': 'no-cache' })
        outgoing.end(file.body)
        return
      }
    }
    const url = `http://${host}${incoming.url ?? '/'}`
    const hasBody = incoming.method !== 'GET' && incoming.method !== 'HEAD'
    const request = new Request(url, {
      method: incoming.method,
      headers: incoming.headers as Record<string, string>,
      body: hasBody ? (Readable.toWeb(incoming) as ReadableStream) : undefined,
      // @ts-expect-error exigido pelo Node para corpo em fluxo
      duplex: 'half',
    })
    const response = await emulator.fetch(request)
    outgoing.writeHead(response.status, Object.fromEntries(response.headers))
    outgoing.end(Buffer.from(await response.arrayBuffer()))
  } catch (error) {
    outgoing.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
    outgoing.end(JSON.stringify({ message: (error as Error).message }))
  }
}).listen(port, '0.0.0.0', () => {
  console.log(`API local em http://localhost:${port}`)
  console.log('Usuários fictícios (mesma senha para todos):')
  console.log('  admin@teste.local · despacho@teste.local · financeiro@teste.local · ana@teste.local · bruno@teste.local')
  console.log(`  entregadores: ${Object.values(COURIERS).length} · perfis: ${Object.keys(USERS).length}`)
})
