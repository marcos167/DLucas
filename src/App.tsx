import { lazy, Suspense, useLayoutEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import SiteLayout from '@/components/site/SiteLayout'
import { Protected, FullScreenLoader } from '@/components/layout/Protected'
import { ErrorBoundary } from '@/components/layout/ErrorBoundary'
import { applyRiderTheme, isRiderPath } from '@/lib/riderTheme'

/*
 * O site institucional é carregado direto (é a porta de entrada, precisa ser
 * imediato). Painel, portal e área do entregador entram por `lazy`: quem visita
 * a home não baixa o mapa, os gráficos nem as telas internas.
 */
import Home from '@/pages/site/Home'
import Services from '@/pages/site/Services'
import PharmaciesPublic from '@/pages/site/Pharmacies'
import HowItWorks from '@/pages/site/HowItWorks'
import Quote from '@/pages/site/Quote'
import Business from '@/pages/site/Business'
import Contact from '@/pages/site/Contact'
import CourierJoin from '@/pages/site/CourierJoin'
import NotFound from '@/pages/site/NotFound'
import Login from '@/pages/auth/Login'
import ForgotPassword from '@/pages/auth/ForgotPassword'
import NewPassword from '@/pages/auth/NewPassword'

/* ---- Painel administrativo ---- */
const AdminLayout = lazy(() => import('@/pages/admin/AdminLayout'))
const Dashboard = lazy(() => import('@/pages/admin/Dashboard'))
const Pharmacies = lazy(() => import('@/pages/admin/Pharmacies'))
const Units = lazy(() => import('@/pages/admin/Units'))
const Couriers = lazy(() => import('@/pages/admin/Couriers'))
const Orders = lazy(() => import('@/pages/admin/Orders'))
const OrderDetail = lazy(() => import('@/pages/admin/OrderDetail'))
const Dispatch = lazy(() => import('@/pages/admin/Dispatch'))
const DeliveryMapPage = lazy(() => import('@/pages/admin/DeliveryMapPage'))
const History = lazy(() => import('@/pages/admin/History'))
const Occurrences = lazy(() => import('@/pages/admin/Occurrences'))
const Proofs = lazy(() => import('@/pages/admin/Proofs'))
const Contracts = lazy(() => import('@/pages/admin/Contracts'))
const Invoices = lazy(() => import('@/pages/admin/Invoices'))
const Payouts = lazy(() => import('@/pages/admin/Payouts'))
const Reports = lazy(() => import('@/pages/admin/Reports'))
const Users = lazy(() => import('@/pages/admin/Users'))
const Audit = lazy(() => import('@/pages/admin/Audit'))
const Settings = lazy(() => import('@/pages/admin/Settings'))
const Leads = lazy(() => import('@/pages/admin/Leads'))
const Applications = lazy(() => import('@/pages/admin/Applications'))
const Distribution = lazy(() => import('@/pages/admin/Distribution'))
const CourierRoutes = lazy(() => import('@/pages/admin/CourierRoutes'))
const Coverage = lazy(() => import('@/pages/admin/Coverage'))

/* ---- Portal da farmácia ---- */
const PharmacyLayout = lazy(() => import('@/pages/pharmacy/PharmacyLayout'))
const PortalHome = lazy(() => import('@/pages/pharmacy/PortalHome'))
const NewOrder = lazy(() => import('@/pages/pharmacy/NewOrder'))
const PortalOrders = lazy(() => import('@/pages/pharmacy/PortalOrders'))
const PortalOrderDetail = lazy(() => import('@/pages/pharmacy/PortalOrderDetail'))
const PortalUnits = lazy(() => import('@/pages/pharmacy/PortalUnits'))
const PortalFinance = lazy(() => import('@/pages/pharmacy/PortalFinance'))
const PortalStaff = lazy(() => import('@/pages/pharmacy/PortalStaff'))
const PortalProofs = lazy(() => import('@/pages/pharmacy/PortalProofs'))
const PharmacySettings = lazy(() => import('@/pages/pharmacy/PharmacySettings'))

/* ---- Área do entregador ---- */
const CourierLayout = lazy(() => import('@/pages/courier/CourierLayout'))
const CourierHome = lazy(() => import('@/pages/courier/CourierHome'))
const CourierOffers = lazy(() => import('@/pages/courier/CourierOffers'))
const CourierDelivery = lazy(() => import('@/pages/courier/CourierDelivery'))
const CourierHistory = lazy(() => import('@/pages/courier/CourierHistory'))
const CourierProfile = lazy(() => import('@/pages/courier/CourierProfile'))
const CourierMap = lazy(() => import('@/pages/courier/CourierMap'))
const CourierUpcoming = lazy(() => import('@/pages/courier/CourierUpcoming'))
const RiderRoute = lazy(() => import('@/pages/courier/RiderRoute'))
const RiderCheck = lazy(() => import('@/pages/courier/RiderCheck'))

export default function App() {
  // o aplicativo dos entregadores tem tema próprio; o resto do sistema, não
  const riderArea = isRiderPath(useLocation().pathname)
  useLayoutEffect(() => { applyRiderTheme(riderArea) }, [riderArea])

  return (
    <ErrorBoundary>
      <Suspense fallback={<FullScreenLoader />}>
        <Routes>
          {/* Site institucional */}
          <Route element={<SiteLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/servicos" element={<Services />} />
            <Route path="/farmacias" element={<PharmaciesPublic />} />
            <Route path="/como-funciona" element={<HowItWorks />} />
            <Route path="/orcamento" element={<Quote />} />
            <Route path="/empresas" element={<Business />} />
            <Route path="/contato" element={<Contact />} />
            <Route path="/entregadores" element={<CourierJoin />} />
          </Route>

          <Route path="/entrar" element={<Login />} />
          <Route path="/recuperar-senha" element={<ForgotPassword />} />
          <Route path="/nova-senha" element={<NewPassword />} />

          {/* Painel administrativo */}
          <Route
            path="/app"
            element={
              <Protected allow={['SUPER_ADMIN', 'ADMIN', 'DISPATCHER', 'FINANCE']}>
                <AdminLayout />
              </Protected>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="pedidos" element={<Orders />} />
            <Route path="pedidos/:id" element={<OrderDetail />} />
            <Route path="despacho" element={<Dispatch />} />
            <Route path="distribuicao" element={<Distribution />} />
            <Route path="distribuicao/:batchId/funcionario/:courierId" element={<CourierRoutes />} />
            <Route path="cobertura" element={<Coverage />} />
            <Route path="mapa" element={<DeliveryMapPage />} />
            <Route path="farmacias" element={<Pharmacies />} />
            <Route path="unidades" element={<Units />} />
            <Route path="entregadores" element={<Couriers />} />
            <Route path="historico" element={<History />} />
            <Route path="ocorrencias" element={<Occurrences />} />
            <Route path="comprovantes" element={<Proofs />} />
            <Route path="contratos" element={<Contracts />} />
            <Route path="faturas" element={<Invoices />} />
            <Route path="repassee" element={<Payouts />} />
            <Route path="relatorios" element={<Reports />} />
            <Route path="usuarios" element={<Users />} />
            <Route path="auditoria" element={<Audit />} />
            <Route path="configuracoes" element={<Settings />} />
            <Route path="leads" element={<Leads />} />
            <Route path="candidaturas" element={<Applications />} />
            <Route path="funcionarios" element={<Users />} />
          </Route>

          {/* Portal da farmácia */}
          <Route
            path="/portal"
            element={
              <Protected allow={['PHARMACY_ADMIN', 'PHARMACY_STAFF']}>
                <PharmacyLayout />
              </Protected>
            }
          >
            <Route index element={<PortalHome />} />
            <Route path="novo-pedido" element={<NewOrder />} />
            <Route path="pedidos" element={<PortalOrders />} />
            <Route path="pedidos/:id" element={<PortalOrderDetail />} />
            <Route path="unidades" element={<PortalUnits />} />
            <Route path="funcionarios" element={<PortalStaff />} />
            <Route path="financeiro" element={<PortalFinance />} />
            <Route path="comprovantes" element={<PortalProofs />} />
            <Route path="configuracoes" element={<PharmacySettings />} />
          </Route>

          {/* Área do entregador */}
          <Route
            path="/entregador"
            element={
              <Protected allow={['COURIER']}>
                <CourierLayout />
              </Protected>
            }
          >
            {/* As cinco abas, como no aplicativo original: Hoje, Mapa, Próximas, Disponíveis e Perfil */}
            <Route index element={<CourierHome />} />
            <Route path="mapa" element={<CourierMap />} />
            <Route path="proximas" element={<CourierUpcoming />} />
            <Route path="disponiveis" element={<CourierOffers />} />
            <Route path="perfil" element={<CourierProfile />} />
            {/* Telas abertas a partir das abas */}
            <Route path="rotas/:routeId" element={<RiderRoute />} />
            <Route path="conferencia" element={<RiderCheck />} />
            <Route path="entrega/:id" element={<CourierDelivery />} />
            <Route path="historico" element={<CourierHistory />} />
            {/* Endereços anteriores, para atalhos salvos e aplicativos já instalados */}
            <Route path="rotas" element={<Navigate to="/entregador" replace />} />
            <Route path="ofertas" element={<Navigate to="/entregador/disponiveis" replace />} />
          </Route>

          {/* Qualquer outra URL cai no 404 dentro do layout do site */}
          <Route element={<SiteLayout />}>
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}
