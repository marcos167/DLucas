import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Card, CardHeader, Field, Input, Skeleton, Textarea } from '@/components/ui'
import { getPharmacy, upsertPharmacy } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { maskCnpj, maskPhone } from '@/lib/utils'
import { useApiMutation } from '@/hooks/useApiMutation'

export default function PharmacySettings() {
  const { profile } = useAuth()
  const pharmacyId = profile?.pharmacy_id ?? ''
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['pharmacy', pharmacyId],
    queryFn: () => getPharmacy(pharmacyId),
    enabled: !!pharmacyId,
  })

  const [form, setForm] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!data) return
    setForm({
      trade_name: data.trade_name ?? '', legal_name: data.legal_name ?? '', cnpj: data.cnpj ?? '',
      email: data.email ?? '', phone: data.phone ?? '', whatsapp: data.whatsapp ?? '',
      contact_name: data.contact_name ?? '', billing_email: data.billing_email ?? '',
      street: data.street ?? '', number: data.number ?? '', district: data.district ?? '',
      city: data.city ?? '', state: data.state ?? '', zip_code: data.zip_code ?? '',
    })
  }, [data])

  const save = useApiMutation({
    mutationFn: async () => {
      await upsertPharmacy({
        trade_name: form.trade_name, legal_name: form.legal_name, cnpj: form.cnpj || null,
        email: form.email || null, phone: form.phone || null, whatsapp: form.whatsapp || null,
        contact_name: form.contact_name || null, billing_email: form.billing_email || null,
        street: form.street || null, number: form.number || null, district: form.district || null,
        city: form.city || null, state: form.state || null, zip_code: form.zip_code || null,
      }, pharmacyId)
    },
    onSuccess: () => {
      setSaved(true)
      void qc.invalidateQueries({ queryKey: ['pharmacy', pharmacyId] })
      setTimeout(() => setSaved(false), 2500)
    },
  })

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  if (isLoading) return <Skeleton className="h-64" />

  return (
    <div className="space-y-4">
      {saved && <Alert tone="success" title="Dados atualizados">As alterações foram salvas.</Alert>}
      <Card>
        <CardHeader title="Dados da farmácia" description="Informações comerciais e de cobrança" />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="Nome fantasia"><Input value={form.trade_name ?? ''} onChange={set('trade_name')} /></Field>
          <Field label="Razão social"><Input value={form.legal_name ?? ''} onChange={set('legal_name')} /></Field>
          <Field label="CNPJ"><Input value={form.cnpj ?? ''} onChange={(e) => setForm((f) => ({ ...f, cnpj: maskCnpj(e.target.value) }))} /></Field>
          <Field label="Responsável"><Input value={form.contact_name ?? ''} onChange={set('contact_name')} /></Field>
          <Field label="Telefone"><Input value={form.phone ?? ''} onChange={(e) => setForm((f) => ({ ...f, phone: maskPhone(e.target.value) }))} /></Field>
          <Field label="WhatsApp"><Input value={form.whatsapp ?? ''} onChange={(e) => setForm((f) => ({ ...f, whatsapp: maskPhone(e.target.value) }))} /></Field>
          <Field label="E-mail"><Input value={form.email ?? ''} onChange={set('email')} /></Field>
          <Field label="E-mail de cobrança"><Input value={form.billing_email ?? ''} onChange={set('billing_email')} /></Field>
          <Field label="Rua"><Input value={form.street ?? ''} onChange={set('street')} /></Field>
          <Field label="Número"><Input value={form.number ?? ''} onChange={set('number')} /></Field>
          <Field label="Bairro"><Input value={form.district ?? ''} onChange={set('district')} /></Field>
          <Field label="CEP"><Input value={form.zip_code ?? ''} onChange={set('zip_code')} /></Field>
          <Field label="Cidade"><Input value={form.city ?? ''} onChange={set('city')} /></Field>
          <Field label="UF"><Input value={form.state ?? ''} onChange={set('state')} maxLength={2} className="uppercase" /></Field>
          <Field label="Observações" className="sm:col-span-2"><Textarea rows={2} /></Field>
        </div>
        <div className="flex justify-end border-t border-ink-100 px-4 py-3">
          <Button onClick={() => save.mutate()} loading={save.isPending}>Salvar alterações</Button>
        </div>
      </Card>
      <p className="px-1 text-[11px] text-ink-400">
        Alterações de situação cadastral (ativa/inativa) são feitas pela administração da D'Luca.
      </p>
    </div>
  )
}
