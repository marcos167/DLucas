import { Link } from 'react-router-dom'
import {
  ArrowRight, Bike, Clock, FileText, MapPin, ShieldCheck, Thermometer, Wallet, Boxes,
} from 'lucide-react'
import { CtaBand, FeatureCard, PageHeader } from '@/components/site/PageSections'

const services = [
  {
    icon: Bike,
    title: 'Motoboy dedicado para farmácias',
    text: 'Coletas programadas ou sob demanda na unidade da farmácia, com destino ao paciente, clínica ou ponto de retirada.',
    bullets: ['Coleta na unidade de origem', 'Entrega com confirmação', 'Registro de volumes'],
  },
  {
    icon: Thermometer,
    title: 'Transporte de itens sensíveis',
    text: 'Pedidos marcados como refrigerados ou com exigência de cuidado são identificados na plataforma e tratados na operação.',
    bullets: ['Marcação de temperatura controlada', 'Orientação na coleta', 'Comprovante da entrega'],
  },
  {
    icon: Boxes,
    title: 'Rotinas para farmácias de manipulação',
    text: 'Suporte ao fluxo de fórmulas manipuladas: identificação do destinatário, instruções de entrega e registro de ocorrências.',
    bullets: ['Instruções por pedido', 'Ocorrências tipificadas', 'Histórico por unidade'],
  },
  {
    icon: Clock,
    title: 'Agendamento e prioridade',
    text: 'Defina janelas de coleta, prazos e prioridade do pedido. A central visualiza a fila e distribui com critério.',
    bullets: ['Prioridade normal, alta e urgente', 'Agendamento por data', 'Fila operacional'],
  },
  {
    icon: MapPin,
    title: 'Acompanhamento com autorização',
    text: 'Quando o entregador autoriza o compartilhamento, a posição é registrada durante a entrega e exibida com horário.',
    bullets: ['Consentimento explícito', 'Posição com timestamp', 'Sem simulação de dados'],
  },
  {
    icon: Wallet,
    title: 'Controle financeiro',
    text: 'Valores por entrega, contratos, faturas, pagamentos totais ou parciais e relatórios por período.',
    bullets: ['Tabela por contrato', 'Faturas e vencimentos', 'Pagamento parcial'],
  },
]

export default function Services() {
  return (
    <div>
      <PageHeader
        eyebrow="Serviços"
        title="Transporte e logística de medicamentos com processo definido"
        description="Os serviços abaixo descrevem o que a plataforma DLucas Express suporta hoje. A proposta comercial é montada caso a caso, conforme volume, regiões e horários da sua operação."
      />

      <section className="container-page py-14">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => (
            <FeatureCard key={s.title} icon={<s.icon className="h-5 w-5" />} title={s.title} bullets={s.bullets}>
              {s.text}
            </FeatureCard>
          ))}
        </div>
      </section>

      <section className="container-page pb-16">
        <div className="grid gap-6 rounded-2xl border border-ink-200/70 bg-gradient-to-b from-white to-ink-50/60 p-6 shadow-card sm:grid-cols-3 sm:p-8">
          {[
            { icon: ShieldCheck, t: 'Processo rastreável', d: 'Cada etapa do pedido gera registro com responsável e horário.' },
            { icon: FileText, t: 'Documentação organizada', d: 'Comprovantes e ocorrências vinculados ao pedido e à farmácia.' },
            { icon: Wallet, t: 'Prestação de contas', d: 'Faturas por período com detalhamento por entrega.' },
          ].map((i) => (
            <div key={i.t} className="flex gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200/60">
                <i.icon className="h-4 w-4" />
              </span>
              <div>
                <p className="text-[13.5px] font-bold text-ink-950">{i.t}</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-600">{i.d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <CtaBand
        title="Quer entender qual formato se encaixa na sua farmácia?"
        description="Conte como é a sua operação. A equipe comercial responde com uma proposta adequada ao seu volume e às suas regiões de entrega."
        actions={
          <>
            <Link to="/orcamento" className="btn-accent btn-sheen group">
              Solicitar orçamento
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
            <Link
              to="/como-funciona"
              className="btn-secondary"
            >
              Ver como funciona
            </Link>
          </>
        }
      />
    </div>
  )
}
