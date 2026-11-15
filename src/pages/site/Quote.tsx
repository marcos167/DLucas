import { MessageCircle, Phone, Clock, ShieldCheck } from 'lucide-react'
import LeadForm from '@/components/site/LeadForm'
import { PageHeader } from '@/components/site/PageSections'
import { whatsappLink } from '@/components/site/SiteLayout'

export default function Quote() {
  return (
    <div>
      <PageHeader
        eyebrow="Orçamento"
        title="Peça uma proposta para a sua farmácia"
        description="Preencha os dados da operação. As informações ajudam a calcular a proposta com base em volume, turnos e regiões de entrega."
      />
      <div className="container-page grid gap-10 py-12 lg:grid-cols-[1fr_1.15fr] lg:py-16">
        <div>
          <ul className="mt-8 space-y-3">
            {[
              { icon: Clock, t: 'Resposta em horário comercial', d: 'A equipe comercial retorna após análise dos dados enviados.' },
              { icon: ShieldCheck, t: 'Sem compromisso', d: 'O envio do formulário não gera contratação automática.' },
              { icon: Phone, t: 'Contato pelo canal informado', d: 'Telefone ou e-mail cadastrados na solicitação.' },
            ].map((i) => (
              <li key={i.t} className="flex gap-3">
                <i.icon className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" />
                <div>
                  <p className="text-sm font-semibold text-ink-900">{i.t}</p>
                  <p className="text-[13px] text-ink-600">{i.d}</p>
                </div>
              </li>
            ))}
          </ul>

          {whatsappLink('') && (
            <a
              href={whatsappLink("Olá! Quero solicitar um orçamento para transporte de medicamentos.")}
              target="_blank" rel="noreferrer"
              className="btn-secondary mt-8"
            >
              <MessageCircle className="h-4 w-4" /> Prefiro falar no WhatsApp
            </a>
          )}
        </div>
        <LeadForm type="QUOTE" />
      </div>
    </div>
  )
}
