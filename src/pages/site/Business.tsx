import { Building2, Handshake, Network, Rocket } from 'lucide-react'
import LeadForm from '@/components/site/LeadForm'

const perks = [
  { icon: Network, t: 'Múltiplas unidades', d: 'Cadastre filiais com endereços próprios de coleta.' },
  { icon: Rocket, t: 'Implantação assistida', d: 'A equipe apoia o cadastro inicial de unidades e usuários.' },
  { icon: Handshake, t: 'Condições por contrato', d: 'Valores por entrega definidos em contrato comercial.' },
  { icon: Building2, t: 'Portal separado por empresa', d: 'Cada empresa acessa apenas os próprios dados.' },
]

export default function Business() {
  return (
    <div className="container-page py-12 lg:py-16">
      <div className="max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">Novas empresas</p>
        <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-ink-950 sm:text-4xl">
          Cadastre sua empresa na D'Luca Connect
        </h1>
        <p className="mt-4 text-ink-600">
          Atendemos farmácias de manipulação e empresas que precisam de transporte de medicamentos e
          itens sensíveis com processo registrado. Preencha o formulário para iniciar a análise.
        </p>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {perks.map((p) => (
          <div key={p.t} className="card p-5">
            <p.icon className="h-5 w-5 text-brand-700" />
            <p className="mt-3 text-sm font-bold text-ink-950">{p.t}</p>
            <p className="mt-1 text-[13px] text-ink-600">{p.d}</p>
          </div>
        ))}
      </div>

      <div className="mt-10">
        <LeadForm type="BUSINESS" />
      </div>
    </div>
  )
}
