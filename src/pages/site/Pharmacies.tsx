import { Link } from 'react-router-dom'
import {
  ArrowRight, Building2, CheckCircle2, Eye, FileDown, History, Receipt, ShieldCheck, Users, PlusCircle,
} from 'lucide-react'
import { CtaBand, FeatureCard, PageHeader } from '@/components/site/PageSections'

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
      <PageHeader
        eyebrow="Para farmácias"
        title="Um portal exclusivo para a sua farmácia"
        description="Cada farmácia acessa somente as próprias informações: pedidos, unidades, funcionários, comprovantes e financeiro. O isolamento entre clientes é garantido pelas políticas de segurança do banco de dados."
        actions={
          <>
            <Link to="/orcamento" className="btn-primary btn-sheen group">
              Quero uma demonstração
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
            <Link to="/entrar" className="btn-secondary">Já sou cliente · entrar</Link>
          </>
        }
        aside={
          <div className="rounded-2xl border border-ink-200/70 bg-white p-6 shadow-lift">
            <div className="flex items-center gap-3 border-b border-ink-100 pb-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-brand-100 text-brand-700 ring-1 ring-inset ring-brand-200">
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
        }
      />

      <section className="container-page py-14">
        <h2 className="section-title">O que a farmácia faz na plataforma</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <FeatureCard key={f.t} icon={<f.icon className="h-5 w-5" />} title={f.t} headingLevel={3}>
              {f.d}
            </FeatureCard>
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
              { t: 'Comprovante da entrega', d: 'Registro fotográfico vinculado ao pedido quando a entrega exige comprovação.' },
            ].map((i) => (
              <div key={i.t} className="card relative overflow-hidden p-6">
                <span className="absolute left-0 top-0 h-full w-0.5 bg-gradient-to-b from-brand-400 to-brand-100" aria-hidden="true" />
                <p className="font-display text-title-sm text-ink-950">{i.t}</p>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-600">{i.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CtaBand
        title="Pronto para começar?"
        description="Solicite uma demonstração para a sua farmácia. O acesso é liberado após análise e cadastro."
        actions={
          <Link to="/orcamento" className="btn-accent btn-sheen group">
            Falar com a equipe
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        }
      />
    </div>
  )
}
