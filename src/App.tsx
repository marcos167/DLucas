import { Route, Routes, Navigate } from 'react-router-dom'
import SiteLayout from '@/components/site/SiteLayout'
import Home from '@/pages/site/Home'
import Services from '@/pages/site/Services'
import PharmaciesPublic from '@/pages/site/Pharmacies'
import HowItWorks from '@/pages/site/HowItWorks'
import Quote from '@/pages/site/Quote'
import Business from '@/pages/site/Business'
import Contact from '@/pages/site/Contact'
import CourierJoin from '@/pages/site/CourierJoin'
import Login from '@/pages/auth/Login'
import { Protected } from '@/components/layout/Protected'

import AdminLayout from '@/pages/admin/AdminLayout'
import Dashboard from '@/pages/admin/Dashboard'
import Pharmacies from '@/pages/admin/Pharmacies'
import Units from '@/pages/admin/Units'
import Couriers from '@/pages/admin/Couriers'
import Orders from '@/pages/admin/Orders'
import OrderDetail from '@/pages/admin/OrderDetail'
import Dispatch from '@/pages/admin/Dispatch'
import DeliveryMapPage from '@/pages/admin/DeliveryMapPage'
import History from '@/pages/admin/History'
import Occurrences from '@/pages/admin/Occurrences'
import Proofs from '@/pages/admin/Proofs'
import Contracts from '@/pages/admin/Contracts'
import Invoices from '@/pages/admin/Invoices'
import Payouts from '@/pages/admin/Payouts'
import Reports from '@/pages/admin/Reports'
import Users from '@/pages/admin/Users'
import Audit from '@/pages/admin/Audit'
import Settings from '@/pages/admin/Settings'
import Leads from '@/pages/admin/Leads'
import Applications from '@/pages/admin/Applications'

import PharmacyLayout from '@/pages/pharmacy/PharmacyLayout'
import PortalHome from '@/pages/pharmacy/PortalHome'
import NewOrder from '@/pages/pharmacy/NewOrder'
import PortalOrders from '@/pages/pharmacy/PortalOrders'
import PortalOrderDetail from '@/pages/pharmacy/PortalOrderDetail'
import PortalUnits from '@/pages/pharmacy/PortalUnits'
import PortalFinance from '@/pages/pharmacy/PortalFinance'
import PortalStaff from '@/pages/pharmacy/PortalStaff'
import PortalProofs from '@/pages/pharmacy/PortalProofs'
import PharmacySettings from '@/pages/pharmacy/PharmacySettings'

import CourierLayout from '@/pages/courier/CourierLayout'
import CourierHome from '@/pages/courier/CourierHome'
import CourierOffers from '@/pages/courier/CourierOffers'
import CourierDelivery from '@/pages/courier/CourierDelivery'
import CourierHistory from '@/pages/courier/CourierHistory'
import CourierProfile from '@/pages/courier/CourierProfile'

export default function App() {
  return (
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
      <Route path="/entregador" element={<Protected allow={['COURIER']}><CourierLayout /></Protected>}>
        <Route index element={<CourierHome />} />
        <Route path="ofertas" element={<CourierOffers />} />
        <Route path="entrega/:id" element={<CourierDelivery />} />
        <Route path="historico" element={<CourierHistory />} />
        <Route path="perfil" element={<CourierProfile />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
