import { addressKey, normalizeText } from './address'
import { normalizeZip, onlyDigits, repairZip } from './cep'

/**
 * Leitura de romaneios (CSV, ou células copiadas de uma planilha).
 *
 * O arquivo é validado inteiro antes de qualquer gravação: quem importa vê
 * o que entra, o que fica de fora e por quê. O banco ainda revalida o que
 * for obrigatório e recusa códigos repetidos.
 */

export interface ImportRow {
  line: number
  tracking_code: string
  external_ref: string | null
  manifest_ref: string | null
  sender_name: string | null
  recipient_name: string
  recipient_phone: string | null
  recipient_document: string | null
  zip_code: string | null
  street: string
  number: string | null
  complement: string | null
  district: string | null
  city: string | null
  state: string | null
  delivery_instructions: string | null
  latitude: number | null
  longitude: number | null
  is_temperature_controlled: boolean
}

export type ImportField = Exclude<keyof ImportRow, 'line'>

export interface ImportIssue {
  line: number
  /** `error` tira a linha da importação; `warning` importa e avisa. */
  level: 'error' | 'warning'
  field?: ImportField
  message: string
}

export interface ImportPreview {
  rows: ImportRow[]
  issues: ImportIssue[]
  /** coluna do arquivo → campo reconhecido */
  columns: { header: string; field: ImportField | null }[]
  missingRequired: ImportField[]
  stats: {
    lines: number
    valid: number
    rejected: number
    invalidZip: number
    addresses: number
  }
}

const HEADER_ALIASES: Record<ImportField, string[]> = {
  tracking_code: [
    'codigo', 'cod', 'etiqueta', 'codigo de rastreio', 'codigo rastreio', 'rastreio', 'rastreamento',
    'tracking', 'tracking code', 'codigo do pacote', 'pacote', 'codigo de barras', 'awb', 'id',
  ],
  external_ref: ['pedido', 'numero do pedido', 'n pedido', 'nota', 'nota fiscal', 'nf', 'nfe'],
  manifest_ref: ['romaneio', 'manifesto', 'lote'],
  sender_name: ['remetente', 'farmacia', 'loja', 'origem', 'embarcador'],
  recipient_name: [
    'destinatario', 'nome', 'nome do destinatario', 'nome destinatario', 'recebedor', 'cliente final',
    'paciente',
  ],
  recipient_phone: ['telefone', 'celular', 'fone', 'whatsapp', 'contato', 'tel'],
  recipient_document: ['cpf', 'documento', 'cpf cnpj', 'rg', 'doc'],
  zip_code: ['cep', 'codigo postal', 'zip'],
  street: ['endereco', 'logradouro', 'rua', 'endereco de entrega'],
  number: ['numero', 'num', 'n', 'no', 'nro'],
  complement: ['complemento', 'compl', 'apto', 'apartamento'],
  district: ['bairro'],
  city: ['cidade', 'municipio'],
  state: ['uf', 'estado'],
  delivery_instructions: [
    'observacao', 'observacoes', 'obs', 'instrucoes', 'instrucao', 'referencia', 'ponto de referencia',
  ],
  latitude: ['latitude', 'lat'],
  longitude: ['longitude', 'lng', 'lon', 'long'],
  is_temperature_controlled: ['refrigerado', 'termolabil', 'temperatura controlada', 'geladeira', 'refrigeracao'],
}

const FIELD_BY_ALIAS = new Map<string, ImportField>()
for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [ImportField, string[]][]) {
  FIELD_BY_ALIAS.set(normalizeText(field), field)
  for (const alias of aliases) FIELD_BY_ALIAS.set(alias, field)
}

const REQUIRED: ImportField[] = ['tracking_code', 'recipient_name', 'street']

export const FIELD_LABEL: Record<ImportField, string> = {
  tracking_code: 'Código',
  external_ref: 'Pedido / nota',
  manifest_ref: 'Romaneio',
  sender_name: 'Remetente',
  recipient_name: 'Destinatário',
  recipient_phone: 'Telefone',
  recipient_document: 'Documento',
  zip_code: 'CEP',
  street: 'Endereço',
  number: 'Número',
  complement: 'Complemento',
  district: 'Bairro',
  city: 'Cidade',
  state: 'UF',
  delivery_instructions: 'Observações',
  latitude: 'Latitude',
  longitude: 'Longitude',
  is_temperature_controlled: 'Refrigerado',
}

