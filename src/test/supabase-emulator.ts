import type { PGlite, Transaction } from '@electric-sql/pglite'

/**
 * Emulador mínimo da API do Supabase sobre PostgreSQL em memória (PGlite).
 *
 * Serve para exercitar o cliente real (`@supabase/supabase-js`) e as funções
 * de `src/lib` contra o SQL real das migrações — RLS, grants, triggers e
 * funções — sem tocar em nenhum projeto Supabase. Cada requisição roda em
 * uma transação com o papel `authenticated` (ou `anon`) e o usuário do token.
 *
 * Cobre o que a aplicação usa, não a API inteira:
 *   REST     select (filtros, ordem, limite, contagem, recursos embutidos),
 *            insert, upsert, update, delete e chamadas de função (rpc)
 *   Auth     login por senha, renovação, usuário atual e saída
 *   Storage  envio de arquivo, URL assinada e download
 * Realtime não é emulado.
 */

export interface SupabaseEmulator {
  fetch: typeof fetch
  /** arquivos enviados ao Storage, por `bucket/caminho` */
  files: Map<string, Blob>
}

export interface EmulatorOptions {
  /** senha aceita no login de qualquer usuário existente */
  password?: string
  /** identifica o usuário sem token (testes); `undefined` cai no token da requisição */
  userFromRequest?: (request: Request) => string | null | undefined
}

class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details: string | null = null) {
    super(message)
  }
}

interface TableInfo {
  columns: Map<string, string>
  primaryKey: string[]
}

const IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/
const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'])
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,POST,PATCH,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': 'Content-Range',
}

function quote(name: string): string {
  if (!IDENTIFIER.test(name)) throw new HttpError(400, 'PGRST100', `Identificador inválido: ${name}`)
  return `"${name}"`
}

function base64Url(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64url')
}

function reply(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  const text = body === null || body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body)
  return new Response(status === 204 ? null : text, {
    status,
    headers: { ...CORS, ...(text === null ? {} : { 'Content-Type': 'application/json; charset=utf-8' }), ...headers },
  })
}

/** Divide por vírgula fora de parênteses e de aspas. */
function splitTop(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let quoted = false
  let current = ''
  for (const char of text) {
    if (char === '"') quoted = !quoted
    if (!quoted && char === '(') depth++
    if (!quoted && char === ')') depth--
    if (char === ',' && depth === 0 && !quoted) { parts.push(current); current = '' } else current += char
  }
  if (current !== '') parts.push(current)
  return parts
}

const unquote = (value: string) => (value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value)

