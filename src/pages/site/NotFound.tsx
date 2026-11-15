import { Link } from 'react-router-dom'
import { ArrowRight, Compass } from 'lucide-react'

/**
 * 404 de verdade.
 *
 * Antes, qualquer URL desconhecida redirecionava para a home — quem errava o
 * endereço achava que o site tinha carregado e não entendia nada.
 */
export default function NotFound() {
  return (
    <section className="mx-auto flex max-w-2xl flex-col items-center px-5 py-24 text-center">
      <span className="mb-5 rounded-full bg-brand-50 p-3 text-brand-700">
        <Compass className="h-6 w-6" />
      </span>
      <p className="text-sm font-semibold tracking-wide text-brand-700">ERRO 404</p>
      <h1 className="mt-2 font-display text-3xl font-bold text-ink-900 sm:text-4xl">
        Esta página não existe
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-600">
        O endereço que você abriu não foi encontrado. Pode ser que o link esteja
        desatualizado ou que a página tenha mudado de lugar.
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <Link to="/" className="btn-primary">
          Ir para o início
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link to="/contato" className="btn-secondary">Falar com a equipe</Link>
      </div>
      <div className="mt-10 border-t border-ink-100 pt-6 text-sm text-ink-500">
        Procurava algo específico?{' '}
        <Link to="/como-funciona" className="font-medium text-brand-700 hover:underline">
          Veja como funciona
        </Link>{' '}
        ou{' '}
        <Link to="/orcamento" className="font-medium text-brand-700 hover:underline">
          peça um orçamento
        </Link>
        .
      </div>
    </section>
  )
}
