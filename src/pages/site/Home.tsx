import { Link } from 'react-router-dom'
import {
  ArrowRight, ArrowUpRight, Bike, Boxes, CheckCircle2, ClipboardList, FileText,
  MapPin, ShieldCheck, Thermometer, Wallet, Building2, Users,
} from 'lucide-react'
import { whatsappLink } from '@/components/site/SiteLayout'

const pillars = [
  {
    number: '01', icon: Thermometer, title: 'Cuidado em primeiro lugar',
    text: 'Fluxo pensado para farmácias de manipulação, com identificação de itens sensíveis à temperatura e conferência em cada etapa.',
  },
  {
    number: '02', icon: Boxes, title: 'Operação sob controle',
    text: 'Origem, destino, volumes, instruções e responsáveis registrados em um único lugar. Clareza para quem solicita e para quem entrega.',
  },
  {
    number: '03', icon: ShieldCheck, title: 'Visibilidade com respeito',
    text: 'Acompanhamento de localização apenas quando o entregador autoriza o compartilhamento. Transparência sem abrir mão da privacidade.',
  },
]

const workflow = [
  { step: '01', title: 'Solicitação', text: 'A farmácia registra unidade, destinatário e instruções do pedido.' },
  { step: '02', title: 'Despacho', text: 'A central distribui a entrega e acompanha a fila operacional.' },
  { step: '03', title: 'Entrega', text: 'O entregador aceita a oferta e atualiza cada etapa da rota.' },
  { step: '04', title: 'Comprovação', text: 'Status, ocorrências e comprovante ficam vinculados ao pedido.' },
]

const audiences = [
  { icon: Building2, title: 'Farmácias de manipulação', text: 'Pedidos, acompanhamento, comprovantes e faturas em um portal exclusivo.', to: '/farmacias', cta: 'Conhecer o portal' },
  { icon: ClipboardList, title: 'Central de despacho', text: 'Distribuição, mapa operacional, ocorrências e visão consolidada da operação.', to: '/servicos', cta: 'Explorar recursos' },
  { icon: Bike, title: 'Entregadores', text: 'Ofertas e etapas da entrega em uma experiência criada para o celular.', to: '/entregadores', cta: 'Fazer parte da rede' },
]

const capabilities = [
  { icon: FileText, title: 'Comprovantes digitalizados' },
  { icon: Wallet, title: 'Faturas e pagamentos parciais' },
  { icon: MapPin, title: 'Mapa operacional' },
  { icon: Users, title: 'Permissões por perfil' },
  { icon: ClipboardList, title: 'Auditoria de atividades' },
  { icon: CheckCircle2, title: 'Histórico por pedido' },
]

