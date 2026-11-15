import { normalizeZip } from './cep'

/**
 * Chave do endereço físico, idêntica à do banco (`app.address_key`).
 *
 * Dois pacotes com a mesma chave formam uma única parada. A fonte da verdade
 * é a coluna gerada `packages.address_key`; esta versão existe para mostrar
 * "quantos endereços" antes de gravar (prévia da importação) e é mantida em
 * paridade por teste contra o banco.
 */

const ACCENTED = 'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ'
const PLAIN = 'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
const ACCENT_MAP = new Map<string, string>([...ACCENTED].map((char, index) => [char, PLAIN[index]]))

export function normalizeText(value: string | null | undefined): string {
  let out = ''
  for (const char of value ?? '') out += ACCENT_MAP.get(char) ?? char
  return out.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Abreviações de logradouro tratadas como a mesma palavra. */
const STREET_TYPES: [RegExp, string][] = [
  [/^r /, 'rua '],
  [/^(av|avda) /, 'avenida '],
  [/^(al|alam) /, 'alameda '],
  [/^(tv|trav) /, 'travessa '],
  [/^(estr|est) /, 'estrada '],
  [/^(pc|pca) /, 'praca '],
  [/^rod /, 'rodovia '],
]

export function addressKey(
  zip: string | null | undefined,
  street: string | null | undefined,
  number: string | null | undefined,
): string {
  let normalizedStreet = normalizeText(street)
  for (const [pattern, replacement] of STREET_TYPES) {
    normalizedStreet = normalizedStreet.replace(pattern, replacement)
  }
  const normalizedNumber = normalizeText(number).replace(/ /g, '') || 'sn'
  return `${normalizeZip(zip) ?? '00000000'}|${normalizedStreet}|${normalizedNumber}`
}

/** Linha única para exibir um endereço em listas e cartões. */
export function addressLine(parts: {
  street?: string | null
  number?: string | null
  district?: string | null
  city?: string | null
}): string {
  const first = [parts.street, parts.number].filter(Boolean).join(', ')
  return [first, parts.district || parts.city].filter(Boolean).join(' · ')
}
