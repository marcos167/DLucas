import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, MailCheck } from 'lucide-react'
import { Alert, Button, Field, Input } from '@/components/ui'
import { Logo } from '@/components/layout/Logo'
import { useAuth } from '@/contexts/AuthContext'
import { forgotPasswordSchema } from '@/lib/validation'

/**
 * "Esqueci minha senha" — envia o link de redefinição.
 *
 * A tela sempre confirma o envio, mesmo quando o e-mail não existe: dizer
 * "não encontramos esse e-mail" entregaria a quem tentasse adivinhar quais
 * endereços têm conta na plataforma.
 */
export default function ForgotPassword() {
  const { requestPasswordReset, configured } = useAuth()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const parsed = forgotPasswordSchema.safeParse({ email })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Informe um e-mail válido.')
      return
    }
    setBusy(true)
    try {
      await requestPasswordReset(parsed.data.email)
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar o e-mail.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center"><Logo /></div>

        <div className="card p-6 sm:p-8">
          {sent ? (
            <>
              <span className="inline-flex rounded-full bg-brand-50 p-2.5 text-brand-700">
                <MailCheck className="h-5 w-5" />
              </span>
              <h1 className="mt-4 font-display text-xl font-bold text-ink-900">
                Verifique seu e-mail
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">
                Se existir uma conta para <strong className="text-ink-900">{email}</strong>,
                enviamos um link para definir uma nova senha. O link vale por 1 hora.
              </p>
              <p className="mt-3 text-[13px] leading-relaxed text-ink-500">
                Não chegou? Confira a caixa de spam. Se o problema continuar, fale com
                o administrador da sua farmácia.
              </p>
              <Link to="/entrar" className="btn-secondary mt-6 w-full">
                <ArrowLeft className="h-4 w-4" />
                Voltar ao login
              </Link>
            </>
          ) : (
            <>
              <h1 className="font-display text-xl font-bold text-ink-900">Recuperar acesso</h1>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">
                Informe o e-mail da sua conta e enviaremos um link para você criar uma nova senha.
              </p>
              <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
                <Field label="E-mail" error={error || undefined}>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@empresa.com.br"
                    autoComplete="email"
                    autoFocus
                    invalid={!!error}
                    disabled={!configured}
                  />
                </Field>
                {!configured && (
                  <Alert tone="warning" title="Supabase não configurado">
                    Defina as variáveis de ambiente para habilitar o envio de e-mail.
                  </Alert>
                )}
                <Button type="submit" className="w-full" size="lg" loading={busy} disabled={!configured}>
                  Enviar link de recuperação
                </Button>
              </form>
              <Link
                to="/entrar"
                className="link-quiet mt-5 flex items-center justify-center gap-1.5 text-sm"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Voltar ao login
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
