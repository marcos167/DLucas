import { Mail, MessageCircle, Clock, MapPin } from 'lucide-react'
import LeadForm from '@/components/site/LeadForm'
import { whatsappLink, WHATSAPP_NUMBER } from '@/components/site/SiteLayout'

export default function Contact() {
  const wa = whatsappLink("Olá! Vim pelo site da D'Luca Connect.")
  return (
    <div className="container-page py-12 lg:py-16">
      <div className="max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">Contato</p>
        <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-ink-950 sm:text-4xl">
          Fale com a D'Luca
        </h1>
        <p className="mt-4 text-ink-600">
          Envie sua mensagem pelo formulário ou utilize os canais de atendimento abaixo.
        </p>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_1.15fr]">
        <div className="space-y-3">
          {wa && (
            <a href={wa} target="_blank" rel="noreferrer" className="card flex items-center gap-4 p-5 transition hover:shadow-lift">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <MessageCircle className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-bold text-ink-950">WhatsApp</p>
                <p className="text-[13px] text-ink-600">Atendimento comercial e suporte</p>
              </div>
            </a>
          )}
          <div className="card flex items-center gap-4 p-5">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <Mail className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-bold text-ink-950">E-mail</p>
              <p className="text-[13px] text-ink-600">
                Use o formulário ao lado — sua mensagem chega direto à equipe.
              </p>
            </div>
          </div>
          <div className="card flex items-center gap-4 p-5">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink-100 text-ink-700">
              <Clock className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-bold text-ink-950">Horário de atendimento</p>
              <p className="text-[13px] text-ink-600">Segunda a sexta, horário comercial.</p>
            </div>
          </div>
          <div className="card flex items-center gap-4 p-5">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink-100 text-ink-700">
              <MapPin className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-bold text-ink-950">Área de atuação</p>
              <p className="text-[13px] text-ink-600">
                Consulte a disponibilidade para a sua região pelo formulário.
              </p>
            </div>
          </div>
          {!WHATSAPP_NUMBER && (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-900">
              O número de WhatsApp ainda não foi configurado nesta instalação
              (variável <code>VITE_COMPANY_WHATSAPP</code>).
            </p>
          )}
        </div>
        <LeadForm type="QUOTE" />
      </div>
    </div>
  )
}
