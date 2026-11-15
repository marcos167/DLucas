import { Link } from 'react-router-dom'
import {
  ArrowRight, Bike, Boxes, CheckCircle2, ClipboardList, Clock, FileText, MapPin,
  PackageCheck, ShieldCheck, Thermometer, Wallet, Building2, Users,
} from 'lucide-react'
import { whatsappLink } from '@/components/site/SiteLayout'

const pillars = [
  {
    icon: Thermometer,
    title: 'Cuidado com medicamentos',
    text: 'Fluxo pensado para farmácias de manipulação: identificação de itens sensíveis à temperatura e conferência na coleta e na entrega.',
  },
  {
    icon: Boxes,
    title: 'Operação organizada',
    text: 'Cada pedido tem origem, destino, volumes, prazo e responsável registrados. Nada depende de mensagem solta em aplicativo.',
  },
  {
    icon: ShieldCheck,
    title: 'Rastreamento autorizado',
    text: 'O acompanhamento de rota só é exibido quando o entregador autoriza o compartilhamento de localização.',
  },
]

const workflow = [
  { step: '01', title: 'A farmácia cadastra o pedido', text: 'Unidade de origem, endereço de coleta, destinatário e instruções.' },
  { step: '02', title: 'A central despacha', text: 'O despachante escolhe o entregador ou usa a sugestão automática.' },
  { step: '03', title: 'O entregador aceita', text: 'Recebe a oferta, confirma a coleta e atualiza cada etapa.' },
  { step: '04', title: 'Acompanhamento e comprovante', text: 'Status em tempo real, ocorrências registradas e comprovante arquivado.' },
]

