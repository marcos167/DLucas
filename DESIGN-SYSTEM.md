# Design system — DLucas Express

Guia do sistema visual. Serve para manter consistência quando novas telas forem
criadas e para justificar as decisões estéticas adiante.

---

## Princípio central

O visual anterior era **funcional e correto**, mas genérico: uma sombra só para
todos os níveis, bordas de peso uniforme, botões chapados, badges com
preenchimento saturado e nenhuma resposta ao ponteiro. O resultado parece um
template — competente, porém sem a percepção de produto cuidado.

A reforma seguiu quatro decisões, todas repetidas de forma consistente:

### 1. Elevação em camadas, nunca plana

Um `box-shadow` único achata a interface. Toda superfície usa agora **três
camadas**: borda hairline (`border-ink-200/70`) + sombra de contato (1–2 px) +
sombra ambiente (larga e difusa). É o que faz o cartão "flutuar" de leve em vez
de parecer um retângulo pintado.

| Token | Uso |
|---|---|
| `shadow-xs` | campos de formulário |
| `shadow-card` | repouso de cards |
| `shadow-card-hover` | hover de card interativo |
| `shadow-lift` | dropdown, popover |
| `shadow-modal` | modal (a camada mais alta) |

### 2. Gradiente sutil em vez de cor chapada

`from-brand-600 to-brand-700` — 6% de variação de luminosidade. Uma cor chapada
parece plástico; a variação mínima faz a superfície parecer material. Aplicado
em botões primário, acento e perigo, e no símbolo da marca.

Somado a isso, um **brilho interno na borda superior**
(`inset 0 1px 0 rgb(255 255 255 / 0.14)`), que simula luz vindo de cima — o que o
olho interpreta como objeto físico.

### 3. Cor como hierarquia, não decoração

O verde da marca passou a ser **acento**, não preenchimento padrão. A regra:

- Verde `brand` → ações primárias, estado ativo, dado positivo
- Âmbar `accent` → a única cor quente; usada com parcimônia em CTA comercial e no ponto da marca
- `ink` → 90% da interface (texto, bordas, superfícies neutras)
- Vermelho → apenas erro e valor vencido

A paleta `brand` foi recalibrada um tom acima (`#12b98c` no 500, antes `#22a289`)
para ganhar vivacidade sem virar verde "de app de banco".

### 4. Movimento discreto e com propósito

Nada acima de 250 ms. Toda transição usa curva de saída
`cubic-bezier(0.22, 1, 0.36, 1)` — o movimento começa rápido e desacelera, que é
como objetos reais se movem. Curva linear parece mecânica.

Micro-interações implementadas:

| Onde | Efeito |
|---|---|
| Botões primário/acento | varredura de luz (`btn-sheen`) ao passar o mouse |
| Cards interativos | sobem 2 px e a sombra cresce |
| Cards de indicador | halo tonal aparece no canto superior |
| Itens da sidebar | barra vertical desliza ao trocar de seção |
| Skeletons | brilho deslizante em vez de piscar |
| Selo do hero | pulso suave no ponto verde |

**Importante:** tudo respeita `prefers-reduced-motion`. Quem desativa animação no
sistema operacional não vê nenhuma delas.

---

## Tipografia

Duas famílias, com papéis distintos:

- **Plus Jakarta Sans** (`font-display`) — títulos. Geométrica, com personalidade.
- **Inter** (`font-sans`) — corpo e interface. Legível em tamanho pequeno.

Escala com **tracking óptico**: quanto maior o texto, mais apertado o
espaçamento entre letras. Texto grande com espaçamento padrão parece solto.

| Token | Tamanho | Tracking |
|---|---|---|
| `text-display-lg` | 3.25 rem | −0.03 em |
| `text-display-md` | 2.5 rem | −0.025 em |
| `text-display-sm` | 2 rem | −0.02 em |
| `text-title-md` | 1.125 rem | −0.01 em |

Duas regras de composição aplicadas globalmente:

