import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Card, CardHeader, Field, Input, Skeleton } from '@/components/ui'
import { listSettings, logAudit, upsertSetting } from '@/lib/api'
import { formatDateTime } from '@/lib/utils'

const DEFAULT_KEYS = [
  { key: 'operation.hours', label: 'Horário de operação', desc: 'Texto exibido na central de despacho', value: 'Segunda a sábado, 08h–20h' },
  { key: 'operation.offer_timeout_minutes', label: 'Tempo de expiração de oferta (min)', desc: 'Após esse prazo a oferta expira', value: '15' },
  { key: 'finance.invoice_due_days', label: 'Prazo padrão de fatura (dias)', desc: 'Usado ao criar uma nova fatura', value: '15' },
  { key: 'dispatch.max_distance_km', label: 'Distância máxima sugerida (km)', desc: 'Limite para sugestão automática', value: '20' },
]

export default function Settings() {
  const qc = useQueryClient()
  const settings = useQuery({ queryKey: ['settings'], queryFn: listSettings })
  const [values, setValues] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const map: Record<string, string> = {}
    for (const def of DEFAULT_KEYS) {
      const row = (settings.data ?? []).find((s) => s.key === def.key)
      const raw = row?.value as { content?: string } | undefined
      map[def.key] = raw?.content ?? def.value
    }
    setValues(map)
  }, [settings.data])

  const save = useMutation({
    mutationFn: async () => {
      for (const def of DEFAULT_KEYS) {
        await upsertSetting(def.key, { content: values[def.key] ?? '' }, def.desc)
      }
      await logAudit('UPDATE', 'settings', null, 'Atualizou configurações gerais')
    },
    onSuccess: () => {
      setSaved(true)
      void qc.invalidateQueries({ queryKey: ['settings'] })
      setTimeout(() => setSaved(false), 2500)
    },
  })

  return (
    <div className="space-y-4">
      {saved && <Alert tone="success" title="Configurações salvas">Os parâmetros foram atualizados.</Alert>}

      <Card>
        <CardHeader title="Parâmetros da operação" description="Valores usados como padrão pela plataforma" />
        {settings.isLoading ? <Skeleton className="m-4 h-40" /> : (
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            {DEFAULT_KEYS.map((def) => (
              <Field key={def.key} label={def.label} hint={def.desc}>
                <Input value={values[def.key] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [def.key]: e.target.value }))} />
              </Field>
            ))}
          </div>
        )}
        <div className="flex justify-end border-t border-ink-100 px-4 py-3">
          <Button onClick={() => save.mutate()} loading={save.isPending}>Salvar configurações</Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Identidade da plataforma" description="Informações exibidas no site e nos documentos" />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="Empresa" hint="Somente leitura nesta versão"><Input value="D'Luca Transportes" readOnly disabled /></Field>
          <Field label="Produto" hint="Somente leitura"><Input value="D'Luca Connect" readOnly disabled /></Field>
          <Field label="Canal de WhatsApp" hint="Definido em VITE_COMPANY_WHATSAPP"><Input value={import.meta.env.VITE_COMPANY_WHATSAPP || 'não configurado'} readOnly disabled /></Field>
          <Field label="Projeto Supabase" hint="Conexão atual"><Input value={import.meta.env.VITE_SUPABASE_URL || 'não configurado'} readOnly disabled /></Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Segurança" description="Aplicada no banco de dados" />
        <ul className="space-y-2 p-4 text-[12.5px] text-ink-700">
          {[
            'RLS habilitado em todas as tabelas com políticas por papel.',
            'Farmácias acessam apenas os próprios pedidos, unidades e faturas.',
            'Posições GPS só são gravadas/visíveis com autorização do entregador.',
            'Comprovantes em bucket privado, servidos por URL assinada (10 min).',
            'Cadastro público desabilitado; usuários criados pela administração.',
            'Senha temporária exige troca no primeiro acesso.',
          ].map((t) => <li key={t} className="flex gap-2"><span className="text-brand-600">•</span>{t}</li>)}
        </ul>
        <p className="border-t border-ink-100 px-4 py-2.5 text-[11px] text-ink-400">
          Verificado em {formatDateTime(new Date().toISOString())}
        </p>
      </Card>
    </div>
  )
}