/** Modelo para download: os cabeçalhos aceitos e duas linhas de exemplo fictícias. */
export const IMPORT_TEMPLATE = [
  'codigo;destinatario;telefone;cep;endereco;numero;complemento;bairro;cidade;uf;observacoes;refrigerado',
  'PCT-000001;Maria Exemplo;(11) 90000-0001;02710-000;Rua Exemplo;100;Apto 12;Bairro Exemplo;São Paulo;SP;Deixar na portaria;não',
  'PCT-000002;João Exemplo;(11) 90000-0002;02710-000;Rua Exemplo;100;Apto 45;Bairro Exemplo;São Paulo;SP;;sim',
].join('\n')

/** Arquivos exportados do Excel no Brasil costumam vir em Windows-1252, não UTF-8. */
export function decodeTextFile(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder('windows-1252').decode(buffer)
  }
}

function detectDelimiter(headerLine: string): string {
  const candidates = ['\t', ';', ',', '|']
  let best = ';'
  let bestCount = 0
  for (const candidate of candidates) {
    let count = 0
    let quoted = false
    for (const char of headerLine) {
      if (char === '"') quoted = !quoted
      else if (char === candidate && !quoted) count++
    }
    if (count > bestCount) { best = candidate; bestCount = count }
  }
  return best
}

/** Leitor de texto delimitado com aspas (RFC 4180) e separador detectado. */
export function parseDelimited(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const firstLine = source.split('\n').find((line) => line.trim() !== '') ?? ''
  const delimiter = detectDelimiter(firstLine)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') { cell += '"'; i++ } else quoted = false
      } else cell += char
    } else if (char === '"' && cell === '') {
      quoted = true
    } else if (char === delimiter) {
      row.push(cell); cell = ''
    } else if (char === '\n') {
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += char
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((cells) => cells.some((value) => value.trim() !== ''))
}

const TRUE_VALUES = new Set(['sim', 's', 'true', 'verdadeiro', '1', 'x', 'yes', 'y'])

function parseCoordinate(value: string, limit: number): number | null {
  const text = value.trim().replace(',', '.')
  if (!/^-?\d{1,3}(\.\d+)?$/.test(text)) return null
  const number = Number(text)
  return Number.isFinite(number) && Math.abs(number) <= limit ? number : null
}

const HOUSE_NUMBER = String.raw`(?:n[ºo°.]?\s*)?(\d+[a-zA-Z]?|s\/?n)`
/** número logo depois de uma vírgula: "Rua 25 de Março, 1000 - Loja 3" */
const NUMBER_AFTER_COMMA = new RegExp(String.raw`^(.+?),\s*${HOUSE_NUMBER}\b\s*[-,/]?\s*(.*)$`, 'i')
/** sem vírgula, só vale o número no fim da linha: "Rua 7 de Setembro 100" */
const NUMBER_AT_END = new RegExp(String.raw`^(.+?)\s+${HOUSE_NUMBER}$`, 'i')

/**
 * Separa logradouro, número e complemento quando o romaneio traz tudo em uma
 * coluna só. Números no meio do nome da rua ("Rua 7 de Setembro") não são
 * confundidos com o número do imóvel.
 */
export function splitStreetLine(line: string): { street: string; number: string | null; complement: string | null } {
  const text = line.trim()
  const afterComma = NUMBER_AFTER_COMMA.exec(text)
  if (afterComma) {
    return { street: afterComma[1].trim(), number: afterComma[2].trim(), complement: afterComma[3].trim() || null }
  }
  const atEnd = NUMBER_AT_END.exec(text)
  if (atEnd) return { street: atEnd[1].trim(), number: atEnd[2].trim(), complement: null }
  return { street: text, number: null, complement: null }
}

const clean = (value: string | undefined): string | null => {
  const text = (value ?? '').replace(/\s+/g, ' ').trim()
  return text === '' ? null : text
}