- `text-wrap: balance` em títulos — evita palavra órfã na última linha.
- `text-wrap: pretty` em parágrafos — evita linha final com uma palavra só.

Números usam `font-variant-numeric: tabular-nums` (classe `.tabular`): valores em
coluna não "dançam" quando atualizam.

---

## Componentes

### Botões

| Classe | Aparência |
|---|---|
| `btn-primary` | gradiente verde + brilho + varredura |
| `btn-accent` | gradiente âmbar — só para CTA comercial |
| `btn-secondary` | branco com borda e sombra curta |
| `btn-ghost` | sem fundo até o hover |
| `btn-danger` | gradiente vermelho |

Tamanhos: `btn-sm`, padrão, `btn-lg`.

### Campos

Borda neutra, hover escurece levemente a borda, foco com anel de 4 px em verde
translúcido. O anel de foco **nunca é removido** — é acessibilidade, não enfeite.

### Badges de status

Mudaram de preenchimento saturado (`bg-amber-100 text-amber-800`) para
**tinta + anel** (`bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200`).
Motivo: em tabela densa, um bloco de cor cheia puxa o olho para o lugar errado;
o anel delimita sem competir com o conteúdo.

Aplicado em `ORDER_STATUS_CLASS`, `ORDER_PRIORITY_CLASS`,
`AVAILABILITY_CLASS` e `INVOICE_STATUS_CLASS`.

### Cartões de indicador (`StatCard`)

Novo componente. Rótulo discreto em caixa alta, valor em escala display, ícone
em pílula tonal e variação opcional com seta.

```tsx
<StatCard
  label="Pedidos hoje"
  value={42}
  hint="Criados desde 00:00"
  icon={<Package className="h-4 w-4" />}
  tone="brand"
/>
```

O `StatCard` agora aparece também nos resumos de **faturas, repasses,
relatórios, histórico e portal da farmácia**. Passe `value="—"` durante o
carregamento de cada consulta (não mostre `R$ 0,00` antes de receber os dados).
Em listas limitadas ou filtradas, use `hint` para deixar claro o recorte do número.

### Seções do site (`PageSections`)

As páginas internas do site usam `PageHeader` para o cabeçalho com gradiente,
grade mascarada, título e ações opcionais; `FeatureCard` para grades de recursos;
e `CtaBand` para o fechamento escuro com CTA em âmbar. O `FeatureCard` aceita
`headingLevel={3}` quando está dentro de uma seção que já tem `<h2>`.
Não duplique esse markup nas novas páginas.

### Modal

Overlay com desfoque de 3 px, superfície com `shadow-modal`, cabeçalho com
gradiente branco→cinza muito claro (separa sem borda dura) e entrada com
`animate-scale-in`.

### Skeletons

Brilho deslizante em vez de pulso. Pulso puro parece conteúdo vazio; o brilho
comunica "carregando".

---

## Marca

O símbolo ganhou três camadas: gradiente diagonal, brilho interno e sombra
**colorida** (`rgb(9 95 77 / 0.55)`) em vez de cinza. O ponto âmbar é o único
elemento quente — é o que dá o toque de serviço vivo contra o corporativo.

O favicon foi redesenhado na mesma linguagem (gradiente, brilho, ponto com anel
escuro para destacar em qualquer fundo de aba).

---

## Superfícies e texturas

| Classe | Uso |
|---|---|
| `bg-grid-subtle` | grade técnica que esvanece nas bordas — heros escuros |
| `divider-fade` | divisor que some nas pontas |
| `card-gradient-border` | borda em gradiente para item em destaque |
| `surface-dark` | painel escuro com anel interno |

A textura `bg-grid-subtle` usa máscara radial: aparece no topo e desaparece.
Grade uniforme por toda a tela vira ruído; a máscara mantém a sensação de
profundidade técnica onde interessa.

---

## Tema do aplicativo dos entregadores

A área `/entregador` usa um segundo tema, verde-escuro com texto creme, medido nas
telas do aplicativo original da operação. O restante da plataforma não muda.

