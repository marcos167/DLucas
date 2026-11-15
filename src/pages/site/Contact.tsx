import { Mail, MessageCircle, Clock, MapPin } from 'lucide-react'
import LeadForm from '@/components/site/LeadForm'
import { PageHeader } from '@/components/site/PageSections'
import { whatsappLink, WHATSAPP_NUMBER } from '@/components/site/SiteLayout'

export default function Contact() {
  const wa = whatsappLink("Olá! Vim pelo site da D'Luca Connect.")
  return (
    <div>
      <PageHeader
        eyebrow="Contato"
        title="Fale com a D'Luca"
        description="Envie sua mensagem pelo formulário ou utilize os canais de atendimento abaixo."
      />

      <div className="container-page grid gap-8 py-12 lg:grid-cols-[1fr_1.15fr] lg:py-16">
        <div className="space-y-3">
          {wa && (
            <a href={wa} target="_blank" rel="noreferrer" className="card flex items-center gap-4 p-5 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-card-hover">
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
