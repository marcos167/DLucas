import { Building2, Handshake, Network, Rocket } from 'lucide-react'
import LeadForm from '@/components/site/LeadForm'
import { FeatureCard, PageHeader } from '@/components/site/PageSections'

const perks = [
  { icon: Network, t: 'Múltiplas unidades', d: 'Cadastre filiais com endereços próprios de coleta.' },
  { icon: Rocket, t: 'Implantação assistida', d: 'A equipe apoia o cadastro inicial de unidades e usuários.' },
  { icon: Handshake, t: 'Condições por contrato', d: 'Valores por entrega definidos em contrato comercial.' },
  { icon: Building2, t: 'Portal separado por empresa', d: 'Cada empresa acessa apenas os próprios dados.' },
]

export default function Business() {
  return (
    <div>
      <PageHeader
        eyebrow="Novas empresas"
        title="Cadastre sua empresa na D'Luca Connect"
        description="Atendemos farmácias de manipulação e empresas que precisam de transporte de medicamentos e itens sensíveis com processo registrado. Preencha o formulário para iniciar a análise."
      />

      <div className="container-page py-12 lg:py-16">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {perks.map((p) => (
            <FeatureCard key={p.t} icon={<p.icon className="h-5 w-5" />} title={p.t}>
              {p.d}
            </FeatureCard>
          ))}
        </div>

        <div className="mt-10">
          <LeadForm type="BUSINESS" />
        </div>
      </div>
    </div>
  )
}
