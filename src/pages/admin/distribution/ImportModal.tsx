import { useMemo, useRef, useState } from 'react'
import { Download, FileUp } from 'lucide-react'
import { Alert, Badge, Button, Modal, Textarea } from '@/components/ui'
import { errorMessage } from '@/hooks/useApiMutation'
import * as api from '@/lib/logistics/api'
import { buildImportPreview, decodeTextFile, FIELD_LABEL, IMPORT_TEMPLATE } from '@/lib/logistics/import'
import type { ImportResult } from '@/lib/logistics/types'

/** Importação do romaneio: arquivo ou colagem → prévia com erros por linha → gravação. */
export function ImportModal({ batchId, open, onClose, onDone }: {
  batchId: string; open: boolean; onClose: () => void; onDone: () => void
}) {
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const preview = useMemo(() => (text.trim() ? buildImportPreview(text) : null), [text])
  const errors = preview?.issues.filter((issue) => issue.level === 'error') ?? []
  const warnings = preview?.issues.filter((issue) => issue.level === 'warning') ?? []

  function reset() {
    setText(''); setFileName(null); setError(null); setResult(null)
  }

  async function pick(file: File | undefined) {
    if (!file) return
    setError(null); setResult(null)
    if (/\.(xlsx?|ods)$/i.test(file.name)) {
      setError('Planilha do Excel: salve como CSV (Arquivo → Salvar como → CSV) ou copie as células e cole abaixo.')
      return
    }
    setFileName(file.name)
    setText(decodeTextFile(await file.arrayBuffer()))
  }

  async function confirm() {
    if (!preview || preview.rows.length === 0) return
    setSaving(true); setError(null)
    try {
      setResult(await api.importPackages(batchId, preview.rows))
      onDone()
    } catch (cause) {
      setError(errorMessage(cause).message)
    } finally {
      setSaving(false)
    }
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([`\uFEFF${IMPORT_TEMPLATE}`], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'modelo-romaneio.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const close = () => { if (!saving) { reset(); onClose() } }

  return (
    <Modal
      open={open} onClose={close} size="xl" title="Importar romaneio"
      description="Arquivo CSV ou células copiadas da planilha. Nada é gravado antes de você conferir a prévia."
      footer={result ? <Button onClick={close}>Concluir</Button> : (
        <>
          <Button variant="secondary" onClick={close} disabled={saving}>Cancelar</Button>
          <Button loading={saving} disabled={!preview || preview.rows.length === 0 || preview.missingRequired.length > 0} onClick={() => void confirm()}>
            Importar {preview?.rows.length ?? 0} pacote(s)
          </Button>
        </>
      )}
    >
      {result ? (
        <div className="space-y-3">
          <Alert tone="success" title={`${result.inserted} pacote(s) importado(s)`}>
            Agora use “Distribuir por CEP” para definir o responsável de cada um.
          </Alert>
          {result.duplicates.length > 0 && (
            <Alert tone="warning" title={`${result.duplicates.length} código(s) já existiam e não foram gravados de novo`}>
              <span className="break-all font-mono text-[12px]">{result.duplicates.slice(0, 40).join(', ')}{result.duplicates.length > 40 ? '…' : ''}</span>
            </Alert>
          )}
          {result.invalid.length > 0 && (
            <Alert tone="danger" title={`${result.invalid.length} linha(s) recusada(s) pelo banco`}>
              Linhas: {result.invalid.map((item) => item.line).join(', ')}
            </Alert>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {error && <Alert tone="danger">{error}</Alert>}
          <div className="flex flex-wrap items-center gap-2">
            <input ref={input} type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" className="hidden"
              onChange={(event) => { void pick(event.target.files?.[0]); event.target.value = '' }} />
            <Button variant="secondary" onClick={() => input.current?.click()} icon={<FileUp className="h-4 w-4" />}>Escolher arquivo</Button>
            <Button variant="ghost" onClick={downloadTemplate} icon={<Download className="h-4 w-4" />}>Baixar modelo</Button>
            {fileName && <span className="text-[12.5px] text-ink-500">{fileName}</span>}
          </div>
          <Textarea
            value={text} onChange={(event) => { setText(event.target.value); setFileName(null) }} rows={5}
            className="font-mono text-[12px]" spellCheck={false}
            placeholder={'…ou cole aqui as linhas da planilha, com o cabeçalho:\ncodigo;destinatario;cep;endereco;numero;complemento;bairro;cidade;uf'}
          />

          {preview && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ['Linhas lidas', preview.stats.lines], ['Prontas para importar', preview.stats.valid],
                  ['Recusadas', preview.stats.rejected], ['Endereços', preview.stats.addresses],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-ink-200 px-3 py-2">
                    <p className="text-[11px] text-ink-500">{label}</p>
                    <p className="font-display text-lg font-bold text-ink-950">{value}</p>
                  </div>
                ))}
              </div>
              {preview.missingRequired.length > 0 && (
                <Alert tone="danger" title="Colunas obrigatórias não encontradas">
                  {preview.missingRequired.map((field) => FIELD_LABEL[field]).join(', ')}. Confira o cabeçalho do arquivo.
                </Alert>
              )}
              <div className="flex flex-wrap gap-1.5">
                {preview.columns.map((column, index) => (
                  <Badge key={`${column.header}-${index}`} tone={column.field ? 'success' : 'neutral'}>
                    {column.header || '(vazia)'} {column.field ? `→ ${FIELD_LABEL[column.field]}` : '· ignorada'}
                  </Badge>
                ))}
              </div>
              {preview.stats.invalidZip > 0 && (
                <Alert tone="warning" title={`${preview.stats.invalidZip} pacote(s) com CEP inválido`}>
                  Serão importados e ficarão como exceção na distribuição, para correção.
                </Alert>
              )}
              {(errors.length > 0 || warnings.length > 0) && (
                <div className="max-h-48 overflow-y-auto rounded-xl border border-ink-200">
                  <table className="table-base text-[12.5px]">
                    <thead><tr><th>Linha</th><th>Situação</th><th>Detalhe</th></tr></thead>
                    <tbody>
                      {errors.concat(warnings).slice(0, 200).map((issue, index) => (
                        <tr key={index}>
                          <td className="font-mono">{issue.line}</td>
                          <td><Badge tone={issue.level === 'error' ? 'danger' : 'warning'}>{issue.level === 'error' ? 'Recusada' : 'Aviso'}</Badge></td>
                          <td>{issue.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
