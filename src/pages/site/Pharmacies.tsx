import { Link } from 'react-router-dom'
import {
  ArrowRight, Building2, CheckCircle2, Eye, FileDown, History, Receipt, ShieldCheck, Users, PlusCircle,
} from 'lucide-react'

const features = [
  { icon: PlusCircle, t: 'Criar pedidos de entrega', d: 'Selecione a unidade de origem, informe coleta, destino, destinatário e telefone.' },
  { icon: Eye, t: 'Acompanhar status', d: 'Veja cada pedido avançar de aguardando despacho até entregue.' },
  { icon: Users, t: 'Ver o entregador autorizado', d: 'Quando o entregador permite, o portal mostra quem está com a entrega.' },
  { icon: History, t: 'Consultar histórico', d: 'Filtre por período, unidade e status e consulte o histórico completo.' },
  { icon: FileDown, t: 'Baixar comprovantes', d: 'Fotos e documentos enviados na entrega ficam vinculados ao pedido.' },
  { icon: Receipt, t: 'Valores e faturas', d: 'Consulte valores por entrega, faturas emitidas e pagamentos registrados.' },
  { icon: Building2, t: 'Gerenciar unidades', d: 'O gestor da farmácia cadastra filiais e mantém endereços de coleta.' },
  { icon: Users, t: 'Gerenciar funcionários', d: 'Conforme permissão, o gestor administra os acessos da sua equipe.' },
]

export default function Pharmacies() {
  return (
    <div>
      <header className="border-b border-ink-200 bg-gradient-to-b from-brand-50 to-white">
        <div className="container-page grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">Para farmácias</p>
            <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-ink-950 sm:text-4xl">
              Um portal exclusivo para a sua farmácia
            </h1>
            <p className="mt-4 max-w-xl text-ink-600">
              Cada farmácia acessa somente as próprias informações: pedidos, unidades, funcionários,
              comprovantes e financeiro. O isolamento entre clientes é garantido pelas políticas de
              segurança do banco de dados.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/orcamento" className="btn-primary">Quero uma demonstração <ArrowRight className="h-4 w-4" /></Link>
              <Link to="/entrar" className="btn-secondary">Já sou cliente · entrar</Link>
            </div>
          </div>
          <div className="card p-6">
            <div className="flex items-center gap-3 border-b border-ink-100 pb-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-bold text-ink-950">Isolamento por farmácia</p>
                <p className="text-xs text-ink-500">Row Level Security no PostgreSQL</p>
              </div>
            </div>
            <ul className="mt-4 space-y-2.5">
              {[
                'Pedidos visíveis apenas para a farmácia de origem',
                'Funcionários restritos ao próprio vínculo',
                'Rastreamento só com consentimento do entregador',
                'Comprovantes em bucket privado com URL assinada',
                'Faturas e pagamentos auditáveis',
              ].map((t) => (
                <li key={t} className="flex items-start gap-2 text-sm text-ink-700">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" /> {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </header>

      <section className="container-page py-14">
        <h2 className="section-title">O que a farmácia faz na plataforma</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.t} className="card p-5">
              <f.icon className="h-5 w-5 text-brand-700" />
              <h3 className="mt-3 text-sm font-bold text-ink-950">{f.t}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-600">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-ink-200 bg-ink-50/70">
        <div className="container-page py-16">
          <h2 className="section-title">Farmacêutico responsável, operação visível</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              { t: 'Origem e destino registrados', d: 'Endereço estruturado, instruções de coleta e identificação do destinatário com telefone.' },
              { t: 'Ocorrências padronizadas', d: 'Destinatário ausente, endereço incorreto, embalagem danificada e outros tipos com descrição.' },
              { t: 'Comprovante da entrega', d: 'Registro fotográfico e assinatura quando a entrega exige comprovação.' },
            ].map((i) => (
              <div key={i.t} className="card p-6">
                <p className="text-sm font-bold text-ink-950">{i.t}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-600">{i.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container-page py-16">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-ink-950 p-8 text-white">
          <div>
            <p className="font-display text-xl font-bold">Pronto para começar?</p>
            <p className="mt-1 text-sm text-ink-300">Solicite o cadastro da sua farmácia e receba os acessos.</p>
          </div>
          <Link to="/orcamento" className="btn bg-white text-ink-950 hover:bg-brand-50">
            Falar com a equipe <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  )
}