export default function Home() {
  return (
    <div>
      <section className="site-hero relative isolate flex min-h-[690px] flex-col justify-end overflow-hidden bg-ink-50 text-ink-950 sm:min-h-[720px] lg:min-h-[760px]">
        <img
          src="/images/hero-daylight.jpg"
          alt=""
          aria-hidden="true"
          loading="eager"
          className="absolute inset-0 -z-20 h-full w-full object-cover object-[64%_center] opacity-60 sm:opacity-100"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-ink-50 via-ink-50/95 to-ink-50/20" aria-hidden="true" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink-50/95 via-transparent to-white/15" aria-hidden="true" />
        <div className="container-page relative flex flex-1 flex-col justify-center pb-12 pt-20 sm:pt-24 lg:pb-20">
          <p className="site-reveal flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-700">
            <span className="h-px w-9 bg-brand-400" aria-hidden="true" /> DLucas Express / Logística em saúde
          </p>
          <h1 className="site-reveal mt-9 max-w-[930px] font-display text-[clamp(2.75rem,6.2vw,6.15rem)] font-medium leading-[1.07] tracking-[-0.055em] text-ink-950 [animation-delay:90ms]">
            Cada entrega carrega <span className="font-editorial italic font-normal tracking-[-0.04em] text-brand-700">algo essencial.</span>
          </h1>
          <p className="site-reveal mt-8 max-w-[590px] text-[15px] leading-[1.85] text-ink-700 sm:text-[17px] [animation-delay:180ms]">
            Tecnologia e operação para o transporte de medicamentos. Da solicitação ao comprovante, conectamos farmácias, despacho e entregadores com precisão e cuidado.
          </p>
          <div className="site-reveal mt-10 flex flex-wrap gap-3 [animation-delay:270ms]">
            <Link to="/orcamento" className="site-button-ink group inline-flex min-h-12 items-center gap-6 px-7 py-3.5 text-[12px] font-bold uppercase tracking-[0.12em]">
              Solicitar proposta <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>
            <Link to="/servicos" className="site-button-outline inline-flex min-h-12 items-center gap-6 px-7 py-3.5 text-[12px] font-bold uppercase tracking-[0.12em]">
              Explorar serviços <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
        <div className="border-t border-ink-200/70 bg-white/85 backdrop-blur-sm">
          <div className="container-page grid gap-4 py-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-700 sm:grid-cols-3 sm:gap-8">
            <span><span className="mr-3 text-brand-700">01 /</span> Pedidos centralizados</span>
            <span><span className="mr-3 text-brand-700">02 /</span> Despacho coordenado</span>
            <span><span className="mr-3 text-brand-700">03 /</span> Acompanhamento autorizado</span>
          </div>
        </div>
      </section>

      <section className="container-page grid gap-10 py-20 sm:py-28 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20 lg:py-36">
        <div>
          <p className="site-kicker">A nossa perspectiva</p>
          <h2 className="site-heading mt-6 max-w-lg">Excelência está <em>nos detalhes.</em></h2>
        </div>
        <div className="flex flex-col justify-end border-l border-brand-400/40 pl-6 sm:pl-10">
          <p className="max-w-xl font-display text-[18px] leading-[1.65] text-ink-800 sm:text-[22px]">
            Em saúde, uma entrega não é apenas um trajeto. É a continuidade de um cuidado que começou muito antes da coleta.
          </p>
          <p className="mt-6 max-w-xl text-[15px] leading-8 text-ink-600">
            Por isso, a DLucas Express reúne pessoas, processos e informação numa experiência operacional mais clara para cada parte envolvida.
          </p>
          <Link to="/como-funciona" className="site-text-link mt-8 inline-flex w-fit items-center gap-3 text-xs font-bold uppercase tracking-[0.12em]">
            Entenda nosso processo <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className="bg-white py-20 sm:py-28">
        <div className="container-page">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="site-kicker">O que nos move</p>
              <h2 className="site-heading mt-5 max-w-2xl">Uma operação feita para <em>inspirar confiança.</em></h2>
            </div>
            <p className="max-w-xs text-sm leading-7 text-ink-600">Uma experiência em que visibilidade, disciplina e respeito caminham juntos.</p>
          </div>
          <div className="mt-12 grid border-t border-ink-200 md:grid-cols-3">
            {pillars.map((pillar) => (
              <article key={pillar.number} className="site-feature group border-b border-ink-200 px-1 py-10 md:border-r md:px-8 md:last:border-r-0 lg:px-10">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold tracking-[0.2em] text-brand-700">{pillar.number} / 03</span>
                  <pillar.icon className="h-6 w-6 text-brand-600 transition-transform duration-300 group-hover:-translate-y-1" strokeWidth={1.3} />
                </div>
                <h3 className="mt-16 max-w-xs font-display text-[23px] font-medium tracking-[-0.04em] text-ink-950">{pillar.title}</h3>
                <p className="mt-4 max-w-xs text-[14px] leading-7 text-ink-600">{pillar.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-ink-200 bg-brand-50 py-20 text-ink-950 sm:py-28">
        <div className="container-page grid items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-20">
          <div className="relative overflow-hidden border border-ink-200 bg-white">
            <img src="/images/editorial-care.jpg" alt="Entrega cuidadosa de uma encomenda na recepção de uma farmácia" loading="lazy" decoding="async" className="aspect-[4/3] w-full object-cover" />
            <span className="absolute bottom-0 left-0 border-r border-t border-brand-400/30 bg-white/95 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-700 backdrop-blur">O cuidado em movimento</span>
          </div>
          <div>
            <p className="site-kicker">Processo com propósito</p>
            <h2 className="mt-6 max-w-xl font-display text-[clamp(2.4rem,4vw,4.5rem)] font-medium leading-[1.12] tracking-[-0.05em]">Do pedido à entrega, <span className="font-editorial italic text-brand-700">sem perder o fio.</span></h2>
            <p className="mt-6 max-w-lg text-[15px] leading-8 text-ink-600">Cada etapa ganha contexto, responsável e registro. O resultado é uma operação mais organizada para a farmácia e mais clara para quem realiza a entrega.</p>
            <Link to="/servicos" className="site-text-link mt-9 inline-flex items-center gap-3 text-xs font-bold uppercase tracking-[0.12em]">Conhecer os serviços <ArrowUpRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </section>

      <section className="container-page py-20 sm:py-28">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div><p className="site-kicker">Nosso método</p><h2 className="site-heading mt-5">Clareza em <em>cada etapa.</em></h2></div>
          <Link to="/como-funciona" className="site-text-link inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em]">Ver detalhes <ArrowUpRight className="h-4 w-4" /></Link>
        </div>
        <ol className="mt-12 grid border-t border-ink-200 sm:grid-cols-2 lg:grid-cols-4">
          {workflow.map((item) => (
            <li key={item.step} className="border-b border-ink-200 py-8 sm:pr-7 lg:border-r lg:px-7 lg:first:pl-0 lg:last:border-r-0">
              <span className="font-editorial text-[38px] italic text-brand-600">{item.step}</span>
              <h3 className="mt-6 font-display text-[18px] font-semibold tracking-[-0.03em] text-ink-950">{item.title}</h3>
              <p className="mt-3 text-[14px] leading-7 text-ink-600">{item.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-white py-20 sm:py-28">
        <div className="container-page">
          <p className="site-kicker">Uma plataforma, diferentes perspectivas</p>
          <h2 className="site-heading mt-5 max-w-3xl">Conectamos quem <em>faz acontecer.</em></h2>
          <div className="mt-12 grid gap-4 lg:grid-cols-3">
            {audiences.map((audience) => (
              <Link key={audience.title} to={audience.to} className="site-audience group flex min-h-[330px] flex-col border border-ink-200 bg-ink-50 p-7 transition-all duration-300 hover:-translate-y-1 hover:border-brand-400 hover:shadow-[0_18px_40px_-20px_rgb(9_9_9/0.22)] sm:p-9">
                <audience.icon className="h-7 w-7 text-brand-700" strokeWidth={1.3} />
                <div className="mt-auto pt-14">
                  <h3 className="font-display text-[23px] font-medium tracking-[-0.04em] text-ink-950">{audience.title}</h3>
                  <p className="mt-3 max-w-sm text-[14px] leading-7 text-ink-600">{audience.text}</p>
                  <span className="mt-7 inline-flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-700">{audience.cta} <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-brand-400/30 bg-gradient-to-r from-[#f0e9dc] via-ink-50 to-white py-20 text-ink-950 sm:py-28">
        <div className="container-page grid gap-12 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div>
            <p className="site-kicker">O próximo passo</p>
            <h2 className="mt-5 max-w-2xl font-display text-[clamp(2.4rem,4.2vw,4.8rem)] font-medium leading-[1.12] tracking-[-0.05em]">Uma nova referência para a <span className="font-editorial italic text-brand-700">sua operação.</span></h2>
          </div>
          <div className="lg:pl-16">
            <p className="max-w-lg text-[15px] leading-8 text-ink-600">Conte como funciona a logística da sua farmácia. Nossa equipe prepara uma proposta de acordo com volume, regiões e necessidades da sua operação.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/orcamento" className="site-button-ink inline-flex items-center gap-4 px-6 py-3.5 text-xs font-bold uppercase tracking-[0.12em]">Solicitar orçamento <ArrowUpRight className="h-4 w-4" /></Link>
              {whatsappLink('') && <a href={whatsappLink("Olá! Quero saber mais sobre a DLucas Express.")} target="_blank" rel="noreferrer" className="site-button-outline inline-flex items-center px-6 py-3.5 text-xs font-bold uppercase tracking-[0.12em]">Falar no WhatsApp</a>}
              <Link to="/empresas" className="site-button-outline inline-flex items-center gap-2 px-6 py-3.5 text-xs font-bold uppercase tracking-[0.12em]"><Users className="h-4 w-4" /> Nova empresa</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="container-page py-16 sm:py-20" aria-label="Recursos da plataforma">
        <div className="grid gap-x-10 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          {capabilities.map((capability) => (
            <div key={capability.title} className="flex items-center gap-4 border-b border-ink-200 pb-5">
              <capability.icon className="h-5 w-5 shrink-0 text-brand-700" strokeWidth={1.4} />
              <span className="text-[13px] font-medium text-ink-800">{capability.title}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
