/**
 * CEP: normalização, faixas de cobertura e rótulos.
 *
 * As regras daqui espelham as do banco (`app.normalize_zip`): CEP válido tem
 * exatamente 8 dígitos. O que não for válido não é "consertado" em silêncio —
 * a única correção automática é devolver o zero à esquerda que as planilhas
 * costumam cortar, e ela é sempre sinalizada para quem está importando.
 */

export function onlyDigits(value: string | number | null | undefined): string {
  return String(value ?? '').replace(/\D+/g, '')
}

/** CEP com 8 dígitos ou `null`. */
export function normalizeZip(value: string | number | null | undefined): string | null {
  const digits = onlyDigits(value)
  return digits.length === 8 ? digits : null
}

/**
 * Planilhas tratam CEP como número e cortam o zero inicial (02710-000 vira
 * 2710000). Um valor com 7 dígitos só pode ser isso, então o zero é devolvido
 * e o chamador é avisado em `repaired`.
 */
export function repairZip(value: string | number | null | undefined): { zip: string | null; repaired: boolean } {
  const digits = onlyDigits(value)
  if (digits.length === 8) return { zip: digits, repaired: false }
  if (digits.length === 7) return { zip: `0${digits}`, repaired: true }
  return { zip: null, repaired: false }
}

export function zipFromInt(value: number): string {
  return String(Math.trunc(value)).padStart(8, '0')
}

/** `02710000` → `02710-000`. Aceita o inteiro guardado nas faixas. */
export function formatZip(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—'
  const zip = typeof value === 'number' ? zipFromInt(value) : normalizeZip(value)
  if (!zip) return String(value)
  return `${zip.slice(0, 5)}-${zip.slice(5)}`
}

export interface ZipRange {
  start: number
  end: number
}

const RANGE_PATTERN = /^\s*(\d{5}-?\d{3})\s*(?:a|até|ate|\.\.|–|—|-)\s*(\d{5}-?\d{3})\s*$/i

/**
 * Lê o que o supervisor digita ao cadastrar cobertura:
 *
 * - `02710-000`              um CEP só
 * - `027`, `027xx`, `02710`  prefixo (todos os CEPs que começam assim)
 * - `02700-000 a 02799-999`  faixa explícita
 *
 * Prefixo aceita de 2 a 5 dígitos. Seis ou sete dígitos são recusados: é
 * quase sempre um CEP digitado pela metade, e cadastrar isso como cobertura
 * distribuiria pacotes para a pessoa errada.
 */
export function parseZipRange(input: string): ZipRange | null {
  const text = (input ?? '').trim()
  if (!text) return null

  const range = RANGE_PATTERN.exec(text)
  if (range) {
    const start = Number(onlyDigits(range[1]))
    const end = Number(onlyDigits(range[2]))
    return start <= end ? { start, end } : null
  }

  if (!/^[\dxX*\-.\s]+$/.test(text)) return null
  const prefixed = /[xX*]/.test(text)
  const digits = onlyDigits(prefixed ? text.replace(/[xX*].*$/, '') : text)
  if (digits.length === 8 && !prefixed) {
    const single = Number(digits)
    return { start: single, end: single }
  }
  if (digits.length >= 2 && digits.length <= 5) {
    return {
      start: Number(digits.padEnd(8, '0')),
      end: Number(digits.padEnd(8, '9')),
    }
  }
  return null
}

/** Descreve uma faixa do jeito mais curto que ainda é exato. */
export function describeZipRange(start: number, end: number): string {
  const a = zipFromInt(start)
  const b = zipFromInt(end)
  if (a === b) return formatZip(a)
  // faixa "redonda": mesmo prefixo, zeros de um lado e noves do outro
  for (let len = 7; len >= 1; len--) {
    if (a.slice(0, len) === b.slice(0, len) && /^0+$/.test(a.slice(len)) && /^9+$/.test(b.slice(len))) {
      return zipPrefixLabel(a.slice(0, len))
    }
  }
  return `${formatZip(a)} a ${formatZip(b)}`
}

/** `027` → `027xx-xxx`; usado nos cartões de roteiro e na cobertura. */
export function zipPrefixLabel(prefix: string | null | undefined): string {
  const digits = onlyDigits(prefix)
  if (!digits) return 'CEP não informado'
  const masked = digits.slice(0, 8).padEnd(8, 'x')
  return `${masked.slice(0, 5)}-${masked.slice(5)}`
}

/** Rótulo curto dos cartões de roteiro: `027` → `027xx`. */
export function zipShortLabel(prefix: string | null | undefined): string {
  const digits = onlyDigits(prefix)
  if (!digits) return 'Sem CEP'
  return digits.slice(0, 5).padEnd(5, 'x')
}

export function rangesOverlap(a: ZipRange, b: ZipRange): boolean {
  return a.start <= b.end && b.start <= a.end
}

export function rangeContains(outer: ZipRange, inner: ZipRange): boolean {
  return outer.start <= inner.start && outer.end >= inner.end
}
