import { Link } from 'react-router-dom'
import {
  ArrowRight, Bike, ClipboardCheck, ClipboardList, MapPinned, PackageCheck, Receipt, ShieldCheck,
} from 'lucide-react'

const steps = [
  {
    icon: ClipboardList, who: 'Farmácia',
    title: 'Pedido criado no portal',
    text: 'A farmácia escolhe a unidade de origem, informa o endereço de coleta (pré-preenchido pelo cadastro), o destinatário, o telefone e as instruções. Pode agendar horário e marcar prioridade.',
  },
  {
    icon: ClipboardCheck, who: 'Central de despacho',
    title: 'Despacho manual ou sugestão automática',
    text: 'O despachante vê a fila, o mapa e os entregadores ativos. Pode atribuir diretamente ou usar a sugestão da plataforma, que pondera disponibilidade, cidade/região e distância até a coleta.',
  },
  {
    icon: Bike, who: 'Entregador',
    title: 'Oferta, aceite e deslocamento',
    text: 'O entregador recebe a oferta no celular, aceita ou recusa. Ao aceitar, inicia o deslocamento, confirma a coleta e atualiza cada etapa até a entrega.',
  },
  {
    icon: MapPinned, who: 'Acompanhamento',
    title: 'Rota e status com registro',
    text: 'Com autorização do entregador, a posição é registrada com data e hora. Sem autorização, o portal mostra apenas o status atual — nunca uma posição inventada.',
  },
  {
    icon: PackageCheck, who: 'Comprovação',
    title: 'Comprovante e ocorrência',
    text: 'Na entrega, o entregador envia o comprovante fotográfico. Se algo impedir a entrega, registra a ocorrência com tipo e descrição para a central tratar.',
  },
  {
    icon: Receipt, who: 'Financeiro',
    title: 'Faturamento por período',
    text: 'As entregas concluídas são agrupadas em faturas por farmácia. Pagamentos totais ou parciais são registrados manualmente e atualizam o saldo.',
  },
]

export default function HowItWorks() {
  return (
    <div>
      <header className="border-b border-ink-200 bg-gradient-to-b from-brand-50 to-white">
        <div className="container-page py-14 sm:py-20">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">Como funciona</p>
          <h1 className="mt-2 max-w-3xl font-display text-3xl font-extrabold tracking-tight text-ink-950 sm:text-4xl">
            Seis etapas, tudo registrado
          </h1>
          <p className="mt-4 max-w-2xl text-ink-600">
            O fluxo abaixo é o caminho padrão de um pedido dentro da D'Luca Connect, do cadastro ao
            financeiro.
          </p>
        </div>
      </header>

      <section className="container-page py-14">
        <div className="relative space-y-4">
          {steps.map((s, i) => (
            <div key={s.title} className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:p-6">
              <div className="flex items-center gap-3 sm:w-44 sm:shrink-0">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-950 text-brand-300">
                  <s.icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-ink-400">Etapa {i + 1}</p>
                  <p className="text-sm font-bold text-ink-950">{s.who}</p>
                </div>
              </div>
              <div className="border-l-0 sm:border-l sm:border-ink-100 sm:pl-6">
                <h2 className="text-base font-bold text-ink-950">{s.title}</h2>
                <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-600">{s.text}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-6 sm:flex-row sm:items-center">
          <ShieldCheck className="h-6 w-6 shrink-0 text-brand-700" />
          <p className="text-sm text-brand-900">
            <strong>Privacidade por padrão.</strong> O GPS do entregador só é ativado com consentimento
            explícito, e as posições exibidas sempre trazem o horário do registro. Quando não há dado
            recente, a plataforma informa a última atualização em vez de simular tempo real.
          </p>
        </div>
      </section>

      <section className="container-page pb-16">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-ink-50 p-6">
          <p className="text-sm font-medium text-ink-800">Quer ver a plataforma funcionando?</p>
          <div className="flex gap-2">
            <Link to="/orcamento" className="btn-primary">Solicitar orçamento</Link>
            <Link to="/farmacias" className="btn-secondary">Para farmácias <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </section>
    </div>
  )
}
