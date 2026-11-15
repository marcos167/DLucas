# D'Luca Connect — Documentação Técnica Completa

> Documento único explicando **o que é** o sistema, **para que serve cada parte** e **o que faz cada função**.
> Gerado a partir do código-fonte real em `marcos167/DLucas` (branch `arena/9e8b8662-dlucas`) e do banco em produção.

| Item | Valor |
|---|---|
| Produto | D'Luca Connect — logística e transporte de medicamentos |
| Endereço em produção | https://dluca-connect.vercel.app |
| Frontend | React 18 + TypeScript + Vite 5 + TailwindCSS 3 |
| Backend | Supabase (PostgreSQL + Auth + Storage + Realtime + Edge Functions) |
| Hospedagem | Vercel (projeto `dluca-connect`) |
| Tamanho do código | ~10.400 linhas de TypeScript/TSX em 82 arquivos |
| Banco | 21 tabelas, 54 políticas RLS, 7 migrations, 1 Edge Function |

---

## Índice

1. [O que é a plataforma](#1-o-que-é-a-plataforma)
2. [Os três públicos e os quatro acessos](#2-os-três-públicos-e-os-quatro-acessos)
3. [Arquitetura geral](#3-arquitetura-geral)
4. [Estrutura de arquivos, arquivo por arquivo](#4-estrutura-de-arquivos-arquivo-por-arquivo)
5. [Camada de dados: `src/lib/api.ts` função por função](#5-camada-de-dados-srclibapits-função-por-função)
6. [Regras de negócio implementadas](#6-regras-de-negócio-implementadas)
7. [Banco de dados: tabelas e colunas](#7-banco-de-dados-tabelas-e-colunas)
8. [Segurança: as 54 políticas RLS explicadas](#8-segurança-as-54-políticas-rls-explicadas)
9. [Automações do banco: triggers e funções](#9-automações-do-banco-triggers-e-funções)
10. [Edge Function `admin-users`](#10-edge-function-admin-users)
11. [Mapa de rotas do frontend](#11-mapa-de-rotas-do-frontend)
12. [Todas as páginas: o que cada tela faz](#12-todas-as-páginas-o-que-cada-tela-faz)
13. [Fluxo completo de um pedido](#13-fluxo-completo-de-um-pedido)
14. [Segurança e privacidade do GPS](#14-segurança-e-privacidade-do-gps)
15. [Ambiente, deploy e operação](#15-ambiente-deploy-e-operação)
16. [Testes realizados em produção](#16-testes-realizados-em-produção)
17. [Limitações conhecidas](#17-limitações-conhecidas)
    - [17.1 Tratamento de erros e feedback](#171-tratamento-de-erros-e-feedback-ao-usuário)
    - [17.2 Recuperação de senha](#172-recuperação-de-senha)
    - [17.3 Lint e desempenho do bundle](#173-lint-e-desempenho-do-bundle)
18. [Testes e integração contínua](#18-testes-e-integração-contínua)
19. [Design system](#19-design-system)
20. [Glossário](#20-glossário)

---

## 1. O que é a plataforma

A D'Luca Connect é um sistema web que organiza o **transporte de medicamentos** entre farmácias de manipulação e pacientes. Ela resolve um problema operacional concreto: hoje esse transporte costuma ser controlado por WhatsApp, planilha e memória — sem registro de quem coletou, quando entregou, nem comprovante vinculado ao pedido.

A plataforma junta, num único sistema:

- **Central de despacho** — recebe pedidos das farmácias, decide qual entregador vai fazer cada um e acompanha a rota.
- **Portal da farmácia** — a farmácia cria pedidos, acompanha status, baixa comprovantes e consulta faturas.
- **Área do entregador** — o motoboy recebe ofertas no celular, aceita, avança as etapas da entrega e anexa o comprovante.
- **Financeiro** — contratos com tabela de preços, faturas por período, pagamentos totais/parciais e repasses aos entregadores.
- **Site institucional público** — apresenta o serviço, capta orçamentos e candidaturas de entregadores.

O princípio central de design é: **cada perfil vê somente o que lhe compete**, e isso não é só escondido na tela — está imposto no banco de dados por Row Level Security. Uma farmácia não consegue ler os pedidos de outra nem se o frontend for burlado.

---

## 2. Os três públicos e os quatro acessos

O sistema tem 7 papéis (`user_role`), que se agrupam em 4 áreas de acesso:

| Papel | Área | O que pode fazer |
|---|---|---|
| `SUPER_ADMIN` | `/app` (painel) | Tudo. Único que pode criar/alterar outros `SUPER_ADMIN`. |
| `ADMIN` | `/app` | Gestão completa: cadastros, financeiro, usuários, auditoria. |
| `DISPATCHER` | `/app` | Operação: pedidos, despacho, mapa, ocorrências, comprovantes, entregadores. Não mexe em dinheiro. |
| `FINANCE` | `/app` | Financeiro: contratos, faturas, pagamentos, repasses, relatórios. |
| `PHARMACY_ADMIN` | `/portal` | Portal da farmácia + gestão de unidades e funcionários da própria farmácia. |
| `PHARMACY_STAFF` | `/portal` | Portal da farmácia (pedidos, comprovantes, financeiro), sem gestão de equipe. |
| `COURIER` | `/entregador` | Ofertas, entregas, histórico, próprio perfil e disponibilidade. |

O papel mora em `public.profiles.role`. Depois do login, a função `homeRouteFor(role)` decide para onde mandar o usuário.

---

## 3. Arquitetura geral

```
┌─────────────────────────────────────────────────────────────┐
│  NAVEGADOR (React SPA)                                      │
│  Vercel · https://dluca-connect.vercel.app                  │
│                                                             │
│  main.tsx → Router → AuthProvider → App.tsx (rotas)         │
│       │                                                     │
│       ├── Site institucional  (Visitante)                   │
│       ├── /app/*      (staff D'Luca)                        │
│       ├── /portal/*   (farmácia)                            │
│       └── /entregador/* (motoboy)                           │
│                                                             │
│  Camada de dados: src/lib/api.ts (655 linhas)               │
└───────────────────────┬─────────────────────────────────────┘
                        │ HTTPS + JWT do usuário
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  SUPABASE (sa-east-1) — projeto euwonmpgwwoublajfvip        │
│                                                             │
│  Auth ......... login, sessão, JWT (signups desativados)    │
│  PostgREST .... acesso às tabelas com RLS                   │
│  PostgreSQL ... 21 tabelas, 54 políticas, 10 triggers       │
│  Storage ...... buckets privados `proofs` e `receipts`      │
│  Realtime ..... notificações e novas ofertas ao vivo        │
│  Edge Fn ...... admin-users (criar usuário, senha)          │
└─────────────────────────────────────────────────────────────┘
```

**Por que não há servidor próprio:** o Supabase expõe o Postgres via API REST autenticada. A autorização não fica no frontend — fica nas políticas RLS do banco. Isso significa que mesmo alguém com a chave pública (`anon key`, que é pública por definição) só lê o que as políticas permitirem.

**Decisões de projeto relevantes:**

- Contadores e totais (`invoices.total_cents`, `paid_cents`) são calculados por **trigger no banco**, não no JavaScript. Assim não há divergência se dois usuários editarem ao mesmo tempo.
- O aceite de oferta pelo entregador é resolvido por **trigger `SECURITY DEFINER`**, porque o RLS impede o entregador de alterar um pedido ao qual ainda não está vinculado. A regra atômica vive no banco.
- A timeline do pedido (`order_events`) é gerada por trigger, então nenhuma mudança de status fica sem registro, mesmo feita por SQL direto.

---

## 4. Estrutura de arquivos, arquivo por arquivo

### 4.1 Raiz do projeto

| Arquivo | Para que serve |
|---|---|
| `package.json` | Dependências e scripts: `dev` (Vite em 0.0.0.0:5173), `build` (`tsc -b && vite build`), `preview`, `typecheck`. |
| `vite.config.ts` | Alias `@` → `src`. Servidor em `0.0.0.0:5173` com `strictPort`, `allowedHosts: true` (aceita o host de preview do ambiente) e `hmr.clientPort: 443` para funcionar atrás de proxy HTTPS. |
| `tsconfig.json` | TypeScript estrito com `noUnusedLocals`: qualquer import não usado quebra o build — é por isso que `npm run typecheck` é o "lint" do projeto. |
| `tailwind.config.ts` | Paleta: `brand` (verde-petróleo, saúde/confiança), `ink` (cinza-azulado) e `accent` (âmbar, para urgência). Fontes Inter + Plus Jakarta Sans. Sombras `card` e `lift`. |
| `postcss.config.js` | Habilita Tailwind + autoprefixer. |
| `index.html` | Documento único da SPA, título e meta tags, carrega as fontes do Google. |
| `vercel.json` | Framework Vite, `buildCommand`, `outputDirectory: dist`, **SPA rewrite** (`/qualquer-rota` → `index.html`, exceto `/assets/*`) e cabeçalhos de segurança. |
| `.env` / `.env.example` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_COMPANY_WHATSAPP`. O `.env` **não** vai para o Git. |
| `public/logo.svg` | Logotipo vetorial. |
| `README.md` | Início rápido e visão geral resumida. |
| `DOCUMENTACAO.md` | Documento funcional em português (módulos, contas, deploy). Este arquivo aqui é a versão técnica detalhada. |

### 4.2 `src/` — base da aplicação

| Arquivo | O que faz |
|---|---|
| `main.tsx` | Ponto de entrada. Monta `<QueryClientProvider>` (React Query com `retry: 1`, `staleTime` 15s, sem refetch ao focar a janela), `<BrowserRouter>` e `<AuthProvider>` em volta de `<App />`. |
| `App.tsx` | **Árvore completa de rotas** (detalhada na seção 11). Cada área é protegida por `<Protected allow={[...]}>`. Rota desconhecida (`*`) redireciona para `/`. |
| `index.css` | Diretivas do Tailwind, estilos base (cor de texto, scrollbar discreta, seleção) e classes utilitárias de componente: `.container-page`, `.card`, `.card-flat`, `.link-quiet` etc. |
| `vite-env.d.ts` | Tipagem das variáveis `import.meta.env`. |

### 4.3 `src/types/`

| Arquivo | O que faz |
|---|---|
| `types/index.ts` | **388 linhas de tipos.** Todas as enumerações e interfaces espelhando o banco: `UserRole`, `OrderStatus`, `OrderPriority`, `OfferStatus`, `InvoiceStatus`, `PaymentMethod`, `OccurrenceType`, `LeadStatus`, `ContractStatus`, `CourierAvailability` e as interfaces `Profile`, `Pharmacy`, `PharmacyUnit`, `Courier`, `Order`, `OrderEvent`, `DeliveryOffer`, `Occurrence`, `Proof`, `CourierLocation`, `Contract`, `Invoice`, `InvoiceItem`, `Payment`, `CourierPayout`, `Lead`, `CourierApplication`, `AuditLog`, `AppNotification`, `Setting`. É o contrato entre o banco e a interface. |
| `types/map.ts` | `MapPoint` (lat/lng/rótulo) e `CouriersWithLocation` (entregador + coordenada + horário do registro + distância opcional até a coleta). |

### 4.4 `src/lib/` — lógica sem interface

| Arquivo | O que faz |
|---|---|
| `lib/supabase.ts` | Cria o cliente Supabase a partir das variáveis de ambiente. Exporta `isSupabaseConfigured` (se falta URL ou chave, a interface mostra aviso em vez de quebrar) e os nomes dos buckets `proofs`/`receipts`. |
| `lib/api.ts` | **A camada de dados inteira (655 linhas).** Toda leitura e escrita no banco passa por aqui. Explicada função por função na seção 5. |
| `lib/utils.ts` | Formatação e utilitários puros (sem rede). Explicado abaixo. |
| `lib/validation.ts` | Schemas Zod de todos os formulários e a função `fieldErrors`. Explicado abaixo. |
| `lib/geocode.ts` | Converte endereço em coordenadas usando Nominatim/OpenStreetMap (requisição pública, `countrycodes=br`). **Nunca inventa coordenada:** se falhar, devolve `null` e o pedido é criado sem ponto no mapa. |

**`lib/utils.ts` — função por função**

| Função | Para que serve |
|---|---|
| `cn(...)` | Junta classes Tailwind resolvendo conflitos (`clsx` + `tailwind-merge`). |
| `brl(cents)` | Converte centavos em moeda brasileira (`R$ 1.234,56`). Todo dinheiro no sistema é inteiro em centavos — nunca `float`. |
| `km(v)` | Formata distância com 1 casa e sufixo "km". |
| `formatDate` / `formatDateTime` | Data e data-hora em pt-BR. Datas puras (`YYYY-MM-DD`) recebem meio-dia para evitar erro de fuso. |
| `relativeTime(iso)` | "agora", "5 min atrás", "3 h atrás", "2 d atrás". |
| `isLocationFresh(iso, max=3)` | **Regra de honestidade do GPS:** só considera posição "ao vivo" se tiver menos de 3 minutos. Mais que isso, a tela diz "última posição conhecida". |
| `initials(name)` | Duas iniciais para o avatar. |
| `onlyDigits`, `maskPhone`, `maskCpf`, `maskCnpj` | Máscaras de digitação. |
| `distanceKm(a, b)` | Distância em km pela fórmula de Haversine (raio 6.371 km). |
| `ORDER_STATUS_LABEL` / `_CLASS` | Texto em português e classes de cor de cada um dos 11 status. |
| `ORDER_PRIORITY_LABEL` / `_CLASS` | Rótulo e cor de NORMAL / HIGH / URGENT. |
| `AVAILABILITY_LABEL` / `_CLASS` | Disponível / Em entrega / Offline. |
| `INVOICE_STATUS_LABEL` / `_CLASS` | Rascunho, Aberta, Parcial, Paga, Vencida, Cancelada. |
| `OCCURRENCE_TYPE_LABEL`, `OCCURRENCE_STATUS_LABEL`, `LEAD_STATUS_LABEL`, `CONTRACT_STATUS_LABEL`, `ROLE_LABEL` | Dicionários de rótulos. |
| `COURIER_FLOW` | **A máquina de estados do entregador:** `ACCEPTED → PICKING_UP → COLLECTED → IN_TRANSIT → DELIVERED`, com o botão que aparece em cada etapa. O entregador não consegue pular etapa. |
| `slugifyZone(city)` | Normaliza cidade para comparar região. |

**`lib/validation.ts` — schemas por função**

| Schema | Valida |
|---|---|
| `quoteSchema` | Formulário de orçamento: nome (≥3), e-mail, telefone (10–20), CNPJ, cidade, UF, nº de unidades, entregas/dia, mensagem. |
| `businessSchema` | Igual ao de orçamento, mas exige nome da empresa. |
| `courierApplicationSchema` | Candidatura de entregador: nome (≥5), telefone, e-mail opcional, CPF, cidade, UF, região, CNH, placa, se tem moto, experiência. |
| `loginSchema` | E-mail e senha (≥6). |
| `orderSchema` | **O schema mais importante (~25 campos):** unidade de origem, prioridade, endereço de coleta (rua, número, bairro, cidade, UF, instruções), destinatário (nome, telefone, documento), endereço de entrega completo + CEP, volumes, descrição, refrigerado, exige comprovante, agendamento. |
| `pharmacySchema` | Razão social, nome fantasia, CNPJ, contato, endereço, status. |
| `unitSchema` | Unidade/filial: nome, endereço, contato, horário. |
| `courierSchema` | Entregador: nome, telefone, CPF, cidade base, zona, CNH, placa, veículo. |
| `contractSchema` | Contrato: nome, preços base, km incluídos, preço por km extra, repasse ao entregador, taxa de urgência, taxa de refrigerado, ciclo, prazo de pagamento. |
| `fieldErrors(zodError)` | Transforma o erro do Zod em `{ campo: "mensagem" }`, que as telas usam para marcar cada input em vermelho. |

### 4.5 `src/hooks/` e `src/contexts/`

**`hooks/useGeolocation.ts`** — o único ponto do sistema que fala com o GPS.

| Item | O que faz |
|---|---|
| Estado | `status`: `idle` / `requesting` / `granted` / `denied` / `unavailable` / `unsupported`; `position` (lat, lng, precisão); `lastUpdate` (timestamp); `error`. |
| `options.enabled` | Se `false`, **nada é pedido** — nenhuma chamada ao navegador. |
| `options.watch` | `true` → `watchPosition` contínuo (rastreio durante a entrega); `false` → `getCurrentPosition` (leitura pontual, ao montar o formulário). |
| `requestOnce()` | Pede a posição uma vez (exposto para o botão "usar minha localização"). |
| Negação | `PERMISSION_DENIED` vira `status: 'denied'` e a tela não mostra posição nenhuma. Nada é simulado. |
| Limpeza | O `useEffect` retorna `clearWatch`, então sair da tela para o rastreio. |

**`contexts/AuthContext.tsx`** — quem é o usuário e o que ele pode.

| Item | O que faz |
|---|---|
| `homeRouteFor(role)` | Mapeia papel → área inicial (`/app`, `/portal`, `/entregador` ou `/entrar`). |
| Estado exposto | `session`, `user`, `profile`, `courier`, `loading`, `configured`, `homeRoute`. |
| `loadContext(session)` | Ao logar, busca `profiles` pelo `id` do usuário. Se o papel for `COURIER`, busca também a linha em `couriers` (é o que dá acesso ao `courier_id` usado no despacho). |
| `signIn(email, password)` | Login; traduz "invalid login credentials" para "E-mail ou senha incorretos." e "email not confirmed" para uma mensagem clara. |
| `signOut()` | Encerra sessão e limpa estado. |
| `refreshProfile()` | Recarrega perfil e entregador (usado depois de trocar senha). |
| `updatePassword(pwd)` | Troca a senha no Auth e zera `must_change_password`. |
| `onAuthStateChange` | Sincroniza login/logout em outra aba. |
| `useAuth()` | Hook de consumo; lança erro se usado fora do provider. |

### 4.6 `src/components/`

**`ui/index.tsx` — biblioteca de componentes (307 linhas)**

| Componente | O que faz |
|---|---|
| `Button` | Botão com variantes, tamanhos e `loading` (spinner + desabilita). |
| `Field` | Rótulo + obrigatório + dica + mensagem de erro do campo. |
| `Input` / `Textarea` / `Select` | Campos controlados com estado `invalid` (borda vermelha). |
| `SearchInput` | Campo de busca com ícone de lupa. |
| `Switch` | Interruptor acessível com rótulo e descrição. |
| `Badge` / `StatusDot` | Etiqueta e bolinha de status. |
| `Card` / `CardHeader` | Container com sombra e cabeçalho título+descrição+ação. |
| `EmptyState` | Estado vazio com ícone, texto e ação. |
| `Skeleton` | Bloco de carregamento. |
| `Modal` | Diálogo acessível com rodapé e tamanhos. |
| `Alert` | Aviso com tons `info` / `success` / `warning` / `danger`. |
| `Tabs` | Abas tipadas. |
| `Pagination` | Paginação com total e tamanho de página. |
| `Progress` | Barra de progresso com tom. |

**`layout/`**

| Arquivo | O que faz |
|---|---|
| `Logo.tsx` | Marca, com variantes de cor e modo compacto. |
| `Protected.tsx` | **Porteiro das áreas privadas.** Se Supabase não está configurado, mostra instrução. Se está carregando, mostra loader. Se não há perfil, manda para `/entrar` guardando a rota de origem. Se `is_active = false`, mostra "Acesso inativo". Se o papel não está em `allow`, redireciona para a home do próprio papel. |
| `DashboardShell.tsx` | Casca comum dos painéis: sidebar com seções, cabeçalho com título/subtítulo por rota, menu do usuário (perfil, trocar senha, sair), **sino de notificações** lendo `notifications` com Realtime, e versão mobile em gaveta ou barra inferior. |
| `ChangePasswordModal.tsx` | Modal de troca de senha. Quando `forced` (usuário com `must_change_password`), abre sozinho e não pode ser fechado — usado no painel e na área do entregador. |

**`site/`**

| Arquivo | O que faz |
|---|---|
| `SiteLayout.tsx` | Moldura do site institucional: header com navegação, botão "Acessar plataforma", footer. Exporta `WHATSAPP_NUMBER` e `whatsappLink(msg)` a partir de `VITE_COMPANY_WHATSAPP`. |
| `LeadForm.tsx` | Formulário de captação reutilizado por Orçamento (`QUOTE`) e Empresas (`BUSINESS`): valida com Zod, envia por `submitLead` e mostra tela de sucesso. |

**`dashboard/`**

| Arquivo | O que faz |
|---|---|
| `OrderBits.tsx` | Peças reutilizadas de pedido: `OrderStatusBadge`, `PriorityBadge`, `RouteBlock` (coleta → destino), `OrderMetaChips` (volumes, refrigerado, distância, agendamento), `OrderTimeline` (linha do tempo dos eventos) e `CourierChip` (nome + telefone com link). |
| `DeliveryMap.tsx` | Mapa Leaflet/OpenStreetMap: recebe listas de coletas, entregas e entregadores, ajusta o zoom para caber tudo (`FitBounds`) e desenha os pinos. Sem tiles disponíveis, o mapa não quebra a página. |

---

## 5. Camada de dados: `src/lib/api.ts` função por função

Este é o coração do sistema: **toda** comunicação com o banco passa por aqui. Sempre que uma função falha, `wrap()` traduz o erro para português — por exemplo, erro `42501` (violação de RLS) vira "Você não tem permissão para executar esta ação." e `23505` (duplicidade) vira "Registro duplicado".

### 5.1 Pedidos

| Função | O que faz |
|---|---|
| `listOrders({pharmacyId, courierId, status, search, from, to, limit})` | Lista pedidos com joins de farmácia, unidade e entregador. Filtra por farmácia/entregador/status/período e busca textual em código, destinatário, rua e cidade. Limite padrão 200. |
| `getOrder(id)` | Um pedido específico + seus `events` (timeline). |
| `createOrder(payload)` | Insere pedido. O código (`DLC-2611-01012`) é gerado por trigger, não aqui. |
| `updateOrder(id, patch)` | Atualiza campos do pedido (status, dados, valores). |
| `addOrderEvent(orderId, event, description)` | Insere evento manual na timeline (usado quando o avanço não vem de trigger). |

### 5.2 Despacho e ofertas

| Função | O que faz |
|---|---|
| `listAvailableCouriers()` | Entregadores com `status = ACTIVE`, ordenados por disponibilidade e nome. |
| `suggestCouriers(order, couriers, limit=5)` | **O algoritmo de sugestão.** Pontua cada entregador e devolve `{courier, score, distance, reasons}` ordenado do melhor para o pior. Detalhado logo abaixo. |
| `offerOrderToCourier({orderId, courierId, method, score, distance, message})` | Cancela ofertas pendentes anteriores do mesmo pedido (uma oferta ativa por vez), cria a nova oferta com validade de **15 minutos** e move o pedido para `OFFERED`. |
| `assignOrder({orderId, courierId, method, reason})` | Atribuição direta: move para `ASSIGNED`, vincula o entregador, grava `assigned_at` e a observação. O histórico e a timeline são gerados por trigger. Cancela ofertas pendentes. |
| `listOffersForCourier(courierId)` | Ofertas `PENDING` do entregador, com o pedido, farmácia e unidade já embutidos. |
| `respondToOffer(offerId, accept)` | Marca a oferta como `ACCEPTED` ou `DECLINED`. **Não** mexe no pedido: quem faz isso é o trigger `offer_response` (aceite vincula o pedido; recusa devolve à fila). Retorna `order_id` e `courier_id` para a tela navegar. |

**Como o `suggestCouriers` pontua (100% auditável):**

| Critério | Pontos | Racional |
|---|---|---|
| Está `AVAILABLE` | +40 | Quem está livre atende mais rápido. |
| Está `OFFLINE` (mas ativo) | +10 | Pode ser acionado, mas custa mais. |
| Mesma cidade da coleta | +20 | Menos deslocamento. |
| `service_zone` contém o bairro da coleta | +10 | Conhece a região. |
| Distância até a coleta | até +30 (`30 − km`) | Mais perto, mais pontos. Sem localização compartilhada, 0 e motivo explícito na tela. |

Entregadores em `ON_DELIVERY` são **excluídos** da lista. O score aparece na tela do despachante junto com os motivos — o despachante decide, o sistema só ordena.

### 5.3 Rastreio

| Função | O que faz |
|---|---|
| `pushLocation({courierId, orderId, latitude, longitude, accuracy})` | Grava a posição em `courier_locations` e atualiza `couriers.current_latitude/longitude/current_location_at`. **Só é chamada depois de permissão explícita de GPS.** |
| `latestLocations(courierIds)` | Posições mais recentes de uma lista de entregadores (para o mapa). |
| `listLocationsForOrder(orderId)` | Trajeto registrado de um pedido específico. |

### 5.4 Farmácias e unidades

| Função | O que faz |
|---|---|
| `listPharmacies()` / `getPharmacy(id)` | Lista/consulta farmácias (a RLS garante que a farmácia só enxerga a si mesma). |
| `upsertPharmacy(payload, id?)` | Cria ou atualiza farmácia. |
| `listUnits(pharmacyId)` | Unidades/filiais, opcionalmente de uma farmácia. |
| `upsertUnit(payload, id?)` | Cria ou atualiza unidade. |

### 5.5 Entregadores e usuários

| Função | O que faz |
|---|---|
| `listCouriers()` | Todos os entregadores visíveis. |
| `getCourierByProfile(profileId)` | Acha a linha do entregador a partir do usuário logado. |
| `updateCourier(id, patch)` / `upsertCourier(payload, id?)` | Atualiza/cria entregador (disponibilidade, dados, aprovação). |
| `listProfiles()` | Todos os usuários da plataforma (staff). |
| `listPharmacyProfiles(pharmacyId)` | Apenas usuários de uma farmácia. |
| `updateProfile(id, patch)` | Atualiza perfil (a política impede escalar papel ou trocar de farmácia). |

### 5.6 Ocorrências e comprovantes

| Função | O que faz |
|---|---|
| `listOccurrences()` | Lista ocorrências (problemas em campo). |
| `createOccurrence(payload)` | Registra ocorrência (destinatário ausente, endereço errado, recusa, avaria…). |
| `resolveOccurrence(id, resolution)` | Marca como resolvida com a descrição da solução. |
| `uploadProof({orderId, file, kind, recipientName, notes, uploadedBy})` | Envia a foto para o bucket **privado** `proofs` com caminho `<pedido>/<timestamp>-<random>.<ext>` e cria a linha em `proofs`. |
| `listProofs(orderId)` | Comprovantes de um pedido. |
| `getProofUrl(path)` | Gera **URL assinada válida por 10 minutos** — o arquivo nunca é público. |

### 5.7 Financeiro

| Função | O que faz |
|---|---|
| `listInvoices(pharmacyId?)` | Faturas com dados da farmácia, ordenadas por vencimento. |
| `getInvoice(id)` | Fatura + itens + pagamentos. |
| `createInvoice(payload)` / `updateInvoice(id, patch)` | Cria/atualiza fatura. O número é gerado por trigger. |
| `addInvoiceItem(payload)` / `removeInvoiceItem(id)` | Adiciona/remove linha de cobrança (normalmente vinculada a um pedido). |
| `registerPayment(payload)` | Registra pagamento (PIX, transferência, dinheiro, cartão, outro). Total e status recalculados por trigger. |
| `listPayments(invoiceId)` | Pagamentos de uma fatura. |
| `billableOrders(pharmacyId, from, to)` | **Entregas de um período que ainda não foram faturadas** — ignora o que já está em `invoice_items`. |
| `listContracts(pharmacyId?)` / `upsertContract(payload, id?)` | Tabela de preços por farmácia. |
| `listPayouts()` / `createPayout(payload)` | Repasses devidos aos entregadores. |

### 5.8 Indicadores, auditoria e captação

| Função | O que faz |
|---|---|
| `dashboardMetrics()` | Cinco contagens em paralelo: pedidos hoje, pedidos ativos, entregues hoje, entregadores ativos, e o valor a receber/vencido das faturas abertas. |
| `ordersByStatus()` | Distribuição de status nos últimos 30 dias (gráfico). |
| `deliveriesLast7Days()` | Entregas por dia nos últimos 7 dias (gráfico), com dias sem entrega valendo 0. |
| `listAuditLogs(limit=200)` | Trilha de auditoria. |
| `logAudit(action, entity, entityId, description, metadata)` | Grava ação na auditoria (quem, o quê, em qual registro). |
| `listSettings()` / `upsertSetting(key, value, description)` | Parâmetros da plataforma. |
| `submitLead(payload)` | Formulário público de orçamento/empresa. Erro é traduzido, sem vazar detalhe técnico. |
| `listLeads()` | Leads comerciais (só staff). |
| `listApplications()` / `submitCourierApplication(payload)` | Candidaturas de entregador (a pública é aberta ao visitante anônimo). |

---

## 6. Regras de negócio implementadas

1. **Código do pedido** — `DLC-<AA><MM>-<sequencial>` gerado por trigger `set_order_code`, sequencial por mês, nunca reaproveitado.
2. **Número da fatura** — gerado por trigger `set_invoice_number`, no mesmo padrão.
3. **Uma oferta ativa por pedido** — antes de criar uma nova, as anteriores são canceladas.
4. **Oferta expira em 15 minutos** (`expires_at`).
5. **Aceite é atômico** — vincular pedido, cancelar as outras ofertas e registrar o evento acontecem numa única transação no banco.
6. **Recusa devolve à fila** — se não sobrou oferta pendente, o pedido volta de `OFFERED` para `PENDING`.
7. **Disponibilidade automática** — ao aceitar/coletar/entrar em rota o entregador vira `ON_DELIVERY`; ao concluir/falhar/cancelar, volta a `AVAILABLE`.
8. **Preço vem do contrato, não do formulário** — `quoted_price_cents` é calculado como: base + (km excedentes × preço por km) + taxa de urgência + taxa de refrigerado. O pedido guarda um *snapshot*, então mudar o contrato depois não altera pedidos antigos.
9. **Repasse ao entregador** — `courier_payout_cents` é copiado do contrato no momento do pedido.
10. **Status da fatura é derivado** — `PAID` se pago ≥ total, `PARTIALLY_PAID` se há pagamento parcial, `OVERDUE` se venceu sem pagar, senão `OPEN`. Ninguém escolhe o status na mão.
11. **Nada é faturado duas vezes** — `billableOrders` exclui pedidos que já estão em alguma fatura.
12. **Entregador não pula etapa** — `COURIER_FLOW` só oferece a próxima transição válida.
13. **Troca de senha obrigatória** — `must_change_password = true` abre modal bloqueante; é o padrão de todo usuário criado pela Edge Function.
14. **Papel não se auto-promove** — a política `profiles_update_self` impede mudar `role` ou `pharmacy_id`.

---

## 7. Banco de dados: tabelas e colunas

7 migrations, aplicadas em produção (`euwonmpgwwoublajfvip`):

| Migration | Conteúdo |
|---|---|
| `20261115000100_core.sql` | Enums base, `profiles`, `pharmacies`, `pharmacy_units`, `couriers`, `courier_applications`, `leads`, `audit_logs`, `settings`, `notifications` + trigger de criação de perfil. |
| `20261115000200_operations.sql` | `orders`, `order_events`, `courier_locations`, `delivery_offers`, `order_assignments`, `occurrences`, `proofs` + triggers de código, timeline e disponibilidade. |
| `20261115000300_finance.sql` | `contracts`, `invoices`, `invoice_items`, `payments`, `courier_payouts` + triggers de numeração e recálculo. |
| `20261115000400_security.sql` | Helpers `app.*`, as 54 políticas RLS, buckets e políticas de storage, publicação de Realtime, grants. |
| `20261115000500_offers.sql` | Trigger `offer_response` + endurecimento da política `orders_update`. |
| `20261115000600_auth_users_fix.sql` | Corrige `NULL` nas colunas de token de `auth.users` (que causava erro 500 no login). |

### Tabelas e campos principais

| Tabela | Para que serve | Campos-chave |
|---|---|---|
| `profiles` | Usuário da plataforma, 1:1 com `auth.users`. | `id`, `email`, `full_name`, `role`, `pharmacy_id`, `is_active`, `must_change_password` |
| `pharmacies` | Farmácia cliente. | `legal_name`, `trade_name`, `cnpj`, `status`, `contact_*`, endereço |
| `pharmacy_units` | Filial/ponto de coleta de uma farmácia. | `pharmacy_id`, `name`, `street`, `number`, `district`, `city`, `state`, `zip_code`, horário |
| `couriers` | Entregador. | `profile_id`, `full_name`, `phone`, `cpf`, `base_city`, `service_zone`, `status`, `availability`, `current_latitude/longitude`, `cnh_category`, `vehicle_plate`, `has_motorcycle` |
| `orders` | **Entidade central.** | `code`, `pharmacy_id`, `unit_id`, `status`, `priority`, bloco de coleta (7 campos), bloco de destino (12 campos), `package_count`, `is_temperature_controlled`, `requires_proof`, `scheduled_for`, `quoted_price_cents`, `courier_payout_cents`, `courier_id`, marcos de tempo (`assigned_at`, `accepted_at`, `collected_at`, `delivered_at`, `cancelled_at`), `estimated_distance_km` |
| `order_events` | Timeline imutável do pedido. | `order_id`, `status`, `event`, `description`, `actor_id`, `created_at` |
| `courier_locations` | Histórico de posições autorizadas. | `courier_id`, `order_id`, `latitude`, `longitude`, `accuracy_m`, `created_at` |
| `delivery_offers` | Oferta de entrega a um entregador. | `order_id`, `courier_id`, `method`, `status`, `score`, `distance_to_pickup_km`, `message`, `expires_at`, `responded_at` |
| `order_assignments` | Histórico de quem foi vinculado a quem. | `order_id`, `courier_id`, `previous_courier_id`, `method`, `actor_id` |
| `occurrences` | Problema reportado em campo. | `order_id`, `type`, `status`, `description`, `resolution`, `reported_by` |
| `proofs` | Comprovante digitalizado (metadados; arquivo no Storage). | `order_id`, `kind`, `storage_path`, `file_name`, `mime_type`, `size_bytes`, `recipient_name`, `uploaded_by` |
| `contracts` | Tabela de preços por farmácia. | `base_price_cents`, `included_km`, `price_per_extra_km_cents`, `courier_payout_cents`, `urgency_fee_cents`, `temperature_fee_cents`, `billing_cycle`, `payment_terms_days`, `starts_on`, `ends_on`, `status` |
| `invoices` | Fatura por período. | `number`, `pharmacy_id`, `contract_id`, `status`, `period_start/end`, `issue_date`, `due_date`, `subtotal_cents`, `discount_cents`, `total_cents`, `paid_cents` |
| `invoice_items` | Linha da fatura. | `invoice_id`, `order_id`, `description`, `total_cents` |
| `payments` | Pagamento recebido. | `invoice_id`, `amount_cents`, `method`, `paid_at`, `reference`, `notes` |
| `courier_payouts` | Repasse ao entregador. | `courier_id`, `amount_cents`, `status`, `period_*`, `paid_at` |
| `leads` | Orçamento/novo negócio vindo do site. | `type`, `name`, `company_name`, `cnpj`, `email`, `phone`, `city`, `state`, `units_count`, `deliveries_per_day`, `status`, `message` |
| `courier_applications` | Candidatura de entregador pelo site. | `full_name`, `phone`, `email`, `cpf`, `city`, `state`, `service_zone`, `has_motorcycle`, `vehicle_plate`, `cnh_category`, `experience`, `status` |
| `audit_logs` | Trilha de auditoria. | `actor_id`, `actor_email`, `actor_role`, `action`, `entity`, `entity_id`, `description`, `metadata` |
| `notifications` | Avisos internos por usuário. | `user_id`, `title`, `body`, `read_at`, `link` |
| `settings` | Parâmetros gerais. | `key`, `value` (jsonb), `description` |

**Índices criados** (para o sistema não degradar com volume): pedidos por farmácia, status, entregador e unidade; faturas por farmácia e vencimento; eventos por pedido; localizações por entregador e por pedido; ofertas por entregador; ocorrências por status; comprovantes por pedido; auditoria por data e entidade; leads por status; notificações por usuário.

---

## 8. Segurança: as 54 políticas RLS explicadas

Row Level Security é o mecanismo em que o **próprio banco** decide quais linhas cada usuário pode ver ou alterar. Nenhuma tela pode contornar isso.

**As funções auxiliares** (`app.*`, todas `SECURITY DEFINER` para não recursar em `profiles`):

| Função | Responde |
|---|---|
| `app.current_role()` | Qual o papel do usuário logado. |
| `app.current_pharmacy_id()` | A qual farmácia ele pertence. |
| `app.current_courier_id()` | Qual a ficha de entregador dele. |
| `app.is_staff()` | É SUPER_ADMIN, ADMIN, DISPATCHER ou FINANCE? |
| `app.is_admin()` | É SUPER_ADMIN ou ADMIN? |
| `app.is_super_admin()` | É SUPER_ADMIN? |
| `app.is_finance()` | Pode ver dinheiro? (SUPER_ADMIN, ADMIN, FINANCE) |
| `app.is_pharmacy_user()` | É da farmácia? |
| `app.is_courier_user()` | É entregador? |

**As políticas por tabela:**

| Tabela | Política | Regra |
|---|---|---|
| `profiles` | `profiles_select` | Vê o próprio perfil; staff vê todos; farmácia vê os da própria farmácia. |
| | `profiles_update_self` | Atualiza só o próprio, e **não pode mudar `role` nem `pharmacy_id`** (bloqueio de escalada). |
| | `profiles_admin_all` | Admin gerencia qualquer perfil. |
| `pharmacies` | `pharmacies_select` | Staff vê todas; entregador vê as que têm pedido para ele; farmácia vê só a sua. |
| | `pharmacies_write` / `_update` | Só admin cria; admin ou a própria farmácia atualiza. |
| `pharmacy_units` | `units_select` | Staff, a farmácia dona, ou entregador com pedido naquela unidade. |
| | `units_write` / `_update` / `_delete` | Admin ou a própria farmácia. |
| `couriers` | `couriers_select` | Staff vê todos; farmácia vê só quem já entregou para ela; entregador vê a si. |
| | `couriers_write` / `_update_staff` | Staff cadastra e edita. |
| | `couriers_update_self` | Entregador edita a própria ficha (disponibilidade, dados de contato). |
| `orders` | `orders_select` | Staff vê tudo; farmácia vê os seus; entregador vê os vinculados a ele **ou** com oferta pendente/aceita para ele. |
| | `orders_insert` | Staff, ou farmácia **apenas com o próprio `pharmacy_id`**. |
| | `orders_update` | Staff; farmácia só os seus e só enquanto `DRAFT`/`PENDING`/`CANCELLED`; entregador só os vinculados a ele. |
| | `orders_delete` | Admin; farmácia pode apagar apenas rascunho próprio. |
| `order_events` | `_select` / `_insert` | Quem vê o pedido vê a timeline; insert conforme vínculo com o pedido. |
| `courier_locations` | `locations_insert` | **Entregador grava somente a própria posição** (`courier_id = app.current_courier_id()`). |
| | `locations_select` | Staff, o próprio entregador e a farmácia com pedido em andamento. |
| `delivery_offers` | `offers_select` | Staff, o entregador da oferta, e a farmácia do pedido. |
| | `offers_insert` | Staff (despacho). |
| | `offers_update` | **Somente o entregador destinatário** responde a própria oferta; staff cancela. |
| `order_assignments` | `_select` / `_insert` | Staff e as partes envolvidas. |
| `occurrences` | `occurrences_select` | Staff, a farmácia do pedido e o entregador do pedido. |
| | `_insert` / `_update` | Entregador e farmácia reportam no próprio pedido; staff resolve. |
| `proofs` | `proofs_select` | Staff, a farmácia do pedido, o entregador do pedido. |
| | `proofs_insert` | Quem tem vínculo com o pedido. |
| `contracts`, `invoices`, `invoice_items`, `payments`, `courier_payouts` | `_select` / `_write` | **Somente `app.is_finance()`** (mais a farmácia, vendo apenas as próprias faturas). Entregador e operador de farmácia não acessam. |
| `leads` | `leads_insert_public` | **`anon` e `authenticated` podem inserir** — é o formulário do site. |
| | `leads_select` / `_update` | Só staff comercial. |
| `courier_applications` | `applications_insert_public` | **`anon` pode inserir** (candidatura pelo site). |
| | `_select` / `_update` | Só staff. |
| `audit_logs` | `audit_select` / `_insert` | Só admin lê; qualquer autenticado registra. |
| `settings` | `settings_select` / `_write` | Leitura autenticada; escrita só admin. |
| `notifications` | `notifications_select` / `_update` | Apenas as do próprio `user_id`. |

**Storage (arquivos)**

| Bucket | Privado | Política |
|---|---|---|
| `proofs` | Sim (10 MB, jpg/png/webp/pdf) | Autenticado insere; leitura só se existir linha correspondente em `proofs` (ou seja, só quem tem vínculo com o pedido). Acesso por URL assinada de 10 min. |
| `receipts` | Sim (10 MB) | `SELECT`/`INSERT`/`DELETE` só para `app.is_finance()`. |

**Realtime** está publicado em `notifications`, `delivery_offers`, `courier_locations` e `invoices` — por isso o sino e a contagem de ofertas atualizam sozinhos.

---

## 9. Automações do banco: triggers e funções

| Trigger | Quando dispara | O que faz |
|---|---|---|
| `set_order_code` | antes de inserir pedido | Gera `DLC-<AAMM>-<sequencial>`. |
| `set_invoice_number` | antes de inserir fatura | Gera o número sequencial da fatura. |
| `log_order_changes` | após inserir/atualizar pedido | Insere `ORDER_CREATED` na criação, `STATUS_CHANGED` a cada mudança de status e uma linha em `order_assignments` a cada troca de entregador. **A timeline não pode ser burlada.** |
| `sync_courier_availability` | após mudança de status | `ACCEPTED/PICKING_UP/COLLECTED/IN_TRANSIT` → entregador vira `ON_DELIVERY`; `DELIVERED/FAILED/CANCELLED` → volta a `AVAILABLE`. |
| `offer_response` | ao inserir/alterar oferta | **Aceite:** vincula o pedido, grava `assigned_at`/`accepted_at`, cancela as outras ofertas e registra `OFFER_ACCEPTED`. **Recusa/expiração:** registra o evento e, se não restar oferta pendente, devolve o pedido a `PENDING`. |
| `recalc_on_item` / `recalc_on_payment` | após mudar item ou pagamento | Executa `recalc_invoice_totals`: soma itens, soma pagamentos, aplica desconto e deriva `status`/`total_cents`/`paid_cents`. |
| `touch_updated_at` (ordens, ocorrências, faturas, contratos) | antes de atualizar | Atualiza `updated_at`. |
| `on_auth_user_created` | ao criar usuário no Auth | Cria automaticamente o registro em `profiles` com papel e farmácia vindos do `user_metadata`. |

---

## 10. Edge Function `admin-users`

Localizada em `supabase/functions/admin-users/index.ts`, publicada com `verify_jwt = true`. Existe porque **criar usuário e trocar senha exigem a `service_role` key**, que nunca pode ir para o navegador — então essa chave fica só dentro da função.

**Fluxo de autorização:** valida o `Bearer` → descobre quem é → carrega o perfil → exige `is_active` → exige `SUPER_ADMIN` ou `ADMIN`. Só então age.

| Ação | O que faz | Travas |
|---|---|---|
| `create` | Cria o usuário no Auth (e-mail já confirmado) e faz `upsert` do perfil com `must_change_password = true`. | E-mail válido; senha ≥ 8; papel na lista; **só SUPER_ADMIN cria SUPER_ADMIN**; papel de farmácia exige `pharmacy_id`. |
| `set-password` | Redefine a senha e marca troca obrigatória no próximo acesso. | **Só SUPER_ADMIN redefine senha de SUPER_ADMIN.** |
| `deactivate` | Marca `is_active = false` e bane o usuário no Auth por ~100 anos. | Não é possível desativar a própria conta. |

Toda ação grava em `audit_logs` com autor, e-mail, papel e descrição.

---

## 11. Mapa de rotas do frontend

| Rota | Acesso | Tela |
|---|---|---|
| `/` | Público | Home institucional |
| `/servicos` | Público | Serviços oferecidos |
| `/farmacias` | Público | Portal para farmácias |
| `/como-funciona` | Público | As 6 etapas do processo |
| `/orcamento` | Público | Formulário de orçamento |
| `/empresas` | Público | Cadastro de nova empresa |
| `/contato` | Público | Contato / WhatsApp |
| `/entregadores` | Público | Candidatura de entregador |
| `/recuperar-senha` | Público | Pedido de link para redefinir senha |
| `/nova-senha` | Público (link do e-mail) | Definição da nova senha |
| `*` (qualquer outra) | Público | Página 404 dentro do layout do site |
| `/entrar` | Público | Login |
| `/app` | Staff | Dashboard operacional |
| `/app/pedidos`, `/app/pedidos/:id` | Staff | Lista e detalhe do pedido |
| `/app/despacho` | Staff | Central de despacho |
| `/app/mapa` | Staff | Mapa de entregas |
| `/app/farmacias`, `/app/unidades` | Staff | Cadastros |
| `/app/entregadores` | Staff | Cadastro e aprovação |
| `/app/historico` | Staff | Entregas concluídas |
| `/app/ocorrencias`, `/app/comprovantes` | Staff | Ocorrências e documentos |
| `/app/contratos`, `/app/faturas`, `/app/repassee` | Staff (financeiro) | Financeiro |
| `/app/relatorios` | Staff | Indicadores |
| `/app/usuarios`, `/app/funcionarios` | Admin | Usuários e permissões |
| `/app/auditoria`, `/app/configuracoes` | Admin | Auditoria e parâmetros |
| `/app/leads`, `/app/candidaturas` | Staff | Captação comercial |
| `/portal` | Farmácia | Painel da farmácia |
| `/portal/novo-pedido` | Farmácia | Criar pedido |
| `/portal/pedidos`, `/portal/pedidos/:id` | Farmácia | Pedidos e detalhe |
| `/portal/unidades`, `/portal/funcionarios` | Farmácia (admin) | Gestão da própria farmácia |
| `/portal/financeiro`, `/portal/comprovantes` | Farmácia | Faturas e documentos |
| `/portal/configuracoes` | Farmácia | Dados cadastrais |
| `/entregador` | Entregador | Meu dia |
| `/entregador/ofertas` | Entregador | Ofertas recebidas |
| `/entregador/entrega/:id` | Entregador | Execução da entrega |
| `/entregador/historico` | Entregador | Entregas concluídas |
| `/entregador/perfil` | Entregador | Perfil e disponibilidade |

---

## 12. Todas as páginas: o que cada tela faz

### 12.1 Site institucional (`src/pages/site/`)

| Página | O que faz |
|---|---|
| `Home.tsx` | Hero, cartão ilustrativo de um pedido em rota, três pilares (cuidado com medicamentos, operação organizada, rastreio autorizado), as 4 macroetapas, três blocos por público (farmácias, despacho, entregadores), faixa de recursos e CTA final. |
| `Services.tsx` | Seis serviços detalhados: motoboy dedicado, itens sensíveis, rotinas de manipulação, agendamento/prioridade, acompanhamento com autorização, controle financeiro. |
| `Pharmacies.tsx` | Página voltada à farmácia: o que ela faz no portal, responsabilidade do farmacêutico, visibilidade da operação. |
| `HowItWorks.tsx` | As 6 etapas do processo, do pedido ao faturamento, com nota de privacidade do GPS. |
| `Quote.tsx` | Formulário de orçamento (`LeadForm type="QUOTE"`) + canal WhatsApp. |
| `Business.tsx` | Cadastro de nova empresa (`LeadForm type="BUSINESS"`). |
| `Contact.tsx` | Canais de contato. |
| `CourierJoin.tsx` | Candidatura de entregador: formulário completo (dados, CPF, cidade, região, CNH, placa, moto própria, experiência) com tela de confirmação; avisa que passa por análise interna. |
| `Login.tsx` | Login com validação Zod, mostrar/ocultar senha, mensagens de erro traduzidas e o bloco **"Acesso rápido (demonstração)"** que preenche credenciais de teste. |

### 12.2 Painel administrativo (`src/pages/admin/`)

| Página | Chamadas de API | O que faz |
|---|---|---|
| `AdminLayout.tsx` | — | Casca do painel: menu em 4 seções (Operação, Cadastros, Financeiro, Administração) filtrado por papel — `DISPATCHER` não vê financeiro, `FINANCE` não vê cadastros sensíveis. |
| `Dashboard.tsx` | `dashboardMetrics`, `ordersByStatus`, `deliveriesLast7Days`, `listOrders` | Cartões do dia, gráfico de status (30 dias), gráfico de entregas (7 dias) e pedidos recentes. |
| `Orders.tsx` | `listOrders` | Lista filtrável com busca por código/destinatário/endereço e etiquetas de status/prioridade. |
| `OrderDetail.tsx` | `getOrder`, `updateOrder`, `assignOrder`, `createOccurrence`, `listProofs`, `getProofUrl`, `listLocationsForOrder`, `listCouriers`, `logAudit` | Tela mais completa do sistema: dados completos, rota, valores, timeline, troca de entregador, cancelamento (limpa os campos do entregador ao voltar para `PENDING`), ocorrências, comprovantes, trajeto e auditoria. |
| `Dispatch.tsx` | `listOrders`, `listAvailableCouriers`, `suggestCouriers`, `offerOrderToCourier`, `assignOrder`, `logAudit` | Fila de pedidos pendentes; para o selecionado, mostra as sugestões com **score e motivos**; despachante pode ofertar ou atribuir direto. |
| `DeliveryMapPage.tsx` | `listOrders`, `listAvailableCouriers` | Mapa com coletas, entregas e posições autorizadas. |
| `History.tsx` | `listOrders` | Entregas concluídas com tempos e valores. |
| `Occurrences.tsx` | `listOccurrences`, `resolveOccurrence`, `logAudit` | Fila de ocorrências e resolução com descrição. |
| `Proofs.tsx` | `getProofUrl` | Visualização dos comprovantes por URL assinada temporária. |
| `Pharmacies.tsx` / `Units.tsx` | `listPharmacies`, `upsertPharmacy`, `listUnits`, `upsertUnit`, `logAudit` | CRUD de farmácias e filiais. |
| `Couriers.tsx` | `listCouriers`, `upsertCourier`, `logAudit` | Cadastro, aprovação e disponibilidade de entregadores. |
| `Contracts.tsx` | `listContracts`, `listPharmacies`, `upsertContract`, `logAudit` | Tabela de preços por farmácia. |
| `Invoices.tsx` | `listInvoices`, `getInvoice`, `createInvoice`, `billableOrders`, `addInvoiceItem`, `removeInvoiceItem`, `registerPayment`, `listPharmacies`, `logAudit` | Emissão de fatura por período puxando só entregas não faturadas, itens, pagamentos parciais e status derivado. |
| `Payouts.tsx` | `listPayouts`, `listCouriers`, `listOrders`, `createPayout`, `logAudit` | Repasses a entregadores por entrega. |
| `Reports.tsx` | `listOrders` | Indicadores operacionais e financeiros por período. |
| `Users.tsx` | `listProfiles`, `listPharmacies`, `listCouriers`, `updateProfile`, `logAudit` + `functions.invoke('admin-users')` | Criar usuário com papel e farmácia, redefinir senha, ativar/desativar. |
| `Audit.tsx` | `listAuditLogs` | Trilha de auditoria (quem fez o quê e quando). |
| `Settings.tsx` | `listSettings`, `upsertSetting`, `logAudit` | Parâmetros da plataforma. |
| `Leads.tsx` | `listLeads` | Leads comerciais com status (novo, contatado, qualificado, ganho, perdido). |
| `Applications.tsx` | `listApplications`, `upsertCourier`, `logAudit` | Aprovar candidatura convertendo-a em entregador. |

### 12.3 Portal da farmácia (`src/pages/pharmacy/`)

| Página | Chamadas de API | O que faz |
|---|---|---|
| `PharmacyLayout.tsx` | — | Casca do portal; mostra itens de gestão (unidades, funcionários, configurações) apenas para `PHARMACY_ADMIN`. |
| `PortalHome.tsx` | `listOrders`, `listInvoices` | Resumo: pedidos em andamento, entregues, valores. |
| `NewOrder.tsx` | `createOrder`, `listUnits`, `listContracts` | Formulário de pedido em blocos (coleta, destino, carga, prioridade), geocodificação opcional dos dois endereços, cálculo transparente do preço a partir do contrato e resumo antes de confirmar. |
| `PortalOrders.tsx` / `PortalOrderDetail.tsx` | `listOrders`, `getOrder`, `createOccurrence`, `listProofs`, `getProofUrl`, `listLocationsForOrder` | Acompanhamento dos próprios pedidos, timeline, trajeto e comprovantes. |
| `PortalUnits.tsx` | `listUnits`, `upsertUnit` | Filiais da farmácia. |
| `PortalStaff.tsx` | `listPharmacyProfiles` | Funcionários da farmácia. |
| `PortalFinance.tsx` | `listInvoices`, `getInvoice` | Faturas e pagamentos. |
| `PortalProofs.tsx` | `listOrders`, `listProofs`, `getProofUrl` | Comprovantes das entregas. |
| `PharmacySettings.tsx` | `getPharmacy`, `upsertPharmacy` | Dados cadastrais da farmácia. |

### 12.4 Área do entregador (`src/pages/courier/`)

| Página | Chamadas de API | O que faz |
|---|---|---|
| `CourierLayout.tsx` | `updateCourier` + Realtime | Barra inferior mobile-first, **contador de ofertas ao vivo** via `postgres_changes` na tabela `delivery_offers`, alternância de disponibilidade e troca de senha obrigatória. |
| `CourierHome.tsx` | `listOffersForCourier`, `listOrders` | "Meu dia": ofertas pendentes e entregas em andamento. |
| `CourierOffers.tsx` | `listOffersForCourier`, `respondToOffer` | Lista de ofertas com farmácia, rota, distância, mensagem e prazo; **Aceitar** e **Recusar**. Ao aceitar, navega para a entrega usando o `order_id` retornado. |
| `CourierDelivery.tsx` | `getOrder`, `updateOrder`, `pushLocation`, `uploadProof`, `createOccurrence`, `listProofs`, `getProofUrl` | Execução da entrega: botão da próxima etapa (`COURIER_FLOW`), **rastreio só ao autorizar o GPS**, envio de comprovante por foto e registro de ocorrência. |
| `CourierHistory.tsx` | `listOrders` | Entregas concluídas com valores de repasse. |
| `CourierProfile.tsx` | `updateCourier`, `listPayouts` | Dados pessoais, veículo, disponibilidade e histórico de repasses. |

---

## 13. Fluxo completo de um pedido

```
1. FARMÁCIA cria o pedido
   /portal/novo-pedido → orderSchema → createOrder()
   → status PENDING, código DLC-AAMM-NNNNN gerado por trigger
   → preço calculado do contrato (base + km extra + taxas)
   → trigger: ORDER_CREATED na timeline

2. DESPACHO vê a fila e escolhe
   /app/despacho → suggestCouriers() pontua os entregadores
   ├── Ofertar → offerOrderToCourier() → status OFFERED (validade 15 min)
   └── Atribuir direto → assignOrder() → status ASSIGNED

3. ENTREGADOR responde (celular)
   /entregador/ofertas → respondToOffer()
   ├── ACEITOU → trigger oferece o pedido a ele, cancela as outras ofertas,
   │             grava OFFER_ACCEPTED → status ACCEPTED
   │             entregador vira ON_DELIVERY automaticamente
   └── RECUSOU → evento registrado; sem oferta pendente, volta a PENDING

4. ENTREGA acontece (cada avanço registrado por trigger)
   ACCEPTED → PICKING_UP → COLLECTED → IN_TRANSIT → DELIVERED
   Ao autorizar o GPS, pushLocation() grava o trajeto.
   Na entrega, uploadProof() envia a foto para o bucket privado.

5. ACOMPANHAMENTO
   Farmácia (/portal), despacho (/app/pedidos/:id) e mapa (/app/mapa)
   veem status, timeline, trajeto e comprovante — cada um no seu escopo.

6. FINANCEIRO fecha o mês
   /app/faturas → billableOrders() traz só entregas não faturadas
   → createInvoice() + addInvoiceItem() por entrega
   → registerPayment() a cada pagamento (parcial ou total)
   → trigger recalcula total_cents/paid_cents e deriva o status

7. REPASSE ao entregador
   /app/repassee → createPayout() sobre courier_payout_cents do contrato
```

---

## 14. Segurança e privacidade do GPS

Esta é uma exigência explícita do projeto, implementada em quatro camadas:

1. **Nada é pedido sem ação.** `useGeolocation` só consulta o navegador se `enabled = true`. Ao montar a tela de entrega, `enabled` começa desligado: existe um botão explícito de autorização.
2. **Negação é respeitada.** Se o usuário negar, o status vira `denied` e a interface não mostra posição alguma. Não há fallback simulado — em nenhum lugar do código existe coordenada inventada ou randomizada.
3. **Sem autorização, sem escrita.** `pushLocation` só é chamado dentro do bloco autorizado, e a política RLS `locations_insert` exige que o `courier_id` seja do próprio usuário — outro entregador não consegue gravar em seu nome (testado em produção, retorna `403`).
4. **Honestidade temporal.** `isLocationFresh` classifica como "ao vivo" apenas posições com menos de 3 minutos. Mais antigo que isso, a tela rotula "última posição conhecida" com o horário exato. O site institucional também afirma isso ao público.

Além do GPS: `getProofUrl` gera URLs assinadas de 10 minutos, o bucket não é público, e o cabeçalho `Permissions-Policy: geolocation=(self), camera=(self)` (em `vercel.json`) restringe GPS e câmera ao próprio domínio da plataforma.

---

## 15. Ambiente, deploy e operação

### Variáveis de ambiente

| Variável | Onde | Para que serve |
|---|---|---|
| `VITE_SUPABASE_URL` | local + Vercel | URL do projeto Supabase. |
| `VITE_SUPABASE_ANON_KEY` | local + Vercel | Chave pública (protegida por RLS). |
| `VITE_COMPANY_WHATSAPP` | local (opcional) | Número usado nos links `wa.me`. |
| `SUPABASE_SERVICE_ROLE_KEY` | só dentro da Edge Function | Chave administrativa; **nunca** no frontend. |

### Comandos

```bash
npm install          # instala dependências
npm run dev          # servidor local em http://localhost:5173
npm run typecheck    # tsc -b --noEmit — é o "lint" (tsconfig é estrito)
npm run build        # tsc -b && vite build → dist/
npm run preview      # serve o build em :4173
```

### Deploy

- Projeto Vercel `dluca-connect` (team `bloco3-jaccob`), framework Vite, build `npm run build`, saída `dist`.
- Conectado ao repositório `marcos167/DLucas`; produção em https://dluca-connect.vercel.app.
- `vercel.json` garante o SPA fallback (rota desconhecida → `index.html`) e os cabeçalhos de segurança.
- No Supabase → Authentication → URL Configuration: Site URL `https://dluca-connect.vercel.app`, Redirect URLs com o domínio da Vercel e `localhost:5173`.

### Configuração do Supabase em produção

- Região `sa-east-1`, projeto `euwonmpgwwoublajfvip`.
- **Signups desativados** — ninguém cria conta sozinho; usuários nascem pela Edge Function `admin-users`.
- `mailer_autoconfirm` ligado (não há SMTP configurado nesta versão).
- Buckets `proofs` e `receipts` privados.
- Realtime publicado em `notifications`, `delivery_offers`, `courier_locations` e `invoices`.

### Contas existentes

| Papel | E-mail |
|---|---|
| `SUPER_ADMIN` | `marco.lp12@hotmail.com` (primeiro acesso exige troca de senha) |
| `DISPATCHER` | `despacho@dluca.com.br` |
| `FINANCE` | `financeiro@dluca.com.br` |
| `PHARMACY_ADMIN` | `farmacia@alquimia.com.br` |
| `PHARMACY_STAFF` | `operador@alquimia.com.br` |
| `COURIER` | `entregador@dluca.com.br` (Anderson Silva Prado) |

As contas de demonstração usam a senha `Dluca@2026` e o bloco "Acesso rápido" da tela de login preenche os dados automaticamente. **Antes de uso real: remover esse bloco e trocar todas as senhas.**

---

## 16. Testes realizados em produção

Executados contra o banco real com sessões autenticadas reais (funções temporárias de teste, removidas depois):

| Verificação | Resultado |
|---|---|
| Login dos 6 perfis | ✅ todos autenticam |
| Isolamento da farmácia (pedidos, farmácias, faturas) | ✅ vê apenas os próprios |
| Farmacêutico cria pedido na própria unidade | ✅ 201 |
| Farmacêutico tenta criar pedido em farmácia alheia | ✅ bloqueado (403) |
| Farmacêutico lê pedidos de outra farmácia | ✅ 0 linhas |
| Escalada de papel para `SUPER_ADMIN` | ✅ bloqueada (403), papel inalterado |
| Entregador lê faturas e leads | ✅ 0 linhas |
| Entregador grava GPS de outro entregador | ✅ bloqueado |
| Entregador grava a própria localização | ✅ 201 |
| Fluxo completo de entrega | ✅ `ACCEPTED → PICKING_UP → COLLECTED → IN_TRANSIT → DELIVERED` |
| Visitante anônimo envia orçamento e candidatura | ✅ 201 em ambos |
| Visitante anônimo lê farmácias/pedidos/leads | ✅ 0 linhas |
| Rotas públicas renderizam | ✅ todas |
| Rota protegida sem sessão | ✅ redireciona para `/entrar` |

Um **bug real** foi encontrado nessa etapa: usuários criados por `INSERT` direto em `auth.users` ficavam com `NULL` em `confirmation_token`, `recovery_token`, `email_change` e `email_change_token_new`, e o GoTrue devolvia **HTTP 500 "Database error querying schema"** em qualquer login. Corrigido normalizando para string vazia e registrado na migration `20261115000600_auth_users_fix.sql` (idempotente).

---

## 17. Limitações conhecidas

- **Sem exportação em PDF** de faturas e relatórios (apenas visualização em tela).
- **Sem envio de e-mail/SMS** — as notificações são internas (sino + Realtime). Não há SMTP configurado.
- **Geocodificação é best-effort** via Nominatim público (sujeito a limite de uso). Sem resultado, o pedido é criado sem coordenadas e por isso não aparece no mapa — o comportamento é avisado na tela.
- **Sem app nativo**: a área do entregador é web mobile-first, pronta para PWA, mas sem service worker nesta versão (não funciona offline).
- **Criação de usuário depende da Edge Function** `admin-users`; se ela estiver indisponível, é preciso usar o painel do Supabase.
- **Deploy automático por push está desligado** na conexão Git da Vercel — publicar exige disparar o deploy.
- **O bloco "Acesso rápido" da tela de login expõe credenciais de demonstração no código** e precisa ser removido antes de qualquer uso real.
- **Não há integração com gateway de pagamento** por decisão de escopo: o controle financeiro é manual (registro de pagamentos, sem cobrança automática).
- **Sem teste de integração contra o banco**: os 57 testes automatizados cobrem regra de negócio (ranking, validação, formatação, erros), mas as 54 políticas RLS ainda dependem de verificação manual. Cobrir RLS com teste automatizado é o próximo passo natural.
- **Recuperação de senha depende de SMTP**: o código está pronto, mas o envio usa o serviço padrão do Supabase, com cota baixa no plano gratuito. Para uso real é preciso configurar um provedor de e-mail (Resend, SendGrid, Amazon SES) em *Authentication → SMTP*.

---

## 17.1. Tratamento de erros e feedback ao usuário

O projeto tinha um problema silencioso: das 25 chamadas `useMutation`, 14 não
tratavam falha nenhuma. O usuário clicava, a operação quebrava e nada aparecia
na tela.

### `src/components/ui/Toast.tsx`

Sistema de notificação efêmera montado no topo da árvore (`main.tsx`), fora do
`AuthProvider`. Usa portal para `document.body`, então fica acima de qualquer
modal.

| Recurso | Como funciona |
|---|---|
| `useToast()` | Devolve `push()` e `dismiss()` |
| Tempo na tela | 4 s para sucesso/informação, 6 s para erro |
| Limite | 4 toasts simultâneos; o mais antigo sai |
| Acessibilidade | `role="alert"` + `aria-live="assertive"` em erros |
| Limpeza | Timers cancelados no desmonte do provider |

### `src/hooks/useApiMutation.ts`

Substitui `useMutation` quando a tela quer feedback automático.

```ts
const salvar = useApiMutation({
  mutationFn: () => updateOrder(id, { status }),
  onSuccess: () => qc.invalidateQueries({ queryKey: ['order', id] }),
  successMessage: 'Status atualizado.',
})
```

- **`successMessage`** — texto fixo ou função `(data, vars) => string`.
- **`silentError`** — desliga o toast de erro quando a tela já mostra o erro.
- `onSuccess` e `onError` originais continuam funcionando; são chamados depois.

### `errorMessage()` — tradução de erro técnico

O Supabase devolve mensagens em inglês sobre detalhes de banco. A função
converte os casos comuns:

| Erro bruto | O que o usuário lê |
|---|---|
| `violates row-level security policy` | "Ação não permitida para o seu perfil." |
| `duplicate key value` | "Este registro já existe." |
| `Failed to fetch` | "Sem conexão com o servidor." |
| `JWT expired` | "Sua sessão expirou." |
| `null value in column` | "Preencha todos os campos obrigatórios." |

Para regras de negócio, use `throw new AppError('mensagem', 'explicação')`.

### Onde foi aplicado

`Dispatch.tsx`, `OrderDetail.tsx`, `Occurrences.tsx`, `Payouts.tsx`,
`Settings.tsx`, `PharmacySettings.tsx`, `CourierProfile.tsx` — os sete arquivos
que não tinham nenhum tratamento. Os demais já tinham `onError` próprio.

### `src/components/layout/ErrorBoundary.tsx`

Envolve todas as rotas. Um erro de render mostra uma tela com a mensagem,
botão de recarregar e caminho de volta — em vez de página branca.

## 17.2. Recuperação de senha

Três peças:

| Arquivo | Papel |
|---|---|
| `AuthContext.requestPasswordReset(email)` | Chama `resetPasswordForEmail` com `redirectTo` para `/nova-senha` |
| `pages/auth/ForgotPassword.tsx` | Tela `/recuperar-senha`, acessível pelo link no login |
| `pages/auth/NewPassword.tsx` | Tela `/nova-senha`, destino do link do e-mail |

**Decisão de segurança:** a tela confirma o envio mesmo quando o e-mail não
existe. Responder "e-mail não cadastrado" permitiria descobrir quem tem conta.

**Sessão temporária:** o link cria uma sessão curta, então `updateUser` troca a
senha sem pedir a antiga. Se o link estiver vencido, a tela informa e oferece
pedir outro.

**Configuração obrigatória no Supabase** (*Authentication → URL Configuration*):

- `Site URL`: `https://dluca-connect.vercel.app`
- `Redirect URLs`: `https://dluca-connect.vercel.app/nova-senha`

Sem isso, o link do e-mail cai na home e a recuperação não funciona.

## 17.3. Lint e desempenho do bundle

**ESLint** (`eslint.config.js`) com `@eslint/js`, `typescript-eslint`,
`react-hooks` e `react-refresh`. Scripts:

| Script | O que faz |
|---|---|
| `npm run lint` | Analisa o código |
| `npm run lint:fix` | Corrige o que é automático |
| `npm run typecheck` | `tsc -b --noEmit` (separado do lint) |

Estado atual: **0 erros, 0 avisos**.

**Code splitting** — as rotas de `/app`, `/portal` e `/entregador` usam
`React.lazy`. O site institucional continua no bundle principal, porque é a
porta de entrada.

| | Antes | Depois |
|---|---|---|
| Bundle principal | 1.435 kB | 252 kB (70 kB gzip) |
| Mapa (Leaflet) | no principal | chunk próprio, 155 kB |
| Gráficos (Recharts) | no principal | chunk próprio, 577 kB (só dashboard/relatórios) |
| Supabase | no principal | chunk próprio, 229 kB |

Os chunks de biblioteca mudam pouco entre deploys, então o navegador mantém o
cache deles mesmo quando o código do sistema é atualizado.

## 18. Testes e integração contínua

### Stack

Vitest 2 + Testing Library, ambiente `jsdom`. Configuração em `vitest.config.ts`,
setup em `src/test/setup.ts`.

```bash
npm run test           # watch
npm run test:run       # execução única (CI)
npm run test:coverage  # relatório HTML de cobertura
```

### O que está coberto

| Arquivo | Testes | Alvo |
|---|---|---|
| `src/lib/dispatch.test.ts` | 11 | Ranking de entregadores |
| `src/lib/validation.test.ts` | 21 | Todos os schemas zod |
| `src/lib/utils.test.ts` | 16 | Formatação, máscaras, distância, frescor de GPS |
| `src/hooks/useApiMutation.test.ts` | 9 | Tradução de erros |

**Total: 57 testes.**

A escolha foi testar regra de negócio, não interface. O ranking de despacho é o
caso mais importante: os pesos (+40 disponível, +20 mesma cidade, +10 bairro,
até +30 distância) estão no deck apresentado ao cliente, então precisam ser
imutáveis sem decisão explícita.

Casos fixados que já pegaram regressão:

- Entregador `ON_DELIVERY` nunca entra na sugestão.
- Pontuação de distância tem piso em zero.
- `distanceKm` é simétrica.
- Localização com mais de 3 minutos não é "agora".
- `brl()` usa espaço não separável (U+00A0) do `Intl` — testes normalizam.
- `km()` usa vírgula decimal (pt-BR), não ponto.

### Integração contínua

`.github/workflows/ci.yml` roda em push na `main` e em todo PR:

```
npm ci → lint → typecheck → test:run → build → varredura de segredos
```

**A varredura de segredos** é um `grep` por `password`/`senha` seguido de literal
de 6+ caracteres dentro de `dist/assets/*.js`. Foi adicionada porque uma senha de
super administrador chegou a ser publicada no bundle (ver `RELATORIO-UPGRADES.md`).

### Bloco de demonstração da tela de login

Controlado por `VITE_DEMO_LOGINS`. Sem a variável, o bloco "Acesso rápido" não é
renderizado e as contas fictícias não entram no bundle. Para demonstração,
defina `VITE_DEMO_LOGINS=1` no ambiente de preview.

**Regra:** nunca incluir conta real nesse bloco. Apenas contas fictícias de
demonstração.

---

## 19. Design system

O sistema visual está documentado em detalhe em **`DESIGN-SYSTEM.md`**. Resumo
das decisões que afetam o código:

### Tokens (`tailwind.config.ts`)

| Grupo | O que define |
|---|---|
| `brand` | Verde da marca, recalibrado um tom acima (`#12b98c` no 500) |
| `accent` | Âmbar — única cor quente, reservada para CTA comercial |
| `ink` | Neutros, 90% da interface |
| `signal` | Verde de sinalização, distinto do verde de marca |
| `shadow-*` | Escala de elevação em 4 camadas |
| `text-display-*` | Escala tipográfica com tracking óptico |
| `ease-out` / `spring` | Curvas de movimento |

### Camada de componentes (`index.css`)

Classes reutilizáveis: `card`, `card-interactive`, `surface-dark`, `btn-primary`,
`btn-accent`, `btn-sheen`, `badge-ring`, `tabular`, `eyebrow`, `skeleton-shimmer`,
`bg-grid-subtle`, `divider-fade`, `card-gradient-border`.

### Componentes novos

- **`StatCard`** — cartão de indicador com ícone tonal, variação e halo no hover.
  Substituiu o `KpiCard` local do dashboard.
- **`LogoMark`** — símbolo da marca isolado, para uso em contextos compactos.
- **`Badge`** ganhou prop `tone` (neutral, brand, success, warning, danger, info).

### Mudanças de comportamento visual

- Badges de status passaram de preenchimento saturado para tinta + anel.
  Isso altera `ORDER_STATUS_CLASS`, `ORDER_PRIORITY_CLASS`,
  `AVAILABILITY_CLASS` e `INVOICE_STATUS_CLASS` em `lib/utils.ts`.
- Sidebar do painel marca a seção ativa com barra vertical que desliza.
- Hero do site e painel do login ganharam textura de grade com máscara radial.
- Modal passou a usar `shadow-modal` e `animate-scale-in`.

### Acessibilidade

Foco visível global (anel de 2 px), `prefers-reduced-motion` respeitado em todas
as animações, `role="dialog"` no modal e `aria-live` nos toasts.

---

## 20. Glossário

| Termo | Significado |
|---|---|
| **RLS** (Row Level Security) | Recurso do PostgreSQL em que o banco decide, linha por linha, o que cada usuário pode ler ou alterar. |
| **Política** | Regra de RLS (ex.: "farmácia só vê pedidos com o próprio `pharmacy_id`"). |
| **Trigger** | Função que o banco executa sozinho quando algo acontece (inserir, atualizar). |
| **`SECURITY DEFINER`** | Função que roda com os privilégios de quem a criou, e não de quem a chama — usada para regras atômicas e para os helpers de RLS. |
| **Bucket privado** | Área de armazenamento em que o arquivo não tem URL pública; o acesso é por link assinado temporário. |
| **Realtime** | Canal em que o banco avisa o navegador sobre mudanças, sem recarregar a página. |
| **Edge Function** | Função serverless do Supabase, usada para guardar a `service_role` key. |
| **Snapshot de preço** | Cópia do valor do contrato dentro do pedido, para que mudanças futuras não alterem o passado. |
| **Oferta** | Proposta de entrega enviada a um entregador específico, com prazo de 15 minutos. |
| **Comprovante** | Foto ou PDF que prova a entrega, vinculada ao pedido e guardada em bucket privado. |
| **Ocorrência** | Registro tipificado de um problema na entrega (destinatário ausente, endereço incorreto, recusa, avaria…). |
| **Repasse** | Valor que a D'Luca paga ao entregador por entrega realizada. |
| **Haversine** | Fórmula que calcula a distância em km entre duas coordenadas na superfície da Terra. |

---

*Documento gerado a partir do código em produção. Para o guia funcional resumido, veja `DOCUMENTACAO.md`; para o início rápido, `README.md`.*
