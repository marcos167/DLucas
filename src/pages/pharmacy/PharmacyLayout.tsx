import { Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, PlusCircle, Package, Building2, Users, Receipt, FileDown, Settings2,
} from 'lucide-react'
import { DashboardShell, type NavSection } from '@/components/layout/DashboardShell'
import { useAuth } from '@/contexts/AuthContext'

const sectionMap = [
  { path: '/portal', title: 'Painel da farmácia', subtitle: 'Resumo das suas entregas' },
  { path: '/portal/novo-pedido', title: 'Novo pedido', subtitle: 'Solicitar uma nova entrega' },
  { path: '/portal/pedidos', title: 'Meus pedidos', subtitle: 'Acompanhe o status das entregas' },
  { path: '/portal/unidades', title: 'Unidades', subtitle: 'Filiais e pontos de coleta' },
  { path: '/portal/funcionarios', title: 'Funcionários', subtitle: 'Acessos da sua farmácia' },
  { path: '/portal/financeiro', title: 'Financeiro', subtitle: 'Faturas, valores e pagamentos' },
  { path: '/portal/comprovantes', title: 'Comprovantes', subtitle: 'Documentos das entregas' },
]

export default function PharmacyLayout() {
  const { profile } = useAuth()
  const location = useLocation()
  const current = [...sectionMap]
    .sort((a, b) => b.path.length - a.path.length)
    .find((s) => location.pathname === s.path || location.pathname.startsWith(`${s.path}/`))

  const isAdmin = profile?.role === 'PHARMACY_ADMIN'

  const sections: NavSection[] = [{
    title: 'Farmácia',
    items: [
      { to: '/portal', label: 'Painel', icon: <LayoutDashboard className="h-4 w-4" />, end: true },
      { to: '/portal/novo-pedido', label: 'Novo pedido', icon: <PlusCircle className="h-4 w-4" /> },
      { to: '/portal/pedidos', label: 'Pedidos', icon: <Package className="h-4 w-4" /> },
      { to: '/portal/comprovantes', label: 'Comprovantes', icon: <FileDown className="h-4 w-4" /> },
      { to: '/portal/financeiro', label: 'Financeiro', icon: <Receipt className="h-4 w-4" /> },
    ],
  }, ...(isAdmin ? [{
    title: 'Gestão',
    items: [
      { to: '/portal/unidades', label: 'Unidades', icon: <Building2 className="h-4 w-4" /> },
      { to: '/portal/funcionarios', label: 'Funcionários', icon: <Users className="h-4 w-4" /> },
      { to: '/portal/configuracoes', label: 'Dados da farmácia', icon: <Settings2 className="h-4 w-4" /> },
    ],
  }] : [])]

  return (
    <DashboardShell
      sections={sections}
      title={current?.title ?? 'Portal da farmácia'}
      subtitle={current?.subtitle}
    >
      <Outlet />
    </DashboardShell>
  )
}
