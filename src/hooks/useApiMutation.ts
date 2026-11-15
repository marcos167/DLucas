import { useMutation, type UseMutationOptions } from '@tanstack/react-query'
import { useToast } from '@/components/ui/Toast'

/**
 * Erro de negócio com mensagem já pronta para o usuário.
 *
 * Use quando a mensagem do banco não é legível ("new row violates row-level
 * security policy...") e você quer explicar o que aconteceu em português.
 */
export class AppError extends Error {
  constructor(message: string, readonly detail?: string) {
    super(message)
    this.name = 'AppError'
  }
}

/** Extrai a melhor mensagem possível de qualquer erro. */
export function errorMessage(err: unknown): { message: string; detail?: string } {
  if (err instanceof AppError) return { message: err.message, detail: err.detail }

  if (err instanceof Error) {
    const raw = err.message || ''

    // traduz os erros mais comuns do Supabase, que vazam em inglês técnico
    if (/row-level security policy|violates row-level security/i.test(raw)) {
      return {
        message: 'Ação não permitida para o seu perfil.',
        detail:
          'O banco de dados bloqueou esta operação. Fale com o administrador se precisar deste acesso.',
      }
    }
    if (/duplicate key value|already exists/i.test(raw)) {
      return { message: 'Este registro já existe.', detail: 'Verifique os dados e tente novamente.' }
    }
    if (/Failed to fetch|NetworkError|ERR_NETWORK/i.test(raw)) {
      return {
        message: 'Sem conexão com o servidor.',
        detail: 'Verifique sua internet e tente novamente.',
      }
    }
    if (/JWT expired|invalid claim|not authenticated/i.test(raw)) {
      return { message: 'Sua sessão expirou.', detail: 'Entre novamente para continuar.' }
    }
    if (/null value in column/i.test(raw)) {
      return { message: 'Preencha todos os campos obrigatórios.', detail: raw }
    }
    return { message: raw || 'Não foi possível concluir a ação.' }
  }

  return { message: 'Não foi possível concluir a ação.' }
}

type Options<TData, TVars> = UseMutationOptions<TData, Error, TVars> & {
  /** Mensagem de sucesso exibida no toast. Sem isso, nenhum toast de sucesso aparece. */
  successMessage?: string | ((data: TData, vars: TVars) => string)
  /** Desliga o toast de erro quando a tela já mostra o erro em outro lugar. */
  silentError?: boolean
}

/**
 * `useMutation` com feedback automático ao usuário.
 *
 * Toda falha vira um toast legível; todo sucesso pode virar um toast de
 * confirmação. Evita o clássico "cliquei e não aconteceu nada".
 *
 * Os callbacks recebem os mesmos argumentos do react-query e são repassados
 * na íntegra — inclusive o retorno, que o react-query aguarda se for promessa.
 */
export function useApiMutation<TData = unknown, TVars = void>(options: Options<TData, TVars>) {
  const { push } = useToast()
  const { successMessage, silentError, onSuccess, onError, ...rest } = options

  return useMutation<TData, Error, TVars>({
    ...rest,
    onSuccess: (...args) => {
      const [data, vars] = args
      if (successMessage) {
        push({
          tone: 'success',
          message:
            typeof successMessage === 'function' ? successMessage(data, vars) : successMessage,
        })
      }
      return onSuccess?.(...args)
    },
    onError: (...args) => {
      const [err] = args
      if (!silentError) push({ tone: 'error', ...errorMessage(err) })
      return onError?.(...args)
    },
  })
}
