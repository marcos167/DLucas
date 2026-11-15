import { Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Store, Building2, Users, Bike, Package, Radio, Map, History,
  AlertTriangle, FileCheck2, Wallet, Receipt, BarChart3, ShieldCheck, ScrollText, Settings,
  Inbox, UserPlus,
} from 'lucide-react'
import { DashboardShell, type NavSection } from '@/components/layout/DashboardShell'
import { useAuth } from '@/contexts/AuthContext'
import { ROLE_LABEL } from '@/lib/utils'

const sectionMap: { path: string; title: string; subtitle?: string }[] = [
  { path: '/app', title: 'Dashboard operacional', subtitle: 'Visão do dia e indicadores da operação' },
  { path: '/app/farmacias', title: 'Farmácias', subtitle: 'Clientes cadastrados e situação comercial' },
  { path: '/app/unidades', title: 'Unidades e filiais', subtitle: 'Pontos de coleta por farmácia' },
  { path: '/app/funcionarios', title: 'Funcionários e usuários', subtitle: 'Acessos internos e por farmácia' },
  { path: '/app/entregadores', title: 'Entregadores', subtitle: 'Cadastro, aprovação e disponibilidade' },
  { path: '/app/pedidos', title: 'Pedidos', subtitle: 'Todos os pedidos da operação' },
  { path: '/app/despacho', title: 'Central de despacho', subtitle: 'Atribuição manual e sugestões automáticas' },
  { path: '/app/mapa', title: 'Mapa de entregas', subtitle: 'Posições autorizadas e pedidos ativos' },
  { path: '/app/historico', title: 'Histórico de entregas', subtitle: 'Entregas concluídas e auditoria de mudanças' },
  { path: '/app/ocorrencias', title: 'Ocorrências', subtitle: 'Problemas reportados em campo' },
  { path: '/app/comprovantes', title: 'Comprovantes', subtitle: 'Documentos vinculados às entregas' },
  { path: '/app/contratos', title: 'Contratos comerciais', subtitle: 'Tabela de valores por farmácia' },
  { path: '/app/faturas', title: 'Faturas', subtitle: 'Emissão, vencimentos e pagamentos' },
  { path: '/app/repassee', title: 'Repasses a entregadores', subtitle: 'Valores a pagar por entrega' },
  { path: '/app/relatorios', title: 'Relatórios', subtitle: 'Indicadores operacionais e financeiros' },
  { path: '/app/leads', title: 'Leads comerciais', subtitle: 'Solicitações de orçamento e novas empresas' },
  { path: '/app/candidaturas', title: 'Candidaturas de entregadores', subtitle: 'Inscrições recebidas pelo site' },
  { path: '/app/usuarios', title: 'Usuários e permissões', subtitle: 'Papéis e acesso por perfil' },
  { path: '/app/auditoria', title: 'Auditoria de atividades', subtitle: 'Trilha de ações no sistema' },
  { path: '/app/configuracoes', title: 'Configurações gerais', subtitle: 'Parâmetros da plataforma' },
]

export default function AdminLayout() {
  const { profile } = useAuth()
  const location = useLocation()

  const current = [...sectionMap]
    .sort((a, b) => b.path.length - a.path.length)
    .find((s) => location.pathname === s.path || location.pathname.startsWith(`${s.path}/`))

  const canFinance = profile?.role === 'SUPER_ADMIN' || profile?.role === 'ADMIN' || profile?.role === 'FINANCE'
  const canAdmin = profile?.role === 'SUPER_ADMIN' || profile?.role === 'ADMIN'

  const sections: NavSection[] = [
    {
      title: 'Operação',
      items: [
        { to: '/app', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" />, end: true },
        { to: '/app/pedidos', label: 'Pedidos', icon: <Package className="h-4 w-4" /> },
        { to: '/app/despacho', label: 'Despacho', icon: <Radio className="h-4 w-4" /> },
        { to: '/app/mapa', label: 'Mapa de entregas', icon: <Map className="h-4 w-4" /> },
        { to: '/app/historico', label: 'Histórico', icon: <History className="h-4 w-4" /> },
        { to: '/app/ocorrencias', label: 'Ocorrências', icon: <AlertTriangle className="h-4 w-4" /> },
        { to: '/app/comprovantes', label: 'Comprovantes', icon: <FileCheck2 className="h-4 w-4" /> },
      ],
    },
    {
      title: 'Cadastros',
      items: [
        { to: '/app/farmacias', label: 'Farmácias', icon: <Store className="h-4 w-4" /> },
        { to: '/app/unidades', label: 'Unidades', icon: <Building2 className="h-4 w-4" /> },
        { to: '/app/entregadores', label: 'Entregadores', icon: <Bike className="h-4 w-4" /> },
        ...(canAdmin ? [{ to: '/app/funcionarios', label: 'Funcionários', icon: <Users className="h-4 w-4" /> }] : []),
      ],
    },
    ...(canFinance ? [{
      title: 'Financeiro',
      items: [
        { to: '/app/contratos', label: 'Contratos', icon: <ScrollText className="h-4 w-4" /> },
        { to: '/app/faturas', label: 'Faturas', icon: <Receipt className="h-4 w-4" /> },
        { to: '/app/repassee', label: 'Repasses', icon: <Wallet className="h-4 w-4" /> },
        { to: '/app/relatorios', label: 'Relatórios', icon: <BarChart3 className="h-4 w-4" /> },
      ],
    }] : []),
    {
      title: 'Comercial',
      items: [
        { to: '/app/leads', label: 'Leads', icon: <Inbox className="h-4 w-4" /> },
        { to: '/app/candidaturas', label: 'Candidaturas', icon: <UserPlus className="h-4 w-4" /> },
      ],
    },
    ...(canAdmin ? [{
      title: 'Administração',
      items: [
        { to: '/app/usuarios', label: 'Usuários', icon: <ShieldCheck className="h-4 w-4" /> },
        { to: '/app/auditoria', label: 'Auditoria', icon: <ScrollText className="h-4 w-4" /> },
        { to: '/app/configuracoes', label: 'Configurações', icon: <Settings className="h-4 w-4" /> },
      ],
    }] : []),
  ]

  return (
    <DashboardShell
      sections={sections}
      accent="ink"
      title={current?.title ?? 'Painel administrativo'}
      subtitle={current?.subtitle ?? ROLE_LABEL[profile?.role ?? '']}
    >
      <Outlet />
    </DashboardShell>
  )
}
