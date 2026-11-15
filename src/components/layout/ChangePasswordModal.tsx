import { useState } from 'react'
import { Button, Field, Input, Modal } from '@/components/ui'

export function ChangePasswordModal({ open, onClose, onSubmit, forced }: {
  open: boolean; onClose: () => void; onSubmit: (pw: string) => Promise<void>; forced: boolean
}) {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (pw.length < 8) { setError('A senha deve ter ao menos 8 caracteres.'); return }
    if (pw !== pw2) { setError('As senhas não coincidem.'); return }
    setBusy(true)
    try {
      await onSubmit(pw)
      setDone(true)
      setTimeout(() => { onClose(); setDone(false); setPw(''); setPw2('') }, 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao alterar senha.')
    } finally { setBusy(false) }
  }

  return (
    <Modal
      open={open}
      onClose={() => { if (!forced) onClose() }}
      title={forced ? 'Defina uma nova senha' : 'Alterar senha'}
      description={forced
        ? 'Por segurança, é necessário trocar a senha temporária antes de continuar.'
        : 'Use ao menos 8 caracteres.'}
      size="sm"
      footer={
        <>
          {!forced && <Button variant="secondary" onClick={onClose}>Cancelar</Button>}
          <Button onClick={submit} loading={busy}>Salvar senha</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {done && <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Senha alterada.</div>}
        {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
        <Field label="Nova senha">
          <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label="Confirmar nova senha">
          <Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
        </Field>
      </form>
    </Modal>
  )
}
