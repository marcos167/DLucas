import { useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { Alert, Field, Input, Select, Textarea, Button } from '@/components/ui'
import { submitLead } from '@/lib/api'
import { businessSchema, fieldErrors, quoteSchema } from '@/lib/validation'
import { maskCnpj, maskPhone } from '@/lib/utils'

interface Props { type: 'QUOTE' | 'BUSINESS' }

export default function LeadForm({ type }: Props) {
  const [form, setForm] = useState({
    name: '', company_name: '', cnpj: '', email: '', phone: '',
    city: '', state: '', units_count: '', deliveries_per_day: '', message: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [serverError, setServerError] = useState('')

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setServerError('')
    const schema = type === 'BUSINESS' ? businessSchema : quoteSchema
    const parsed = schema.safeParse(form)
    if (!parsed.success) { setErrors(fieldErrors(parsed.error)); return }
    setErrors({})
    setLoading(true)
    try {
      const d = parsed.data
      await submitLead({
        type,
        name: d.name,
        company_name: d.company_name || null,
        cnpj: d.cnpj || null,
        email: d.email,
        phone: d.phone,
        city: d.city || null,
        state: d.state ? d.state.toUpperCase() : null,
        units_count: Number.isFinite(d.units_count as number) ? d.units_count : null,
        deliveries_per_day: Number.isFinite(d.deliveries_per_day as number) ? d.deliveries_per_day : null,
        message: d.message || null,
      })
      setSent(true)
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Erro ao enviar.')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="card p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h3 className="mt-4 font-display text-lg font-bold text-ink-950">Solicitação registrada</h3>
        <p className="mx-auto mt-2 max-w-sm text-sm text-ink-600">
          Recebemos seus dados. Nossa equipe comercial entrará em contato pelos canais informados.
        </p>
        <Button variant="secondary" className="mt-6" onClick={() => {
          setSent(false)
          setForm({ name: '', company_name: '', cnpj: '', email: '', phone: '', city: '', state: '', units_count: '', deliveries_per_day: '', message: '' })
        }}>
          Enviar outra solicitação
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="card p-6 sm:p-7" noValidate>
      {serverError && <Alert tone="danger" title="Não foi possível enviar" >{serverError}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Seu nome" required error={errors.name}>
          <Input value={form.name} onChange={set('name')} invalid={!!errors.name} placeholder="Nome do responsável" autoComplete="name" />
        </Field>
        <Field label={type === 'BUSINESS' ? 'Empresa' : 'Farmácia / empresa'} required={type === 'BUSINESS'} error={errors.company_name}>
          <Input value={form.company_name} onChange={set('company_name')} invalid={!!errors.company_name} placeholder="Nome da farmácia" autoComplete="organization" />
        </Field>
        <Field label="CNPJ" error={errors.cnpj}>
          <Input value={form.cnpj} onChange={(e) => setForm((f) => ({ ...f, cnpj: maskCnpj(e.target.value) }))} placeholder="00.000.000/0000-00" inputMode="numeric" />
        </Field>
        <Field label="E-mail" required error={errors.email}>
          <Input type="email" value={form.email} onChange={set('email')} invalid={!!errors.email} placeholder="nome@empresa.com.br" autoComplete="email" />
        </Field>
        <Field label="Telefone / WhatsApp" required error={errors.phone}>
          <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: maskPhone(e.target.value) }))} invalid={!!errors.phone} placeholder="(11) 90000-0000" inputMode="tel" />
        </Field>
        <Field label="Cidade" error={errors.city}>
          <Input value={form.city} onChange={set('city')} placeholder="São Paulo" />
        </Field>
        <Field label="UF" error={errors.state}>
          <Select value={form.state} onChange={set('state')}>
            <option value="">—</option>
            {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map((uf) => (
              <option key={uf} value={uf}>{uf}</option>
            ))}
          </Select>
        </Field>
        <Field label="Unidades" hint="Quantas unidades a empresa tem hoje">
          <Input type="number" min={0} value={form.units_count} onChange={set('units_count')} placeholder="1" />
        </Field>
        <Field label="Entregas por dia (média)" hint="Estimativa ajuda a montar a proposta">
          <Input type="number" min={0} value={form.deliveries_per_day} onChange={set('deliveries_per_day')} placeholder="10" />
        </Field>
        <Field label="Mensagem" className="sm:col-span-2">
          <Textarea value={form.message} onChange={set('message')} rows={4} placeholder="Conte sobre regiões atendidas, horários e o que precisa melhorar na sua logística." />
        </Field>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xs text-xs text-ink-500">
          Seus dados são usados apenas para contato comercial e ficam armazenados com segurança.
        </p>
        <Button type="submit" size="lg" loading={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {type === 'BUSINESS' ? 'Enviar cadastro' : 'Solicitar orçamento'}
        </Button>
      </div>
    </form>
  )
}