export default function Home() {
  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden bg-ink-950 text-white">
        <div className="pointer-events-none absolute -left-32 top-0 h-96 w-96 rounded-full bg-brand-600/25 blur-3xl" />
        <div className="pointer-events-none absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />
        <div className="container-page relative grid items-center gap-12 py-16 lg:grid-cols-2 lg:py-24">
          <div className="animate-fade-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-brand-200">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-300" />
              Logística para saúde
            </span>
            <h1 className="mt-5 font-display text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.4rem]">
              Transporte de medicamentos com
              <span className="text-brand-300"> controle de ponta a ponta</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-300 sm:text-lg">
              A D'Luca Connect conecta farmácias de manipulação, central de despacho e motoboys
              em uma única plataforma: pedidos, distribuição, acompanhamento e financeiro.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/orcamento" className="btn-primary bg-brand-500 hover:bg-brand-400">
                Solicitar orçamento <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/entrar" className="btn border border-white/20 bg-white/5 text-white hover:bg-white/10">
                Acessar plataforma
              </Link>
            </div>
            <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-white/10 pt-6 text-sm">
              {[
                { k: 'Pedidos', v: 'Centralizados' },
                { k: 'Despacho', v: 'Manual e automático' },
                { k: 'Financeiro', v: 'Faturas e repasses' },
              ].map((i) => (
                <div key={i.k}>
                  <dt className="text-[11px] uppercase tracking-wider text-ink-500">{i.k}</dt>
                  <dd className="mt-1 font-semibold text-white">{i.v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative animate-fade-up">
            <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/10 to-white/[0.03] p-3 shadow-2xl backdrop-blur">
              <div className="rounded-2xl bg-white p-5 text-ink-900">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Pedido em rota</p>
                    <p className="font-display text-lg font-bold">DLC-2611-01042</p>
                  </div>
                  <span className="badge bg-blue-100 text-blue-800">Em rota</span>
                </div>
                <div className="mt-4 space-y-3.5">
                  <div className="flex gap-3">
                    <div className="mt-1 flex flex-col items-center">
                      <span className="h-2.5 w-2.5 rounded-full bg-brand-600" />
                      <span className="my-1 h-8 w-px bg-ink-200" />
                      <span className="h-2.5 w-2.5 rounded-full border-2 border-ink-400" />
                    </div>
                    <div className="space-y-3 text-sm">
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-ink-400">Coleta</p>
                        <p className="font-medium">Farmácia · Unidade Centro</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-ink-400">Destino</p>
                        <p className="font-medium">Paciente · Jardim Paulista</p>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 rounded-xl bg-ink-50 p-3 text-xs">
                    <div className="flex items-center gap-1.5 text-ink-600"><Thermometer className="h-3.5 w-3.5" /> Refrigerado</div>
                    <div className="flex items-center gap-1.5 text-ink-600"><PackageCheck className="h-3.5 w-3.5" /> 2 volumes</div>
                    <div className="flex items-center gap-1.5 text-ink-600"><Clock className="h-3.5 w-3.5" /> Previsão 40 min</div>
                    <div className="flex items-center gap-1.5 text-ink-600"><MapPin className="h-3.5 w-3.5" /> 6,2 km</div>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-dashed border-ink-200 px-3 py-2 text-xs text-ink-500">
                  <ShieldCheck className="h-3.5 w-3.5 text-brand-600" />
                  Localização visível apenas com autorização do entregador
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PILARES */}
      <section className="container-page py-16 sm:py-20">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">Por que D'Luca Connect</p>
          <h2 className="section-title mt-2">Tecnologia e operação no mesmo lugar</h2>
          <p className="mt-3 text-ink-600">
            A plataforma foi desenhada para quem movimenta medicamentos todos os dias e precisa de
            registro, previsibilidade e prestação de contas.
          </p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pillars.map((p) => (
            <div key={p.title} className="card p-6 transition hover:shadow-lift">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                <p.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-display text-base font-bold text-ink-950">{p.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{p.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FLUXO */}
      <section className="border-y border-ink-200 bg-ink-50/70">
        <div className="container-page py-16 sm:py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">Como funciona</p>
              <h2 className="section-title mt-2">Do pedido ao comprovante</h2>
            </div>
            <Link to="/como-funciona" className="link-quiet text-sm font-semibold">Ver detalhes →</Link>
          </div>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {workflow.map((w) => (
              <li key={w.step} className="card p-5">
                <span className="font-display text-2xl font-extrabold text-brand-200">{w.step}</span>
                <h3 className="mt-2 text-sm font-bold text-ink-950">{w.title}</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-600">{w.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* PERFIS */}
      <section className="container-page py-16 sm:py-20">
        <div className="grid gap-4 lg:grid-cols-3">
          {[
            {
              icon: Building2, title: 'Farmácias de manipulação',
              text: 'Crie pedidos, acompanhe entregas, baixe comprovantes e consulte faturas em um portal exclusivo.',
              to: '/farmacias', cta: 'Conhecer o portal',
            },
            {
              icon: ClipboardList, title: 'Central de despacho',
              text: 'Dashboards operacionais, distribuição manual ou por sugestão, mapa de entregas e ocorrências.',
              to: '/servicos', cta: 'Ver recursos',
            },
            {
              icon: Bike, title: 'Entregadores',
              text: 'Área mobile-first: ofertas, aceite, etapas da entrega, ocorrências e comprovantes.',
              to: '/entregadores', cta: 'Quero ser entregador',
            },
          ].map((c) => (
            <div key={c.title} className="card flex flex-col p-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink-950 text-brand-300">
                <c.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-display text-lg font-bold text-ink-950">{c.title}</h3>
              <p className="mt-1.5 flex-1 text-sm leading-relaxed text-ink-600">{c.text}</p>
              <Link to={c.to} className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:gap-2.5 transition-all">
                {c.cta} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container-page pb-8">
        <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-brand-800 to-ink-950 px-6 py-12 text-center sm:px-12">
          <h2 className="font-display text-2xl font-extrabold text-white sm:text-3xl">
            Pronto para organizar o transporte da sua farmácia?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-brand-100/80">
            Conte como é a sua operação. Nossa equipe responde com uma proposta comercial adequada
            ao seu volume e às suas regiões de entrega.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link to="/orcamento" className="btn bg-white text-ink-950 hover:bg-brand-50">
              Solicitar orçamento <ArrowRight className="h-4 w-4" />
            </Link>
            {whatsappLink('') && (
              <a href={whatsappLink("Olá! Quero saber mais sobre a D'Luca Connect.")} target="_blank" rel="noreferrer"
                 className="btn border border-white/25 bg-white/5 text-white hover:bg-white/10">
                Falar no WhatsApp
              </a>
            )}
            <Link to="/empresas" className="btn border border-white/25 bg-white/5 text-white hover:bg-white/10">
              <Users className="h-4 w-4" /> Nova empresa
            </Link>
          </div>
        </div>
      </section>

      {/* RECURSOS */}
      <section className="container-page py-14">
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: FileText, t: 'Comprovantes digitalizados' },
            { icon: Wallet, t: 'Faturas com pagamento parcial' },
            { icon: MapPin, t: 'Mapa operacional de entregas' },
            { icon: Users, t: 'Permissões por perfil de usuário' },
            { icon: ClipboardList, t: 'Auditoria de atividades' },
            { icon: CheckCircle2, t: 'Histórico completo por pedido' },
          ].map((f) => (
            <div key={f.t} className="flex items-center gap-3 rounded-xl border border-ink-200/70 px-4 py-3">
              <f.icon className="h-4 w-4 text-brand-700" />
              <span className="text-sm font-medium text-ink-800">{f.t}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
