import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck, UserCog, Users as UsersIcon } from 'lucide-react'
import { Alert, Button, Card, CardHeader, EmptyState, Input, Modal, SearchInput, Select, Skeleton } from '@/components/ui'
import { listCouriers, listPharmacies, listProfiles, logAudit, updateProfile } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { formatDateTime, ROLE_LABEL } from '@/lib/utils'
import type { Profile, UserRole } from '@/types'

const ROLE_CLASS: Record<string, string> = {
  SUPER_ADMIN: 'bg-ink-950 text-white',
  ADMIN: 'bg-ink-900 text-white',
  DISPATCHER: 'bg-indigo-100 text-indigo-800',
  FINANCE: 'bg-amber-100 text-amber-800',
  PHARMACY_ADMIN: 'bg-brand-100 text-brand-800',
  PHARMACY_STAFF: 'bg-brand-50 text-brand-700',
  COURIER: 'bg-sky-100 text-sky-800',
}

export default function Users() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [editing, setEditing] = useState<Profile | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')

  const profiles = useQuery({ queryKey: ['profiles'], queryFn: listProfiles })
  const pharmacies = useQuery({ queryKey: ['pharmacies'], queryFn: listPharmacies })
  const couriers = useQuery({ queryKey: ['couriers'], queryFn: listCouriers })

  const [form, setForm] = useState<{ role: UserRole; pharmacy_id: string; courier_id: string; is_active: boolean; password: string }>({
    role: 'PHARMACY_STAFF', pharmacy_id: '', courier_id: '', is_active: true, password: '',
  })

  const [invite, setInvite] = useState({
    email: '', full_name: '', role: 'PHARMACY_STAFF' as UserRole, pharmacy_id: '', courier_id: '', password: '',
  })

  const saveUser = useMutation({
    mutationFn: async () => {
      if (!editing) return
      const patch: Record<string, unknown> = { role: form.role, is_active: form.is_active }
      if (['PHARMACY_ADMIN', 'PHARMACY_STAFF'].includes(form.role)) patch.pharmacy_id = form.pharmacy_id || null
      await updateProfile(editing.id, patch)

      // vincula/desvincula entregador
      if (form.role === 'COURIER' && form.courier_id) {
        const { error: linkError } = await supabase.from('couriers')
          .update({ profile_id: editing.id }).eq('id', form.courier_id).select('id').single()
        if (linkError) throw new Error(`Não foi possível vincular o entregador: ${linkError.message}`)
        await updateProfile(editing.id, { pharmacy_id: null })
      }

      // senha administrativa (operação sensível — registrada em auditoria)
      if (form.password.trim().length >= 8) {
        const { error } = await supabase.functions.invoke('admin-users', {
          body: { action: 'set-password', userId: editing.id, password: form.password },
        })
        if (error) throw new Error('Não foi possível alterar a senha: função admin-users indisponível.')
        await updateProfile(editing.id, { must_change_password: true })
      }
      await logAudit('UPDATE', 'profile', editing.id, `Atualizou usuário ${editing.email}`)
    },
    onSuccess: () => {
      setEditing(null); setFeedback('Usuário atualizado.')
      void qc.invalidateQueries({ queryKey: ['profiles'] })
      void qc.invalidateQueries({ queryKey: ['couriers'] })
      void qc.invalidateQueries({ queryKey: ['dispatch-couriers'] })
    },
    onError: (e) => setError((e as Error).message),
  })

  const createUser = useMutation({
    mutationFn: async () => {
      if (invite.role === 'COURIER' && !invite.courier_id) {
        throw new Error('Selecione o cadastro de entregador que receberá o acesso.')
      }
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: {
          action: 'create',
          email: invite.email,
          password: invite.password,
          full_name: invite.full_name,
          role: invite.role,
          pharmacy_id: invite.pharmacy_id || null,
        },
      })
      if (error) throw new Error('Falha ao criar usuário. Verifique a função admin-users do Supabase.')
      const payload = data as { userId?: string }
      if (!payload?.userId) throw new Error('Resposta inválida da função admin-users.')
      if (invite.role === 'COURIER') {
        const { data: linked, error: linkError } = await supabase.from('couriers')
          .update({ profile_id: payload.userId })
          .eq('id', invite.courier_id)
          .is('profile_id', null)
          .select('id')
          .single()
        if (linkError || !linked) {
          throw new Error('Usuário criado, mas o vínculo com o entregador falhou. Abra o usuário em Editar para concluir o vínculo; não crie a conta novamente.')
        }
      }
      await logAudit('CREATE', 'profile', payload.userId, `Criou usuário ${invite.email} (${invite.role})`)
    },
    onSuccess: () => {
      setInviteOpen(false)
      setInvite({ email: '', full_name: '', role: 'PHARMACY_STAFF', pharmacy_id: '', courier_id: '', password: '' })
      setFeedback('Usuário criado. Uma senha temporária foi definida e a troca será exigida no primeiro acesso.')
      void qc.invalidateQueries({ queryKey: ['profiles'] })
      void qc.invalidateQueries({ queryKey: ['couriers'] })
      void qc.invalidateQueries({ queryKey: ['dispatch-couriers'] })
    },
    onError: (e) => setError((e as Error).message),
  })

  function openEdit(p: Profile) {
    setEditing(p); setError('')
    setForm({
      role: p.role,
      pharmacy_id: p.pharmacy_id ?? '',
      courier_id: (couriers.data ?? []).find((c) => c.profile_id === p.id)?.id ?? '',
      is_active: p.is_active,
      password: '',
    })
  }

  const filtered = (profiles.data ?? []).filter((p) => {
    const s = search.toLowerCase()
    const bySearch = !s || p.email.toLowerCase().includes(s) || p.full_name.toLowerCase().includes(s)
    return bySearch && (!roleFilter || p.role === roleFilter)
  })

  return (
    <div className="space-y-4">
      {feedback && <Alert tone="success">{feedback}</Alert>}

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nome ou e-mail…" className="w-full sm:w-72" />
        <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="w-full sm:w-52">
          <option value="">Todos os perfis</option>
          {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <div className="ml-auto"><Button onClick={() => { setInviteOpen(true); setError('') }} icon={<UserCog className="h-4 w-4" />}>Novo usuário</Button></div>
      </div>

      <Card>
        <CardHeader title={`Usuários (${filtered.length})`} description="Papéis e vínculos de acesso" />
        {profiles.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState title="Nenhum usuário" icon={<UsersIcon className="h-6 w-6" />} />
        ) : (
          <div className="table-wrap">
            <table className="table-base">
              <thead><tr><th>Usuário</th><th>Perfil</th><th>Vínculo</th><th>Situação</th><th>Criado</th><th /></tr></thead>
              <tbody>
                {filtered.map((p) => {
                  const pharmacyName = (pharmacies.data ?? []).find((x) => x.id === p.pharmacy_id)?.trade_name
                  const courierName = (couriers.data ?? []).find((c) => c.profile_id === p.id)?.full_name
                  return (
                    <tr key={p.id}>
                      <td>
                        <p className="font-medium">{p.full_name || '—'}</p>
                        <p className="text-[11.5px] text-ink-500">{p.email}</p>
                      </td>
                      <td><span className={`badge ${ROLE_CLASS[p.role]}`}>{ROLE_LABEL[p.role]}</span></td>
                      <td className="text-[12.5px]">
                        {pharmacyName ?? courierName ?? <span className="text-ink-400">Interno</span>}
                      </td>
                      <td>
                        <span className={`badge ${p.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-ink-200 text-ink-600'}`}>
                          {p.is_active ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="text-[11.5px] text-ink-500">{formatDateTime(p.created_at)}</td>
                      <td className="text-right"><Button variant="ghost" size="sm" onClick={() => openEdit(p)}>Gerenciar</Button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="card flex items-start gap-3 p-4">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" />
        <div className="text-[12.5px] text-ink-700">
          <p className="font-semibold text-ink-900">Permissões aplicadas no banco</p>
          <p className="mt-0.5">
            O papel do usuário é verificado pelas políticas RLS do PostgreSQL em cada consulta. Alterar o
            perfil aqui muda imediatamente o que o usuário enxerga — inclusive o isolamento entre farmácias.
          </p>
        </div>
      </div>

      {/* Editar usuário */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Gerenciar usuário" size="md"
        description={editing?.email}
        footer={<>
          <Button variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button>
          <Button onClick={() => saveUser.mutate()} loading={saveUser.isPending}>Salvar</Button>
        </>}>
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="mt-3 space-y-4">
          <div>
            <label className="label">Perfil de acesso</label>
            <Select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as UserRole }))}>
              {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </div>
          {['PHARMACY_ADMIN', 'PHARMACY_STAFF'].includes(form.role) && (
            <div>
              <label className="label">Farmácia vinculada</label>
              <Select value={form.pharmacy_id} onChange={(e) => setForm((f) => ({ ...f, pharmacy_id: e.target.value }))}>
                <option value="">Selecione…</option>
                {(pharmacies.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.trade_name}</option>)}
              </Select>
            </div>
          )}
          {form.role === 'COURIER' && (
            <div>
              <label className="label">Cadastro de entregador vinculado</label>
              <Select value={form.courier_id} onChange={(e) => setForm((f) => ({ ...f, courier_id: e.target.value }))}>
                <option value="">Nenhum</option>
                {(couriers.data ?? []).filter((c) => !c.profile_id || c.profile_id === editing?.id).map((c) => (
                  <option key={c.id} value={c.id}>{c.full_name}</option>
                ))}
              </Select>
            </div>
          )}
          <div>
            <label className="label">Nova senha (opcional)</label>
            <Input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="Mínimo 8 caracteres" />
            <p className="mt-1 text-[11px] text-ink-500">Será exigida troca de senha no próximo acesso. Requer a função <code>admin-users</code>.</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} className="h-4 w-4 rounded border-ink-300" />
            Usuário ativo
          </label>
        </div>
      </Modal>

      {/* Novo usuário */}
      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Novo usuário" size="md"
        description="Cria credenciais via Supabase Auth com senha temporária"
        footer={<>
          <Button variant="secondary" onClick={() => setInviteOpen(false)}>Cancelar</Button>
          <Button onClick={() => createUser.mutate()} loading={createUser.isPending} disabled={!invite.email || invite.password.length < 8}>Criar</Button>
        </>}>
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="mt-3 space-y-4">
          <div><label className="label">E-mail</label><Input type="email" value={invite.email} onChange={(e) => setInvite((s) => ({ ...s, email: e.target.value }))} /></div>
          <div><label className="label">Nome completo</label><Input value={invite.full_name} onChange={(e) => setInvite((s) => ({ ...s, full_name: e.target.value }))} /></div>
          <div>
            <label className="label">Perfil</label>
            <Select value={invite.role} onChange={(e) => setInvite((s) => ({ ...s, role: e.target.value as UserRole }))}>
              {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </div>
          {['PHARMACY_ADMIN', 'PHARMACY_STAFF'].includes(invite.role) && (
            <div>
              <label className="label">Farmácia</label>
              <Select value={invite.pharmacy_id} onChange={(e) => setInvite((s) => ({ ...s, pharmacy_id: e.target.value }))}>
                <option value="">Selecione…</option>
                {(pharmacies.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.trade_name}</option>)}
              </Select>
            </div>
          )}
          {invite.role === 'COURIER' && (
            <div>
              <label className="label">Cadastro de entregador para vincular</label>
              <Select value={invite.courier_id} onChange={(e) => setInvite((s) => ({ ...s, courier_id: e.target.value }))}>
                <option value="">Selecione…</option>
                {(couriers.data ?? []).filter((c) => !c.profile_id).map((c) => (
                  <option key={c.id} value={c.id}>{c.full_name} — {c.status === 'ACTIVE' ? 'ativo' : 'aguardando aprovação'}</option>
                ))}
              </Select>
              <p className="mt-1 text-[11px] text-ink-500">Somente cadastros ativos com conta vinculada podem receber ofertas.</p>
            </div>
          )}
          <div>
            <label className="label">Senha temporária</label>
            <Input value={invite.password} onChange={(e) => setInvite((s) => ({ ...s, password: e.target.value }))} placeholder="Mínimo 8 caracteres" />
            <p className="mt-1 text-[11px] text-ink-500">Comunique a senha por canal seguro. A troca será exigida no primeiro acesso.</p>
          </div>
        </div>
      </Modal>
    </div>
  )
}
