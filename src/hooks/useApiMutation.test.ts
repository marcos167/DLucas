import { describe, expect, it } from 'vitest'
import { AppError, errorMessage } from '@/hooks/useApiMutation'

/**
 * A tradução de erro é o que o usuário lê quando algo dá errado. Se ela
 * quebrar, o operador volta a ver inglês técnico de banco de dados no meio
 * de uma entrega urgente.
 */
describe('errorMessage — tradução de erros do banco', () => {
  it('traduz bloqueio de RLS para linguagem de perfil', () => {
    const { message, detail } = errorMessage(
      new Error('new row violates row-level security policy for table "orders"'),
    )
    expect(message).toBe('Ação não permitida para o seu perfil.')
    expect(detail).toContain('banco de dados bloqueou')
  })

  it('traduz chave duplicada', () => {
    expect(errorMessage(new Error('duplicate key value violates unique constraint')).message)
      .toBe('Este registro já existe.')
  })

  it('traduz falha de rede', () => {
    expect(errorMessage(new Error('Failed to fetch')).message).toBe('Sem conexão com o servidor.')
    expect(errorMessage(new Error('NetworkError when attempting to fetch')).message)
      .toBe('Sem conexão com o servidor.')
  })

  it('traduz sessão expirada', () => {
    expect(errorMessage(new Error('JWT expired')).message).toBe('Sua sessão expirou.')
    expect(errorMessage(new Error('not authenticated')).message).toBe('Sua sessão expirou.')
  })

  it('traduz campo obrigatório vazio', () => {
    expect(errorMessage(new Error('null value in column "recipient_name" violates not-null'))
      .message).toBe('Preencha todos os campos obrigatórios.')
  })

  it('preserva mensagem de negócio já em português', () => {
    expect(errorMessage(new Error('Selecione um entregador.')).message).toBe('Selecione um entregador.')
  })

  it('dá prioridade ao AppError, com detalhe opcional', () => {
    const err = new AppError('Pedido já foi aceito', 'Recarregue a fila para ver o status atual.')
    const out = errorMessage(err)
    expect(out.message).toBe('Pedido já foi aceito')
    expect(out.detail).toBe('Recarregue a fila para ver o status atual.')
  })

  it('não deixa a tela sem mensagem quando o erro é desconhecido', () => {
    expect(errorMessage(null).message).toBe('Não foi possível concluir a ação.')
    expect(errorMessage('algo estranho').message).toBe('Não foi possível concluir a ação.')
    expect(errorMessage(new Error('')).message).toBe('Não foi possível concluir a ação.')
  })

  it('AppError é uma instância de Error e preserva o nome', () => {
    const err = new AppError('falhou')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('AppError')
  })
})
