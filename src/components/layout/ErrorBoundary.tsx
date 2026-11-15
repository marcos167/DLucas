import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCw } from 'lucide-react'

interface Props { children: ReactNode }
interface State { error: Error | null }

/**
 * Captura erros de render para não deixar a tela branca.
 *
 * Sem isso, qualquer exceção em um componente derruba a árvore inteira e o
 * usuário fica sem saber o que aconteceu nem como voltar.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // mantém o rastro no console para diagnóstico; em produção vale enviar
    // isto para um serviço de monitoramento
    console.error('Erro não tratado na interface:', error, info.componentStack)
  }

  private reset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50 p-6">
        <div className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-6 shadow-card">
          <div className="flex items-start gap-3">
            <span className="rounded-full bg-red-50 p-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="font-display text-lg font-semibold text-ink-900">
                Algo deu errado nesta tela
              </h1>
              <p className="mt-1 text-sm leading-relaxed text-ink-600">
                A página encontrou um erro inesperado. Seus dados não foram perdidos —
                tente recarregar. Se continuar acontecendo, avise o suporte informando
                a mensagem abaixo.
              </p>
              <pre className="mt-3 max-h-32 overflow-auto rounded-lg bg-ink-50 p-3 text-[12px] text-ink-700">
                {error.message}
              </pre>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => window.location.reload()} className="btn-primary">
                  <RotateCw className="h-4 w-4" />
                  Recarregar página
                </button>
                <button
                  type="button"
                  onClick={this.reset}
                  className="btn-secondary"
                >
                  Tentar novamente
                </button>
                <a href="/" className="btn-ghost">Voltar ao início</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }
}
