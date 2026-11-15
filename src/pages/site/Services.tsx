import { Link } from 'react-router-dom'
import {
  ArrowRight, Bike, Clock, FileText, MapPin, PackageCheck, ShieldCheck, Thermometer, Wallet, Boxes,
} from 'lucide-react'

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
      <header className="border-b border-ink-200 bg-gradient-to-b from-brand-50 to-white">
        <div className="container-page py-14 sm:py-20">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">Serviços</p>
          <h1 className="mt-2 max-w-3xl font-display text-3xl font-extrabold tracking-tight text-ink-950 sm:text-4xl">
            Transporte e logística de medicamentos com processo definido
          </h1>
          <p className="mt-4 max-w-2xl text-ink-600">
            Os serviços abaixo descrevem o que a plataforma D'Luca Connect suporta hoje. A proposta
            comercial é montada caso a caso, conforme volume, regiões e horários da sua operação.
          </p>
        </div>
      </header>

      <section className="container-page py-14">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => (
            <div key={s.title} className="card flex flex-col p-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                <s.icon className="h-5 w-5" />
              </div>
              <h2 className="mt-4 font-display text-base font-bold text-ink-950">{s.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{s.text}</p>
              <ul className="mt-4 space-y-1.5 border-t border-ink-100 pt-4">
                {s.bullets.map((b) => (
                  <li key={b} className="flex items-center gap-2 text-[13px] text-ink-700">
                    <PackageCheck className="h-3.5 w-3.5 text-brand-600" /> {b}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="container-page pb-16">
        <div className="card grid gap-6 p-6 sm:grid-cols-3 sm:p-8">
          {[
            { icon: ShieldCheck, t: 'Processo rastreável', d: 'Cada etapa do pedido gera registro com responsável e horário.' },
            { icon: FileText, t: 'Documentação organizada', d: 'Comprovantes e ocorrências vinculados ao pedido e à farmácia.' },
            { icon: Wallet, t: 'Prestação de contas', d: 'Faturas por período com detalhamento por entrega.' },
          ].map((i) => (
            <div key={i.t} className="flex gap-3">
              <i.icon className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" />
              <div>
                <p className="text-sm font-bold text-ink-950">{i.t}</p>
                <p className="mt-0.5 text-[13px] text-ink-600">{i.d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="container-page pb-20">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-ink-50 p-6">
          <p className="text-sm font-medium text-ink-800">
            Quer entender qual formato se encaixa na sua farmácia?
          </p>
          <Link to="/orcamento" className="btn-primary">Solicitar orçamento <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>
    </div>
  )
}
