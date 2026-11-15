import { useState } from 'react'
import { CheckCircle2, Bike, Wallet, CalendarCheck, Smartphone } from 'lucide-react'
import { Alert, Button, Field, Input, Select, Switch, Textarea } from '@/components/ui'
import { submitCourierApplication } from '@/lib/api'
import { courierApplicationSchema, fieldErrors } from '@/lib/validation'
import { maskCpf, maskPhone } from '@/lib/utils'

const perks = [
  { icon: Wallet, t: 'Repasse por entrega', d: 'Valor definido por entrega, com histórico de repasses na plataforma.' },
  { icon: CalendarCheck, t: 'Você escolhe a disponibilidade', d: 'Fique disponível quando puder atender e receba ofertas compatíveis.' },
  { icon: Smartphone, t: 'Tudo pelo celular', d: 'Ofertas, etapas da entrega, ocorrências e comprovantes em uma interface mobile.' },
  { icon: Bike, t: 'Rota organizada', d: 'Endereço de coleta, destino e instruções ficam disponíveis no pedido aceito.' },
]

export default function CourierJoin() {
  const [form, setForm] = useState({
    full_name: '', phone: '', email: '', cpf: '', city: '', state: '',
    service_zone: '', vehicle_plate: '', cnh_category: '', experience: '', message: '',
  })
  const [hasMotorcycle, setHasMotorcycle] = useState(true)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [serverError, setServerError] = useState('')

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setServerError('')
    const parsed = courierApplicationSchema.safeParse({ ...form, has_motorcycle: hasMotorcycle })
    if (!parsed.success) { setErrors(fieldErrors(parsed.error)); return }
    setErrors({})
    setLoading(true)
    try {
      const d = parsed.data
      await submitCourierApplication({
        full_name: d.full_name,
        phone: d.phone,
        email: d.email || null,
        cpf: d.cpf || null,
        city: d.city,
        state: d.state.toUpperCase(),
        service_zone: d.service_zone || null,
        has_motorcycle: d.has_motorcycle,
        vehicle_plate: d.vehicle_plate || null,
        cnh_category: d.cnh_category || null,
        experience: d.experience || null,
        message: d.message || null,
      })
      setSent(true)
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Erro ao enviar.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <header className="border-b border-ink-200 bg-gradient-to-b from-brand-50 to-white">
        <div className="container-page py-12 sm:py-16">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">Entregadores</p>
          <h1 className="mt-2 max-w-3xl font-display text-3xl font-extrabold tracking-tight text-ink-950 sm:text-4xl">
            Faça parte da rede de entregadores
          </h1>
          <p className="mt-4 max-w-2xl text-ink-600">
            Cadastre-se para análise. Se aprovado, você recebe acesso à área do entregador e passa a
            receber ofertas de entrega nas regiões em que atua.
          </p>
        </div>
      </header>

      <div className="container-page grid gap-10 py-12 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {perks.map((p) => (
              <div key={p.t} className="card flex gap-3 p-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                  <p.icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-bold text-ink-950">{p.t}</p>
                  <p className="text-[13px] text-ink-600">{p.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {sent ? (
          <div className="card h-fit p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h2 className="mt-4 font-display text-lg font-bold text-ink-950">Candidatura enviada</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-ink-600">
              Recebemos seus dados. A equipe analisará a candidatura e entrará em contato pelo
              telefone informado. Se aprovado, criaremos seu acesso.
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="card p-6" noValidate>
            {serverError && <Alert tone="danger" title="Não foi possível enviar">{serverError}</Alert>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome completo" required error={errors.full_name} className="sm:col-span-2">
                <Input value={form.full_name} onChange={set('full_name')} invalid={!!errors.full_name} autoComplete="name" />
              </Field>
              <Field label="Telefone / WhatsApp" required error={errors.phone}>
                <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: maskPhone(e.target.value) }))} invalid={!!errors.phone} inputMode="tel" placeholder="(11) 90000-0000" />
              </Field>
              <Field label="E-mail" error={errors.email}>
                <Input type="email" value={form.email} onChange={set('email')} invalid={!!errors.email} autoComplete="email" />
              </Field>
              <Field label="CPF" error={errors.cpf}>
                <Input value={form.cpf} onChange={(e) => setForm((f) => ({ ...f, cpf: maskCpf(e.target.value) }))} inputMode="numeric" placeholder="000.000.000-00" />
              </Field>
              <Field label="Cidade" required error={errors.city}>
                <Input value={form.city} onChange={set('city')} invalid={!!errors.city} placeholder="São Paulo" />
              </Field>
              <Field label="UF" required error={errors.state}>
                <Select value={form.state} onChange={set('state')} invalid={!!errors.state}>
                  <option value="">—</option>
                  {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map((uf) => (
                    <option key={uf} value={uf}>{uf}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Região / bairros que atende" error={errors.service_zone}>
                <Input value={form.service_zone} onChange={set('service_zone')} placeholder="Zona Sul, Centro…" />
              </Field>
              <Field label="Categoria da CNH" error={errors.cnh_category}>
                <Input value={form.cnh_category} onChange={set('cnh_category')} placeholder="A / AB" />
              </Field>
              <Field label="Placa do veículo" error={errors.vehicle_plate}>
                <Input value={form.vehicle_plate} onChange={set('vehicle_plate')} placeholder="ABC1D23" className="uppercase" />
              </Field>
              <div className="sm:col-span-2">
                <Switch checked={hasMotorcycle} onChange={setHasMotorcycle} label="Tenho motocicleta própria" />
              </div>
              <Field label="Experiência" className="sm:col-span-2">
                <Textarea value={form.experience} onChange={set('experience')} rows={2} placeholder="Conte sua experiência com entregas e regiões." />
              </Field>
              <Field label="Mensagem" className="sm:col-span-2">
                <Textarea value={form.message} onChange={set('message')} rows={3} placeholder="Disponibilidade de horários, observações…" />
              </Field>
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-xs text-xs text-ink-500">
                O cadastro é uma candidatura e passa por análise interna antes da liberação de acesso.
              </p>
              <Button type="submit" loading={loading}>Enviar candidatura</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