| Papel | Classe | Tema claro | Tema do entregador |
|---|---|---|---|
| Fundo da página | `bg-ink-50` | `#f5f2ec` | `#0e1f19` |
| Superfície (cartão, barra de abas) | `bg-white` | `#ffffff` | `#152a23` |
| Borda | `border-ink-200` | `#d5d0c7` | `#27443a` |
| Texto principal | `text-ink-950` | `#090909` | `#f7f5ee` |
| Texto secundário | `text-ink-500` | `#686868` | `#9db0a5` |
| Destaque (botão, seleção) | `bg-brand-700` | `#654b29` | `#bad6be` |

Como funciona:

- As paletas `white`, `ink`, `brand` e as de estado (`red`, `amber`, `emerald`, `sky`,
  `cyan`, `blue`, `indigo`, `violet`) são variáveis CSS (`--c-ink-900` etc.), declaradas
  em `tailwind.config.ts`. O tema claro (`:root`) usa os valores de sempre.
- `App.tsx` liga a classe `theme-rider` no `<html>` quando o endereço é `/entregador` ou
  está abaixo dele (`src/lib/riderTheme.ts`) e ajusta a cor da barra do navegador. A
  classe troca só as variáveis: a escala é a mesma, de trás para a frente.
- Por isso as telas não têm classes próprias para o escuro. `bg-white` quer dizer
  "superfície" e `text-white` "texto sobre preenchimento", nos dois temas.

Regras para as telas do entregador:

1. Só cores das paletas acima. Cor fixa (`#fff`, `bg-black`, `text-[#...]`) e as paletas
   que não viraram variável (`gray`, `slate`, `green`...) não acompanham o tema.
2. Preenchimento de destaque com `bg-brand-600` ou `bg-brand-700` e texto `text-white`
   (no tema, texto escuro sobre verde-claro, como no aplicativo original).
3. Abas embaixo, sem barra de título; estado vazio com `QuietState` e botões em pílula
   com `PillButton` (`src/pages/courier/rider/ui.tsx`). No mesmo arquivo ficam os desenhos
   de traço fino das telas vazias (`ParcelBox`, `QuietCalendar`) e o filtro `Chip`.
4. Medidas tiradas do aplicativo original (tela de 412 px): saudação em `font-editorial`
   20 px; título de tela vazia 15 px e frase 13 px; filtros e avisos 12 px; rótulo das
   abas 10,5 px com ícone de 24 px; campo de busca 44 px; barra de abas 60 px. Na aba
   ativa o ícone fica na cor de destaque e o rótulo em branco, com uma barrinha em cima.
5. Nenhum valor em dinheiro: `src/pages/courier/no-values.test.ts` falha se aparecer.

---

## Acessibilidade

Decisões que não são negociáveis:

- **Foco sempre visível** — anel de 2 px em todo elemento focável. Regra global
  em `index.css`; qualquer componente que remova precisa repor.
- **`prefers-reduced-motion`** respeitado em todas as animações.
- **Contraste** — textos de corpo em `ink-600` ou mais escuro sobre branco;
  nunca `ink-400` para conteúdo, apenas para rótulo secundário.
- **Toasts** usam `role="alert"` e `aria-live="assertive"` para erro.
- **Modal** usa `role="dialog"` e `aria-modal`.

---

## Como manter

Ao criar uma tela nova:

1. Use `card` para superfície, `card-interactive` apenas se o card for clicável.
2. Rótulo de seção em caixa alta: `text-[11px] font-semibold uppercase tracking-wider text-ink-500`.
3. Números em coluna: adicione `tabular`.
4. Status: use as constantes de `lib/utils.ts`, nunca cor solta.
5. Diálogo: use o componente `Modal`, não um `div` fixo próprio.
6. Ação destrutiva: `variant="danger"` e confirmação.

Antes de commitar:

```bash
npm run lint && npm run typecheck && npm run test:run && npm run build
```