export function createSupabaseEmulator(db: PGlite, options: EmulatorOptions = {}): SupabaseEmulator {
  const password = options.password ?? 'senha-local'
  const files = new Map<string, Blob>()
  const tables = new Map<string, TableInfo>()

  function tokenFor(user: { id: string; email: string }): string {
    const now = Math.floor(Date.now() / 1000)
    return [
      base64Url(JSON.stringify({ alg: 'none', typ: 'JWT' })),
      base64Url(JSON.stringify({
        sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 3600,
      })),
      'local',
    ].join('.')
  }

  function userIdFrom(request: Request): string | null {
    const forced = options.userFromRequest?.(request)
    if (forced !== undefined) return forced
    const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
    const payload = token.split('.')[1]
    if (!payload) return null
    try {
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub?: string; role?: string }
      return claims.role === 'authenticated' && claims.sub ? claims.sub : null
    } catch {
      return null
    }
  }

  function asUser<T>(userId: string | null, action: (tx: Transaction) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
      await tx.exec(userId ? 'set local role authenticated' : 'set local role anon')
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ''])
      return action(tx)
    }) as Promise<T>
  }

  async function tableInfo(tx: Transaction, table: string): Promise<TableInfo> {
    const cached = tables.get(table)
    if (cached) return cached
    quote(table)
    const columns = await tx.query<{ attname: string; type: string }>(
      `select a.attname, format_type(a.atttypid, a.atttypmod) as type
         from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = $1 and a.attnum > 0 and not a.attisdropped`, [table])
    if (columns.rows.length === 0) {
      throw new HttpError(404, 'PGRST205', `Could not find the table 'public.${table}' in the schema cache`)
    }
    const key = await tx.query<{ attname: string }>(
      `select a.attname from pg_index i
         join pg_class c on c.oid = i.indrelid join pg_namespace n on n.oid = c.relnamespace
         join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
        where n.nspname = 'public' and c.relname = $1 and i.indisprimary`, [table])
    const info = {
      columns: new Map(columns.rows.map((row) => [row.attname, row.type])),
      primaryKey: key.rows.map((row) => row.attname),
    }
    tables.set(table, info)
    return info
  }

  function condition(info: TableInfo, alias: string, column: string, expression: string, values: unknown[]): string {
    const type = info.columns.get(column)
    if (!type) throw new HttpError(400, 'PGRST204', `Could not find the '${column}' column in the schema cache`)
    let negate = false
    let rest = expression
    if (rest.startsWith('not.')) { negate = true; rest = rest.slice(4) }
    const dot = rest.indexOf('.')
    const operator = dot < 0 ? rest : rest.slice(0, dot)
    const value = dot < 0 ? '' : rest.slice(dot + 1)
    const ref = `${alias}.${quote(column)}`
    const param = (item: string, cast = type) => { values.push(item); return `($${values.length}::text)::${cast}` }
    const comparisons: Record<string, string> = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }
    let sql: string
    if (comparisons[operator]) sql = `${ref} ${comparisons[operator]} ${param(unquote(value))}`
    else if (operator === 'like' || operator === 'ilike') {
      sql = `${ref}::text ${operator} ${param(value.replace(/\*/g, '%'), 'text')}`
    } else if (operator === 'is') {
      if (!['null', 'true', 'false'].includes(value)) throw new HttpError(400, 'PGRST100', `is.${value} não suportado`)
      sql = `${ref} is ${value}`
    } else if (operator === 'in') {
      const items = splitTop(value.replace(/^\(|\)$/g, '')).map(unquote)
      sql = items.length ? `${ref} in (${items.map((item) => param(item)).join(', ')})` : 'false'
    } else {
      throw new HttpError(400, 'PGRST100', `Operador não suportado pelo emulador: ${operator}`)
    }
    return negate ? `not (${sql})` : sql
  }

  function whereClause(info: TableInfo, alias: string, params: URLSearchParams, values: unknown[]): string {
    const clauses: string[] = []
    for (const [key, raw] of params) {
      if (RESERVED.has(key)) continue
      if (key === 'or') {
        const parts = splitTop(raw.replace(/^\(|\)$/g, '')).map((part) => {
          const dot = part.indexOf('.')
          return condition(info, alias, part.slice(0, dot), part.slice(dot + 1), values)
        })
        clauses.push(`(${parts.join(' or ')})`)
      } else {
        clauses.push(condition(info, alias, key, raw, values))
      }
    }
    return clauses.length ? ` where ${clauses.join(' and ')}` : ''
  }

  async function embed(
    tx: Transaction, baseTable: string, alias: string, name: string, target: string, hint: string | undefined, inner: string,
    depth: number,
  ): Promise<string> {
    const targetInfo = await tableInfo(tx, target)
    const relations = await tx.query<{ conname: string; source: string; source_col: string; target_col: string }>(
      `select con.conname, src.relname as source,
              (select attname from pg_attribute where attrelid = con.conrelid and attnum = con.conkey[1]) as source_col,
              (select attname from pg_attribute where attrelid = con.confrelid and attnum = con.confkey[1]) as target_col
         from pg_constraint con
         join pg_class src on src.oid = con.conrelid
         join pg_class tgt on tgt.oid = con.confrelid
         join pg_namespace n on n.oid = src.relnamespace
        where con.contype = 'f' and n.nspname = 'public'
          and ((src.relname = $1 and tgt.relname = $2) or (src.relname = $2 and tgt.relname = $1))`,
      [baseTable, target])
    const candidates = relations.rows.filter((row) => !hint || row.conname === hint || row.source_col === hint)
    if (candidates.length === 0) {
      throw new HttpError(400, 'PGRST200', `Could not find a relationship between '${baseTable}' and '${target}' in the schema cache`)
    }
    if (candidates.length > 1) {
      throw new HttpError(300, 'PGRST201', `Could not embed because more than one relationship was found for '${baseTable}' and '${target}'`)
    }
    // cada nível tem os seus apelidos: a seleção interna pode trazer outros recursos embutidos
    const x = `x${depth}`
    const e = `e${depth}`
    const columns = await selectList(tx, target, targetInfo, x, inner.trim() === '' ? '*' : inner, depth + 1)
    const relation = candidates[0]
    if (relation.source === baseTable) {
      return `(select row_to_json(${e}) from (select ${columns} from public.${quote(target)} ${x}
                where ${x}.${quote(relation.target_col)} = ${alias}.${quote(relation.source_col)}) ${e}) as ${quote(name)}`
    }
    return `(select coalesce(json_agg(row_to_json(${e})), '[]'::json) from (select ${columns} from public.${quote(target)} ${x}
              where ${x}.${quote(relation.source_col)} = ${alias}.${quote(relation.target_col)}) ${e}) as ${quote(name)}`
  }

  async function selectList(
    tx: Transaction, table: string, info: TableInfo, alias: string, select: string | null, depth = 0,
  ): Promise<string> {
    if (!select || select.trim() === '*') return `${alias}.*`
    const parts: string[] = []
    for (const raw of splitTop(select.replace(/\s+/g, ''))) {
      if (raw === '*') { parts.push(`${alias}.*`); continue }
      const embedded = /^(?:([a-zA-Z_]\w*):)?([a-zA-Z_]\w*)(?:!(\w+))?\((.*)\)$/.exec(raw)
      if (embedded) {
        parts.push(await embed(tx, table, alias, embedded[1] ?? embedded[2], embedded[2], embedded[3], embedded[4], depth))
        continue
      }
      const plain = /^(?:([a-zA-Z_]\w*):)?([a-zA-Z_]\w*)$/.exec(raw)
      if (!plain || !info.columns.has(plain[2])) {
        throw new HttpError(400, 'PGRST204', `Could not find the '${raw}' column of '${table}' in the schema cache`)
      }
      parts.push(`${alias}.${quote(plain[2])}${plain[1] ? ` as ${quote(plain[1])}` : ''}`)
    }
    return parts.join(', ')
  }

  function orderClause(info: TableInfo, alias: string, order: string | null): string {
    if (!order) return ''
    const parts = order.split(',').map((item) => {
      const [column, ...modifiers] = item.split('.')
      if (!info.columns.has(column)) throw new HttpError(400, 'PGRST204', `Coluna de ordenação desconhecida: ${column}`)
      const direction = modifiers.includes('desc') ? 'desc' : 'asc'
      const nulls = modifiers.includes('nullsfirst') ? ' nulls first' : modifiers.includes('nullslast') ? ' nulls last' : ''
      return `${alias}.${quote(column)} ${direction}${nulls}`
    })
    return ` order by ${parts.join(', ')}`
  }

  function shape(request: Request, body: string, status: number, headers: Record<string, string> = {}): Response {
    if ((request.headers.get('accept') ?? '').includes('vnd.pgrst.object')) {
      const rows = JSON.parse(body) as unknown[]
      if (rows.length !== 1) {
        return reply(406, {
          code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned',
          details: `The result contains ${rows.length} rows`, hint: null,
        })
      }
      return reply(status, rows[0], headers)
    }
    return reply(status, body, headers)
  }

  async function rest(request: Request, url: URL, userId: string | null): Promise<Response> {
    const path = url.pathname.replace(/^\/rest\/v1\//, '')
    const prefer = request.headers.get('prefer') ?? ''
    const params = url.searchParams

    if (path.startsWith('rpc/')) {
      const name = path.slice(4)
      quote(name)
      const args = request.method === 'POST' ? (await request.json().catch(() => ({}))) as Record<string, unknown> : {}
      return asUser(userId, async (tx) => {
        const found = await tx.query<{ names: string[] | null; types: string[] | null; defaults: number }>(
          `select p.proargnames as names, p.pronargdefaults as defaults,
                  (select array_agg(format_type(a.type_oid, null) order by a.position)
                     from unnest(p.proargtypes::oid[]) with ordinality a(type_oid, position)) as types
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = $1`, [name])
        const signature = found.rows[0]
        const names = signature?.names ?? []
        const types = signature?.types ?? []
        const required = names.slice(0, names.length - (signature?.defaults ?? 0))
        const given = Object.keys(args)
        if (!signature || given.some((key) => !names.includes(key)) || required.some((key) => !given.includes(key))) {
          throw new HttpError(404, 'PGRST202',
            `Could not find the function public.${name}(${given.join(', ')}) in the schema cache`)
        }
        // mesma conversão do PostgREST: o corpo JSON vira um registro tipado pelos parâmetros
        const sql = given.length === 0
          ? `select to_json(public.${quote(name)}())::text as body`
          : `select to_json(public.${quote(name)}(${given.map((key) => `${quote(key)} => _.${quote(key)}`).join(', ')}))::text as body
               from json_to_record($1::text::json) as _(${given.map((key) => `${quote(key)} ${types[names.indexOf(key)]}`).join(', ')})`
        const result = await tx.query<{ body: string | null }>(sql, given.length ? [JSON.stringify(args)] : [])
        return reply(200, result.rows[0]?.body ?? 'null')
      })
    }

    const table = path
    return asUser(userId, async (tx) => {
      const info = await tableInfo(tx, table)
      const representation = prefer.includes('return=representation')

      if (request.method === 'GET' || request.method === 'HEAD') {
        const values: unknown[] = []
        const where = whereClause(info, 'b', params, values)
        const headers: Record<string, string> = {}
        if (prefer.includes('count=exact')) {
          const count = await tx.query<{ n: number }>(`select count(*)::int as n from public.${quote(table)} as b${where}`, values)
          headers['Content-Range'] = `*/${count.rows[0].n}`
        }
        if (request.method === 'HEAD') return reply(200, null, headers)
        const limit = params.get('limit') ? ` limit ${Number(params.get('limit'))}` : ''
        const offset = params.get('offset') ? ` offset ${Number(params.get('offset'))}` : ''
        const sql = `select ${await selectList(tx, table, info, 'b', params.get('select'))}
                       from public.${quote(table)} as b${where}${orderClause(info, 'b', params.get('order'))}${limit}${offset}`
        const result = await tx.query<{ body: string }>(
          `select coalesce(json_agg(row_to_json(t)), '[]'::json)::text as body from (${sql}) t`, values)
        return shape(request, result.rows[0].body, 200, headers)
      }

      if (request.method === 'POST') {
        const payload = await request.json() as Record<string, unknown> | Record<string, unknown>[]
        const rows = Array.isArray(payload) ? payload : [payload]
        const columns = params.get('columns')?.split(',').map(unquote) ?? Object.keys(rows[0] ?? {})
        for (const column of columns) {
          if (!info.columns.has(column)) {
            throw new HttpError(400, 'PGRST204', `Could not find the '${column}' column of '${table}' in the schema cache`)
          }
        }
        let conflict = ''
        if (prefer.includes('resolution=merge-duplicates')) {
          const target = params.get('on_conflict')?.split(',') ?? info.primaryKey
          const updates = columns.filter((column) => !target.includes(column))
          conflict = ` on conflict (${target.map(quote).join(', ')}) do ${updates.length
            ? `update set ${updates.map((column) => `${quote(column)} = excluded.${quote(column)}`).join(', ')}`
            : 'nothing'}`
        } else if (prefer.includes('resolution=ignore-duplicates')) {
          conflict = ' on conflict do nothing'
        }
        const list = columns.map(quote).join(', ')
        const insert = `insert into public.${quote(table)} (${list})
                        select ${list} from jsonb_populate_recordset(null::public.${quote(table)}, $1::text::jsonb)${conflict}`
        if (!representation) {
          await tx.query(insert, [JSON.stringify(rows)])
          return reply(201, null)
        }
        const result = await tx.query<{ body: string }>(
          `with b as (${insert} returning *)
           select coalesce(json_agg(row_to_json(t)), '[]'::json)::text as body
             from (select ${await selectList(tx, table, info, 'b', params.get('select'))} from b) t`,
          [JSON.stringify(rows)])
        return shape(request, result.rows[0].body, 201)
      }

      if (request.method === 'PATCH' || request.method === 'DELETE') {
        const values: unknown[] = []
        let statement: string
        if (request.method === 'PATCH') {
          const payload = await request.json() as Record<string, unknown>
          const columns = Object.keys(payload)
          for (const column of columns) {
            if (!info.columns.has(column)) {
              throw new HttpError(400, 'PGRST204', `Could not find the '${column}' column of '${table}' in the schema cache`)
            }
          }
          values.push(JSON.stringify(payload))
          statement = `update public.${quote(table)} as tgt
                          set ${columns.map((column) => `${quote(column)} = _.${quote(column)}`).join(', ')}
                         from jsonb_populate_record(null::public.${quote(table)}, $1::text::jsonb) as _`
        } else {
          statement = `delete from public.${quote(table)} as tgt`
        }
        statement += whereClause(info, 'tgt', params, values)
        if (!representation) {
          await tx.query(statement, values)
          return reply(204, null)
        }
        const result = await tx.query<{ body: string }>(
          `with b as (${statement} returning tgt.*)
           select coalesce(json_agg(row_to_json(t)), '[]'::json)::text as body
             from (select ${await selectList(tx, table, info, 'b', params.get('select'))} from b) t`, values)
        return shape(request, result.rows[0].body, 200)
      }

      throw new HttpError(405, 'PGRST117', `Método não suportado: ${request.method}`)
    })
  }

  async function auth(request: Request, url: URL, userId: string | null): Promise<Response> {
    const path = url.pathname.replace(/^\/auth\/v1\//, '')
    const describe = (user: { id: string; email: string }) => ({
      id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email,
      app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
    })
    const session = (user: { id: string; email: string }) => ({
      access_token: tokenFor(user), token_type: 'bearer', expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: `refresh.${user.id}`, user: describe(user),
    })
    const findUser = async (where: string, value: string) =>
      (await db.query<{ id: string; email: string }>(`select id::text, email from auth.users where ${where}`, [value])).rows[0]

    if (path === 'token' && request.method === 'POST') {
      const body = await request.json() as { email?: string; password?: string; refresh_token?: string }
      if (url.searchParams.get('grant_type') === 'refresh_token') {
        const user = await findUser('id = $1::uuid', String(body.refresh_token ?? '').replace(/^refresh\./, ''))
        return user ? reply(200, session(user)) : reply(400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token' })
      }
      const user = await findUser('lower(email) = lower($1)', body.email ?? '')
      if (!user || body.password !== password) {
        return reply(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' })
      }
      return reply(200, session(user))
    }
    if (path === 'user') {
      const user = userId ? await findUser('id = $1::uuid', userId) : undefined
      return user ? reply(200, describe(user)) : reply(401, { code: 401, msg: 'Invalid JWT' })
    }
    if (path === 'logout') return reply(204, null)
    return reply(404, { code: 404, msg: `Emulador: /auth/v1/${path} não implementado` })
  }

  async function storage(request: Request, url: URL, userId: string | null): Promise<Response> {
    const path = decodeURIComponent(url.pathname.replace(/^\/storage\/v1\/object\//, ''))
    const signing = path.startsWith('sign/')
    const [bucket, ...rest] = (signing ? path.slice(5) : path).split('/')
    const name = rest.join('/')
    const key = `${bucket}/${name}`

    if (signing && request.method === 'GET') {
      const file = files.get(key)
      return file
        ? new Response(file, { status: 200, headers: { ...CORS, 'Content-Type': file.type || 'application/octet-stream' } })
        : reply(404, { statusCode: '404', error: 'not_found', message: 'Object not found' })
    }
    if (signing && request.method === 'POST') {
      const visible = await asUser(userId, (tx) =>
        tx.query('select 1 from storage.objects where bucket_id = $1 and name = $2', [bucket, name]))
      if (visible.rows.length === 0) return reply(400, { statusCode: '404', error: 'not_found', message: 'Object not found' })
      return reply(200, { signedURL: `/object/sign/${key}?token=local` })
    }
    if (request.method === 'POST') {
      const type = request.headers.get('content-type') ?? ''
      let file: Blob
      if (type.includes('multipart/form-data')) {
        const form = await request.formData()
        const entry = [...form.values()].find((value): value is File => typeof value !== 'string')
        if (!entry) return reply(400, { statusCode: '400', error: 'invalid', message: 'Arquivo ausente' })
        file = entry
      } else {
        file = await request.blob()
      }
      const existing = await db.query('select 1 from storage.objects where bucket_id = $1 and name = $2', [bucket, name])
      if (existing.rows.length > 0) {
        return reply(400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' })
      }
      await asUser(userId, (tx) =>
        tx.query('insert into storage.objects (bucket_id, name) values ($1, $2)', [bucket, name]))
      files.set(key, file)
      return reply(200, { Key: key, Id: key })
    }
    return reply(404, { statusCode: '404', error: 'not_found', message: `Emulador: storage ${request.method} não implementado` })
  }

  async function handle(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    const url = new URL(request.url)
    const userId = userIdFrom(request)
    try {
      if (url.pathname.startsWith('/rest/v1/')) return await rest(request, url, userId)
      if (url.pathname.startsWith('/auth/v1/')) return await auth(request, url, userId)
      if (url.pathname.startsWith('/storage/v1/object/')) return await storage(request, url, userId)
      return reply(404, { message: `Emulador: rota ${url.pathname} não implementada` })
    } catch (error) {
      if (error instanceof HttpError) {
        return reply(error.status, { code: error.code, message: error.message, details: error.details, hint: null })
      }
      const pg = error as { code?: string; message?: string; detail?: string; hint?: string }
      if (typeof pg.code === 'string' && /^[0-9A-Z]{5}$/.test(pg.code)) {
        const status = pg.code === '42501' ? (userId ? 403 : 401)
          : pg.code === '23505' || pg.code === '23503' ? 409
            : pg.code.startsWith('XX') ? 500 : 400
        return reply(status, { code: pg.code, message: pg.message ?? '', details: pg.detail ?? null, hint: pg.hint ?? null })
      }
      return reply(500, { code: 'EMULATOR', message: (error as Error).message ?? String(error), details: null, hint: null })
    }
  }

  return {
    files,
    fetch: ((input: RequestInfo | URL, init?: RequestInit) =>
      handle(input instanceof Request ? input : new Request(input, init))) as typeof fetch,
  }
}
