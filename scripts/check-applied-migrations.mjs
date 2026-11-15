// Confere a correspondência com o SQL efetivamente registrado na produção.
// Os hashes abaixo foram obtidos por SELECT somente de leitura em
// supabase_migrations.schema_migrations no projeto euwonmpgwwoublajfvip.
// Normalização limitada a estes três arquivos (sem '--' dentro de literais):
// remove comentários de linha e espaços. Não valida migrações 001–006 nem
// substitui a comparação de catálogo antes de qualquer db push.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const directory = resolve('supabase/migrations')
const deployed = {
  '20261115123622_authorization_hardening_007.sql': '1befa60934c830919167fe95f6ec67f4',
  '20261115123630_direct_assignment_acceptance_008.sql': '5b0c541033c4e419aa4a2b56e66f898f',
  '20261115123637_offer_acceptance_contention_009.sql': 'a572d57c7cc4d829dc602ef4e8f90360',
}

for (const [filename, expected] of Object.entries(deployed)) {
  const sql = readFileSync(resolve(directory, filename), 'utf8')
  const normalized = sql.replace(/--[^\n]*/g, '').replace(/\s+/g, '')
  const actual = createHash('md5').update(normalized).digest('hex')
  assert.equal(actual, expected, `${filename}: SQL alterado após aplicação em produção; crie nova migração`)
}

const versions = readdirSync(directory).filter((file) => /^\d{14}_.*\.sql$/.test(file))
const unique = new Set(versions.map((file) => file.slice(0, 14)))
assert.equal(unique.size, versions.length, 'Versões de migração duplicadas')
console.log('Migrações 007–009: nomes e conteúdo compatíveis com o histórico de produção.')
console.log('Atenção: 001–006 continuam sem registro no histórico; não execute db push sem reconciliar o baseline.')
