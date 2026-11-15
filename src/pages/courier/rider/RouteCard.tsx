import { Link } from 'react-router-dom'
import { MapPin, PackageCheck } from 'lucide-react'
import { Badge, Progress } from '@/components/ui'
import { zipPrefixLabel } from '@/lib/logistics/cep'
import { ROUTE_STATUS, routeName } from '@/lib/logistics/labels'
import type { RiderRoute } from '@/lib/logistics/types'

/** Resumo de um roteiro na lista do dia: primeira parada em aberto, pacotes resolvidos e situação. */
export function RouteCard({ route }: { route: RiderRoute }) {
  const packages = route.stops.flatMap((stop) => stop.packages)
  const resolved = packages.filter((pkg) => ['DELIVERED', 'FAILED', 'RETURNED'].includes(pkg.status)).length
  const status = ROUTE_STATUS[route.status]
  const first = route.stops.find((stop) => stop.status === 'PENDING') ?? route.stops[0]
  return (
    <Link to={`/entregador/rotas/${route.id}`} className="block rounded-2xl border border-ink-200 bg-white px-4 py-3 active:bg-ink-50">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink-950 text-[13px] font-bold text-white">
          {String(route.sequence).padStart(2, '0')}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[13.5px] font-semibold text-ink-950">{routeName(route.sequence)}</p>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <p className="mt-0.5 flex items-center gap-1 truncate text-[12px] text-ink-500">
            <MapPin className="h-3 w-3 shrink-0" />
            {first ? `${first.street}${first.number ? `, ${first.number}` : ''}` : 'Sem paradas'}
            {route.zip_prefix && <span className="text-ink-400"> · {zipPrefixLabel(route.zip_prefix)}</span>}
          </p>
        </div>
        <div className="text-right text-[11.5px] text-ink-500">
          <p className="flex items-center justify-end gap-1 font-semibold text-ink-800"><PackageCheck className="h-3.5 w-3.5" />{resolved}/{packages.length}</p>
          <p>{route.stops.length} parada(s)</p>
        </div>
      </div>
      {route.status === 'IN_PROGRESS' && <div className="mt-2.5"><Progress value={packages.length ? (resolved / packages.length) * 100 : 0} /></div>}
    </Link>
  )
}