export function buildImportPreview(text: string): ImportPreview {
  const table = parseDelimited(text)
  const empty: ImportPreview = {
    rows: [], issues: [], columns: [], missingRequired: REQUIRED,
    stats: { lines: 0, valid: 0, rejected: 0, invalidZip: 0, addresses: 0 },
  }
  if (table.length === 0) return empty

  const headers = table[0].map((header) => header.trim())
  const used = new Set<ImportField>()
  const columns = headers.map((header) => {
    let field = FIELD_BY_ALIAS.get(normalizeText(header)) ?? null
    // a primeira coluna reconhecida para um campo vence; repetições são ignoradas
    if (field && used.has(field)) field = null
    if (field) used.add(field)
    return { header, field }
  })

  // "cliente" é o destinatário quando o arquivo não traz outra coluna para ele
  if (!used.has('recipient_name')) {
    const fallback = columns.find((column) => !column.field && normalizeText(column.header) === 'cliente')
    if (fallback) { fallback.field = 'recipient_name'; used.add('recipient_name') }
  } else if (!used.has('sender_name')) {
    const fallback = columns.find((column) => !column.field && normalizeText(column.header) === 'cliente')
    if (fallback) { fallback.field = 'sender_name'; used.add('sender_name') }
  }

  const missingRequired = REQUIRED.filter((field) => !used.has(field))
  const index = new Map<ImportField, number>()
  columns.forEach((column, position) => { if (column.field) index.set(column.field, position) })
  const hasNumberColumn = index.has('number')

  const rows: ImportRow[] = []
  const issues: ImportIssue[] = []
  const seen = new Set<string>()
  let rejected = 0
  let invalidZip = 0

  for (let i = 1; i < table.length; i++) {
    const cells = table[i]
    const line = i + 1
    const get = (field: ImportField) => {
      const position = index.get(field)
      return position == null ? undefined : cells[position]
    }
    const reject = (message: string, field?: ImportField) => {
      issues.push({ line, level: 'error', field, message })
      rejected++
    }

    const rawCode = (get('tracking_code') ?? '').trim()
    const code = rawCode.toUpperCase()
    if (!code) { reject('Sem código do pacote.', 'tracking_code'); continue }
    if (/^\d+([.,]\d+)?E\+\d+$/i.test(rawCode)) {
      reject('Código em notação científica: formate a coluna como texto na planilha e exporte de novo.', 'tracking_code')
      continue
    }
    if (code.length > 64) { reject('Código com mais de 64 caracteres.', 'tracking_code'); continue }
    if (seen.has(code)) { reject(`Código ${code} repetido no arquivo.`, 'tracking_code'); continue }

    const recipient = clean(get('recipient_name'))
    if (!recipient) { reject('Sem nome do destinatário.', 'recipient_name'); continue }

    let street = clean(get('street'))
    if (!street) { reject('Sem endereço.', 'street'); continue }
    let number = clean(get('number'))
    let complement = clean(get('complement'))
    if (!hasNumberColumn || !number) {
      const parts = splitStreetLine(street)
      if (parts.number) {
        street = parts.street
        number = parts.number
        complement = complement ?? parts.complement
      }
    }

    const rawZip = (get('zip_code') ?? '').trim()
    const { zip, repaired } = repairZip(rawZip)
    if (!zip) {
      invalidZip++
      issues.push({
        line, level: 'warning', field: 'zip_code',
        message: rawZip
          ? `CEP "${rawZip}" inválido: o pacote entra e vai para as exceções.`
          : 'Sem CEP: o pacote entra e vai para as exceções.',
      })
    } else if (repaired) {
      issues.push({
        line, level: 'warning', field: 'zip_code',
        message: `CEP ${rawZip} tinha 7 dígitos; o zero inicial foi devolvido (${zip.slice(0, 5)}-${zip.slice(5)}).`,
      })
    }

    const rawLat = (get('latitude') ?? '').trim()
    const rawLng = (get('longitude') ?? '').trim()
    let latitude = rawLat ? parseCoordinate(rawLat, 90) : null
    let longitude = rawLng ? parseCoordinate(rawLng, 180) : null
    if ((rawLat || rawLng) && (latitude == null || longitude == null)) {
      issues.push({ line, level: 'warning', field: 'latitude', message: 'Coordenadas inválidas foram ignoradas.' })
      latitude = null
      longitude = null
    }

    seen.add(code)
    rows.push({
      line,
      tracking_code: code,
      external_ref: clean(get('external_ref')),
      manifest_ref: clean(get('manifest_ref')),
      sender_name: clean(get('sender_name')),
      recipient_name: recipient,
      recipient_phone: clean(get('recipient_phone')),
      recipient_document: clean(get('recipient_document')),
      zip_code: zip,
      street,
      number,
      complement,
      district: clean(get('district')),
      city: clean(get('city')),
      state: clean(get('state'))?.toUpperCase().slice(0, 2) ?? null,
      delivery_instructions: clean(get('delivery_instructions')),
      latitude,
      longitude,
      is_temperature_controlled: TRUE_VALUES.has(normalizeText(get('is_temperature_controlled'))),
    })
  }

  const addresses = new Set(rows.map((row) => addressKey(row.zip_code, row.street, row.number)))
  return {
    rows,
    issues,
    columns,
    missingRequired,
    stats: { lines: table.length - 1, valid: rows.length, rejected, invalidZip, addresses: addresses.size },
  }
}

/** Telefone só com dígitos, para os links de ligar. */
export function phoneDigits(value: string | null | undefined): string {
  return onlyDigits(value)
}

export { normalizeZip }
