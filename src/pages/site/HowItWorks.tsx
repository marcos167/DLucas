import { Link } from 'react-router-dom'
import {
  ArrowRight, Bike, ClipboardCheck, ClipboardList, MapPinned, PackageCheck, Receipt, ShieldCheck,
} from 'lucide-react'
import { CtaBand, PageHeader } from '@/components/site/PageSections'

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
      <PageHeader
        eyebrow="Como funciona"
        title="Seis etapas, tudo registrado"
        description="O fluxo abaixo é o caminho padrão de um pedido dentro da D'Luca Connect, do cadastro ao financeiro."
      />

      <section className="container-page py-14">
        <div className="relative">
          {/* trilha vertical que conecta as etapas — esvanece no fim */}
          <span
            className="pointer-events-none absolute bottom-8 left-[1.4rem] top-8 hidden w-px sm:block"
            style={{
              background: 'linear-gradient(to bottom, rgb(18 185 140 / 0.5), rgb(18 185 140 / 0.08) 85%, transparent)',
            }}
            aria-hidden="true"
          />
          <div className="space-y-4">
            {steps.map((s, i) => (
              <div
                key={s.title}
                className="group relative flex flex-col gap-4 rounded-2xl border border-ink-200/70 bg-white p-5 shadow-card transition-all duration-200 ease-out hover:border-brand-200 hover:shadow-card-hover sm:flex-row sm:items-start sm:p-6"
              >
                <div className="flex items-center gap-3 sm:w-48 sm:shrink-0">
                  <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-ink-950 to-ink-900 text-brand-300 shadow-lift ring-1 ring-inset ring-white/10">
                    <s.icon className="h-5 w-5" />
                    {/* número da etapa no canto do ícone */}
                    <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white shadow-[0_2px_6px_rgb(9_95_77/0.45)] ring-2 ring-white tabular">
                      {i + 1}
                    </span>
                  </span>
                  <div>
                    <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-400">Etapa {i + 1}</p>
                    <p className="text-[13.5px] font-bold text-ink-950">{s.who}</p>
                  </div>
                </div>
                <div className="min-w-0 border-l-0 sm:border-l sm:border-ink-100 sm:pl-6">
                  <h2 className="font-display text-title-sm text-ink-950">{s.title}</h2>
                  <p className="mt-1.5 max-w-3xl text-[13.5px] leading-relaxed text-ink-600">{s.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-4 rounded-2xl border border-brand-200/80 bg-gradient-to-br from-brand-50 to-white p-6 shadow-card sm:flex-row sm:items-start">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-brand-700 shadow-xs ring-1 ring-inset ring-brand-200">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <p className="text-[13.5px] leading-relaxed text-brand-900">
            <strong>Privacidade por padrão.</strong> O GPS do entregador só é ativado com consentimento
            explícito, e as posições exibidas sempre trazem o horário do registro. Quando não há dado
            recente, a plataforma informa a última atualização em vez de simular tempo real.
          </p>
        </div>
      </section>

      <CtaBand
        title="Quer ver a plataforma funcionando?"
        description="Solicite uma demonstração guiada com base na sua operação, ou conheça o portal das farmácias."
        actions={
          <>
            <Link to="/orcamento" className="btn-accent btn-sheen group">
              Solicitar orçamento
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
            <Link
              to="/farmacias"
              className="btn border border-white/15 bg-white/[0.06] text-white shadow-inner-light backdrop-blur-sm transition hover:border-white/25 hover:bg-white/10"
            >
              Para farmácias
            </Link>
          </>
        }
      />
    </div>
  )
}
