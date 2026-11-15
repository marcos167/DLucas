import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowLeft, ChevronDown, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { Alert, Button, Field, Input } from '@/components/ui'
import { Logo } from '@/components/layout/Logo'
import { useAuth } from '@/contexts/AuthContext'
import { loginSchema } from '@/lib/validation'

export default function Login() {
  const { signIn, profile, loading, homeRoute, configured } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [fieldError, setFieldError] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const from = (location.state as { from?: string } | null)?.from

  useEffect(() => {
    if (!loading && profile) navigate(from ?? homeRoute, { replace: true })
  }, [loading, profile, homeRoute, from, navigate])

  if (!loading && profile) return <Navigate to={from ?? homeRoute} replace />

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const parsed = loginSchema.safeParse({ email, password })
    if (!parsed.success) {
      setFieldError(Object.fromEntries(parsed.error.issues.map((i) => [i.path[0] as string, i.message])))
      return
    }
    setFieldError({})
    setBusy(true)
    try {
      await signIn(parsed.data.email, parsed.data.password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao entrar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-ink-950 p-10 text-white lg:flex">
        <img src="/images/hero-architecture.jpg" alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full object-cover object-[70%_center] opacity-45" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/80 to-ink-950/40" aria-hidden="true" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-950 via-transparent to-ink-950/60" aria-hidden="true" />
        <div className="relative"><Logo variant="light" /></div>
        <div className="relative max-w-md">
          <h1 className="font-display text-display-sm leading-[1.15] text-white">
            A central da sua operação de transporte de medicamentos
          </h1>
          <p className="mt-4 text-[13.5px] leading-relaxed text-ink-300">
            Painel administrativo, portal das farmácias e área do entregador em um único acesso —
            cada perfil vê somente o que lhe compete.
          </p>
          <ul className="mt-8 space-y-3 text-[13.5px] text-ink-200">
            {[
              'Despacho manual e por sugestão automática',
              'Rastreamento apenas com autorização',
              'Faturas, pagamentos e relatórios',
            ].map((t) => (
              <li key={t} className="flex items-center gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/15 ring-1 ring-inset ring-brand-400/25">
                  <ShieldCheck className="h-3.5 w-3.5 text-brand-300" />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-ink-300">© {new Date().getFullYear()} D'Luca Transportes</p>
      </div>

      <div className="flex flex-col justify-center bg-ink-50/60 px-5 py-12 sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <div className="lg:hidden"><Logo /></div>
          <Link to="/" className="mt-6 inline-flex items-center gap-1.5 text-xs font-medium text-ink-500 hover:text-ink-800 lg:mt-0">
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao site
          </Link>
          <h2 className="mt-6 font-display text-display-sm text-ink-950">Entrar na plataforma</h2>
          <p className="mt-2 text-[13.5px] text-ink-600">
            Use o e-mail corporativo cadastrado pela D'Luca.
          </p>

          {!configured && (
            <div className="mt-5">
              <Alert tone="warning" title="Supabase não configurado">
                Defina <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> no arquivo
                <code> .env</code> para habilitar o login.
              </Alert>
            </div>
          )}

          {error && (
            <div className="mt-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            <Field label="E-mail" error={fieldError.email}>
              <Input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@empresa.com.br" autoComplete="email"
                invalid={!!fieldError.email} disabled={!configured}
              />
            </Field>
            <Field label="Senha" error={fieldError.password}>
              <div className="relative">
                <Input
                  type={show ? 'text' : 'password'} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••" autoComplete="current-password"
                  invalid={!!fieldError.password} disabled={!configured} className="pr-10"
                />
                <button
                  type="button" onClick={() => setShow((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-ink-400 hover:bg-ink-100"
                  aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            <div className="flex justify-end">
              <Link to="/recuperar-senha" className="link-quiet text-[13px] font-medium">
                Esqueci minha senha
              </Link>
            </div>
            <Button type="submit" className="w-full" size="lg" loading={busy} disabled={!configured}>
              Entrar
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-ink-500">
            Não tem acesso? <Link to="/orcamento" className="link-quiet font-medium">Solicite o cadastro</Link> da sua farmácia
            ou <Link to="/entregadores" className="link-quiet font-medium">candidate-se como entregador</Link>.
          </p>

          {DEMO_ENABLED && (
            <DemoAccess
              onPick={(em, pw) => { setEmail(em); setPassword(pw); setError('') }}
              configured={configured}
            />
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Contas de demonstração do bloco "Acesso rápido".
 *
 * Só aparecem quando `VITE_DEMO_LOGINS` está definida. Em produção a variável
 * não é configurada e o bloco não é renderizado — nenhuma senha vai para o
 * bundle publicado.
 *
 * Para apresentar ao cliente, defina `VITE_DEMO_LOGINS=1` no ambiente de
 * preview da Vercel (ou no `.env` local) e o bloco volta a aparecer.
 *
 * NUNCA inclua contas reais aqui. Estas são contas fictícias, criadas apenas
 * para a demonstração, e todas com senha de teste.
 */
const DEMO_ENABLED = import.meta.env.VITE_DEMO_LOGINS === '1'

const DEMO_ACCOUNTS: { email: string; password: string; label: string }[] = [
  { email: 'despacho@dluca.com.br', password: 'Dluca@2026', label: 'Despacho' },
  { email: 'financeiro@dluca.com.br', password: 'Dluca@2026', label: 'Financeiro' },
  { email: 'farmacia@alquimia.com.br', password: 'Dluca@2026', label: 'Farmácia (gestor)' },
  { email: 'entregador@dluca.com.br', password: 'Dluca@2026', label: 'Entregador' },
]

function DemoAccess({ onPick, configured }: { onPick: (email: string, password: string) => void; configured: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-6 rounded-xl border border-dashed border-ink-300 bg-ink-50/60 p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-[11.5px] font-semibold uppercase tracking-wider text-ink-600">
          Acesso rápido (demonstração)
        </span>
        <ChevronDown className={`h-4 w-4 text-ink-500 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-2.5 space-y-1.5">
          {DEMO_ACCOUNTS.map((a) => (
            <button
              key={a.email}
              type="button"
              disabled={!configured}
              onClick={() => onPick(a.email, a.password)}
              className="flex w-full items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-2 text-left ring-1 ring-ink-200 transition hover:ring-brand-400 disabled:opacity-50"
            >
              <span className="min-w-0">
                <span className="block text-[12px] font-semibold text-ink-900">{a.label}</span>
                <span className="block truncate text-[10.5px] text-ink-500">{a.email}</span>
              </span>
              <span className="shrink-0 text-[10px] font-medium text-brand-700">usar</span>
            </button>
          ))}
          <p className="pt-1 text-[10.5px] leading-relaxed text-ink-500">
            Contas e dados fictícios de demonstração. Clique para preencher e depois em <strong>Entrar</strong>.
          </p>
        </div>
      )}
    </div>
  )
}
