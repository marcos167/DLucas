import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowLeft, Eye, EyeOff, ShieldCheck } from 'lucide-react'
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
        <div className="pointer-events-none absolute -left-24 top-10 h-96 w-96 rounded-full bg-brand-600/25 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 bottom-0 h-80 w-80 rounded-full bg-accent/10 blur-3xl" />
        <Logo variant="light" />
        <div className="relative max-w-md">
          <h1 className="font-display text-3xl font-extrabold leading-tight">
            A central da sua operação de transporte de medicamentos
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-ink-300">
            Painel administrativo, portal das farmácias e área do entregador em um único acesso —
            cada perfil vê somente o que lhe compete.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-ink-200">
            {[
              'Despacho manual e por sugestão automática',
              'Rastreamento apenas com autorização',
              'Faturas, pagamentos e relatórios',
            ].map((t) => (
              <li key={t} className="flex items-center gap-2.5">
                <ShieldCheck className="h-4 w-4 text-brand-300" /> {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-ink-500">© {new Date().getFullYear()} D'Luca Transportes</p>
      </div>

      <div className="flex flex-col justify-center bg-white px-5 py-12 sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <div className="lg:hidden"><Logo /></div>
          <Link to="/" className="mt-6 inline-flex items-center gap-1.5 text-xs font-medium text-ink-500 hover:text-ink-800 lg:mt-0">
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao site
          </Link>
          <h2 className="mt-6 font-display text-2xl font-extrabold tracking-tight text-ink-950">Entrar na plataforma</h2>
          <p className="mt-1.5 text-sm text-ink-600">
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
            <Button type="submit" className="w-full" size="lg" loading={busy} disabled={!configured}>
              Entrar
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-ink-500">
            Não tem acesso? <Link to="/orcamento" className="link-quiet font-medium">Solicite o cadastro</Link> da sua farmácia
            ou <Link to="/entregadores" className="link-quiet font-medium">candidate-se como entregador</Link>.
          </p>
        </div>
      </div>
    </div>
  )
}
