// =====================================================================
// DLucas Express — Edge Function: admin-users
// Criação de usuários e redefinição de senha com verificação de papel.
// Somente SUPER_ADMIN / ADMIN podem executar. Toda ação é auditada.
// =====================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ROLES = [
  'SUPER_ADMIN', 'ADMIN', 'DISPATCHER', 'FINANCE',
  'PHARMACY_ADMIN', 'PHARMACY_STAFF', 'COURIER',
] as const

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader.startsWith('Bearer ')) {
      return json({ error: 'Não autenticado.' }, 401)
    }

    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // cliente com o token do solicitante (para descobrir quem é)
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData.user) return json({ error: 'Sessão inválida.' }, 401)

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

    const { data: requester } = await admin
      .from('profiles').select('id, role, is_active, email').eq('id', userData.user.id).single()

    if (!requester || !requester.is_active) return json({ error: 'Usuário inativo.' }, 403)
    if (!['SUPER_ADMIN', 'ADMIN'].includes(requester.role)) {
      return json({ error: 'Você não tem permissão para gerenciar usuários.' }, 403)
    }

    const body = await req.json()
    const action = String(body.action ?? '')

    if (action === 'create') {
      const email = String(body.email ?? '').trim().toLowerCase()
      const password = String(body.password ?? '')
      const fullName = String(body.full_name ?? '').trim()
      const role = String(body.role ?? 'PHARMACY_STAFF')
      const pharmacyId = body.pharmacy_id ? String(body.pharmacy_id) : null

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'E-mail inválido.' }, 400)
      if (password.length < 8) return json({ error: 'A senha deve ter ao menos 8 caracteres.' }, 400)
      if (!ROLES.includes(role as typeof ROLES[number])) return json({ error: 'Perfil inválido.' }, 400)
      if (role === 'SUPER_ADMIN' && requester.role !== 'SUPER_ADMIN') {
        return json({ error: 'Somente um SUPER_ADMIN pode criar outro SUPER_ADMIN.' }, 403)
      }
      if (['PHARMACY_ADMIN', 'PHARMACY_STAFF'].includes(role) && !pharmacyId) {
        return json({ error: 'Selecione a farmácia para este perfil.' }, 400)
      }

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, role, pharmacy_id: pharmacyId },
      })
      if (createErr) return json({ error: createErr.message }, 400)

      const userId = created.user!.id

      // garante o perfil com os dados corretos (o trigger cria o básico)
      const { error: profErr } = await admin.from('profiles').upsert({
        id: userId,
        email,
        full_name: fullName,
        role,
        pharmacy_id: pharmacyId,
        is_active: true,
        must_change_password: true,
      })
      if (profErr) return json({ error: profErr.message }, 400)

      await admin.from('audit_logs').insert({
        actor_id: requester.id,
        actor_email: requester.email,
        actor_role: requester.role,
        action: 'CREATE',
        entity: 'profile',
        entity_id: userId,
        description: `Criou usuário ${email} com perfil ${role}`,
      })

      return json({ userId })
    }

    if (action === 'set-password') {
      const userId = String(body.userId ?? '')
      const password = String(body.password ?? '')
      if (!userId) return json({ error: 'Usuário não informado.' }, 400)
      if (password.length < 8) return json({ error: 'A senha deve ter ao menos 8 caracteres.' }, 400)

      const { data: target } = await admin
        .from('profiles').select('role, email').eq('id', userId).single()
      if (!target) return json({ error: 'Usuário não encontrado.' }, 404)
      if (target.role === 'SUPER_ADMIN' && requester.role !== 'SUPER_ADMIN') {
        return json({ error: 'Somente um SUPER_ADMIN pode redefinir a senha de outro SUPER_ADMIN.' }, 403)
      }

      const { error } = await admin.auth.admin.updateUserById(userId, { password })
      if (error) return json({ error: error.message }, 400)

      await admin.from('profiles').update({ must_change_password: true }).eq('id', userId)
      await admin.from('audit_logs').insert({
        actor_id: requester.id,
        actor_email: requester.email,
        actor_role: requester.role,
        action: 'PASSWORD_RESET',
        entity: 'profile',
        entity_id: userId,
        description: `Redefiniu a senha de ${target.email}`,
      })

      return json({ ok: true })
    }

    if (action === 'deactivate') {
      const userId = String(body.userId ?? '')
      if (!userId) return json({ error: 'Usuário não informado.' }, 400)
      if (userId === requester.id) return json({ error: 'Você não pode desativar a própria conta.' }, 400)
      await admin.from('profiles').update({ is_active: false }).eq('id', userId)
      await admin.auth.admin.updateUserById(userId, { ban_duration: '876000h' })
      return json({ ok: true })
    }

    return json({ error: 'Ação desconhecida.' }, 400)
  } catch (err) {
    return json({ error: (err as Error).message ?? 'Erro inesperado.' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
