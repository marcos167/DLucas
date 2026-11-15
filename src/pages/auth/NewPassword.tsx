import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Alert, Button, Field, Input } from '@/components/ui'
import { Logo } from '@/components/layout/Logo'
import { useAuth } from '@/contexts/AuthContext'
import { homeRouteFor } from '@/contexts/AuthContext'
import { newPasswordSchema } from '@/lib/validation'
import { supabase } from '@/lib/supabase'

/**
 * Destino do link enviado por e-mail.
 *
 * O Supabase entrega a sessão temporária na própria URL (hash), por isso a tela
 * não pede a senha antiga — só a nova. Se o link estiver vencido ou já tiver
 * sido usado, a pessoa vê uma mensagem clara em vez de erro genérico.
 */
export default function NewPassword() {
  const { completePasswordReset, profile } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [fieldError, setFieldError] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [validLink, setValidLink] = useState<boolean | null>(null)

  useEffect(() => {
    // confere se o link de recuperação criou uma sessão válida
    supabase.auth.getSession().then(({ data }) => setValidLink(!!data.session))
  }, [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const parsed = newPasswordSchema.safeParse({ password, confirm })
    if (!parsed.success) {
      setFieldError(
        Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])),
      )
      return
    }
    setFieldError({})
    setBusy(true)
    try {
      await completePasswordReset(parsed.data.password)
      navigate(profile ? homeRouteFor(profile.role) : '/entrar', { replace: true })
    } catch (err) {
      setError(
        err instanceof Error
          ? /same password/i.test(err.message)
            ? 'A nova senha precisa ser diferente da anterior.'
            : err.message
          : 'Não foi possível salvar a nova senha.',
      )
    } finally {
      setBusy(false)
    }
  }

  if (validLink === false) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50 p-6">
        <div className="card w-full max-w-md p-6 sm:p-8">
          <h1 className="font-display text-xl font-bold text-ink-900">Link expirado</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            Este link de recuperação já foi usado ou venceu. Por segurança, cada link
            só funciona uma vez.
          </p>
          <Link to="/recuperar-senha" className="btn-primary mt-6 w-full">
            Pedir um novo link
          </Link>
          <Link to="/entrar" className="link-quiet mt-4 block text-center text-sm">
            Voltar ao login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center"><Logo /></div>
        <div className="card p-6 sm:p-8">
          <h1 className="font-display text-xl font-bold text-ink-900">Definir nova senha</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            Escolha uma senha nova para acessar a plataforma.
          </p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            <Field
              label="Nova senha"
              hint="Mínimo de 8 caracteres"
              error={fieldError.password}
              required
            >
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                autoFocus
                invalid={!!fieldError.password}
              />
            </Field>
            <Field label="Confirmar nova senha" error={fieldError.confirm} required>
              <Input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                invalid={!!fieldError.confirm}
              />
            </Field>
            {error && <Alert tone="danger" title="Não foi possível salvar">{error}</Alert>}
            <Button
              type="submit"
              className="w-full"
              size="lg"
              loading={busy}
              disabled={validLink === null}
            >
              Salvar nova senha e entrar
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
