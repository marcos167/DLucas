# DLucas Express — Documentação

Plataforma SaaS de logística e transporte de medicamentos para a **DLucas Express**.
Projeto construído do zero: aplicação nova, banco novo, identidade visual própria.

---

## 1. Visão geral

| Módulo | Rota | Quem acessa |
|---|---|---|
| Site institucional | `/`, `/servicos`, `/farmacias`, `/como-funciona`, `/orcamento`, `/empresas`, `/contato`, `/entregadores` | Público |
| Login único | `/entrar` | Todos |
| Painel administrativo | `/app/*` | SUPER_ADMIN, ADMIN, DISPATCHER, FINANCE |
| Portal da farmácia | `/portal/*` | PHARMACY_ADMIN, PHARMACY_STAFF |
| Área do entregador (mobile-first) | `/entregador/*` | COURIER |

Stack: **React 18 + TypeScript + Vite + Tailwind CSS + Supabase (PostgreSQL, Auth, Realtime, Storage) + Leaflet/Recharts**.

---

## 2. Ambiente já provisionado

| Item | Valor |
|---|---|
| Projeto Supabase | `DLuca Connect` (`euwonmpgwwoublajfvip`) — região São Paulo |
| URL da API | `https://euwonmpgwwoublajfvip.supabase.co` |
| Chave pública (anon) | em `.env` → `VITE_SUPABASE_ANON_KEY` |
| Edge Function | `admin-users` (criação de usuários / troca de senha) |
| Buckets | `proofs` (privado), `receipts` (privado) |

### Contas criadas

| E-mail | Perfil | Senha |
|---|---|---|
| `marco.lp12@hotmail.com` | **SUPER_ADMIN** | temporária — ver item 9 |
| `despacho@dluca.com.br` | DISPATCHER | `Dluca@2026` (demonstração) |
| `financeiro@dluca.com.br` | FINANCE | `Dluca@2026` (demonstração) |
| `farmacia@alquimia.com.br` | PHARMACY_ADMIN (Farmácia Alquimia) | `Dluca@2026` (demonstração) |
| `operador@alquimia.com.br` | PHARMACY_STAFF (Farmácia Alquimia) | `Dluca@2026` (demonstração) |
| `entregador@dluca.com.br` | COURIER (Anderson Silva Prado) | `Dluca@2026` (demonstração) |

> ⚠️ As contas de demonstração fazem parte dos **dados fictícios de exemplo**. Troque ou remova antes de ir
> para produção (aba *Usuários* → desativar, ou `auth.admin.deleteUser`).

---

## 3. Como rodar localmente

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # build de produção em dist/
```

`.env`:

```
VITE_SUPABASE_URL=https://euwonmpgwwoublajfvip.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_COMPANY_WHATSAPP=55DDDNUMERO   # usado nos botões de WhatsApp do site
```

---

## 4. Arquitetura de pastas

```
src/
  components/
    ui/            → design system (Button, Field, Modal, Tabs, Alert…)
    layout/        → Logo, Protected, DashboardShell (sidebar + topbar + notificações)
    site/          → SiteLayout (site institucional) e LeadForm
    dashboard/     → blocos de pedido, timeline, mapa (Leaflet)
  contexts/        → AuthContext (sessão, perfil, papel, rota inicial)
  hooks/           → useGeolocation (GPS real, com consentimento)
  lib/             → supabase client, api (todas as consultas), utils, validation (zod), geocode
  pages/
    site/ auth/ admin/ pharmacy/ courier/
  types/           → tipos de domínio (Order, Courier, Invoice…)
supabase/
  migrations/      → 4 migrações SQL versionadas (schema, operação, financeiro, segurança)
  functions/admin-users/  → Edge Function de gestão de usuários
```

---

## 5. Banco de dados

### Tabelas principais

- **Pessoas e empresas:** `profiles`, `pharmacies`, `pharmacy_units`, `couriers`, `courier_applications`, `leads`
- **Operação:** `orders`, `order_events`, `order_assignments`, `delivery_offers`, `courier_locations`, `occurrences`, `proofs`
- **Financeiro:** `contracts`, `invoices`, `invoice_items`, `payments`, `courier_payouts`
- **Governança:** `audit_logs`, `settings`, `notifications`

### Automações no banco

| Recurso | Função |
|---|---|
| `orders.code` | gerado por trigger (`DLC-YYMM-#####`) |
| `invoices.number` | gerado por trigger (`FAT-YYYY-####`) |
| `order_events` | timeline automática em criação/mudança de status |
| `order_assignments` | registra toda troca de entregador |
| `couriers.availability` | atualizada conforme o status do pedido |
| `invoices` | subtotal/total/pago/status recalculados a cada item ou pagamento |
| `profiles` | criado automaticamente pelo trigger `on_auth_user_created` |
| `delivery_offers` | trigger `offer_response`: aceite vincula o pedido e encerra as outras ofertas; recusa devolve o pedido à fila (atômico, `SECURITY DEFINER`) |

### Segurança (RLS)

RLS **habilitado em todas as tabelas**, com helpers `app.current_role()`, `app.is_staff()`,
`app.is_admin()`, `app.is_finance()`, `app.current_pharmacy_id()`, `app.current_courier_id()`.

Regras verificadas em execução:

| Perfil | Pedidos visíveis | Farmácias visíveis | Entregadores | Faturas |
|---|---|---|---|---|
| Farmácia Alquimia | 5 (só as suas) | 1 (só a sua) | 1 (só os que atendem) | 1 (só as suas) |
| Despacho | 6 (todas) | 2 | 3 | 1 |
| Entregador | 4 (só as dele) | 0 | 1 (ele) | 0 |
| SUPER_ADMIN | 6 | 2 | 3 | 1 |

Outras proteções:
- Um usuário **não consegue escalar o próprio papel** (`profiles_update_self` valida `role` e `pharmacy_id`).
- `audit_logs` é somente leitura para administradores.
- Cadastro público (`signup`) desabilitado no Auth: usuários são criados pela administração.
- Comprovantes ficam em bucket privado; acesso apenas por **URL assinada de 10 min**.
- Leituras de `courier_locations` exigem `location_sharing_enabled = true` **e** pedido em rota.
- O entregador só consegue alterar pedidos já vinculados a ele (`courier_id = app.current_courier_id()`);
  o aceite de oferta é resolvido por trigger, não por escrita direta no pedido.

---

## 6. Funcionalidades entregues

### Site institucional
Home, serviços, soluções para farmácias, como funciona, orçamento, novas empresas, contato/WhatsApp e
cadastro de entregadores. Os três formulários gravam em `leads` / `courier_applications` (RLS de inserção pública,
leitura restrita à equipe). **Não há dados inventados sobre a empresa, clientes, certificações ou resultados.**

### Painel administrativo
- Dashboard operacional (KPIs, entregas por dia, status, fila ativa) com atualização automática.
- Cadastro de farmácias, unidades/filiais, entregadores e funcionários.
- Pedidos: listagem com filtros e detalhe completo (rota, timeline, valores, comprovantes, rastreio).
- **Central de despacho:** fila, distribuição manual e **sugestão automática** (disponibilidade + cidade/região +
  distância até a coleta, com pontuação explicada), envio de oferta ou atribuição direta, reatribuição e
  histórico de alterações.
- Mapa de entregas (Leaflet/OpenStreetMap) com coleta, destino e posições **autorizadas**.
- Histórico de entregas e de atribuições.
- Ocorrências (tipos, descrição, resolução).
- Comprovantes com abertura por URL assinada.
- Contratos comerciais (valor base, km incluído, km extra, taxas, prazo).
- Faturas: emissão, importação automática das entregas concluídas do período, pagamentos totais e **parciais**,
  status automático (aberta / parcial / paga / vencida).
- Repasses a entregadores.
- Relatórios (por dia, farmácia, status, entregador; margem e ticket médio).
- Leads e candidaturas (com aprovação que gera cadastro de entregador).
- Usuários e permissões (papel, vínculo com farmácia ou entregador, ativação, senha temporária).
- Auditoria de atividades e configurações gerais.

### Portal da farmácia
Pedido com unidade de origem, coleta, destinatário/telefone, volumes, prioridade, agendamento, marcação de
item sensível à temperatura e exigência de comprovante; cálculo de valor pelo contrato; geocodificação opcional
(Nominatim) para o mapa. Acompanhamento de status, histórico, comprovantes, faturas com saldo e pagamentos,
gestão de unidades e funcionários conforme permissão. **Uma farmácia nunca vê dados de outra** (RLS).

### Área do entregador (mobile-first)
Aplicativo em verde-escuro, no modelo do aplicativo original da operação, com cinco abas embaixo:

- **Hoje** (`/entregador`): saudação, disponibilidade, busca por protocolo, endereço ou farmácia, roteiros do dia,
  conferência de pacotes e entregas avulsas em andamento.
- **Mapa** (`/entregador/mapa`): paradas e entregas no mapa, por período (Hoje, Amanhã, 7 dias, Todas), com
  atalho para Waze e Google Maps.
- **Próximas** (`/entregador/proximas`): o que já está programado para os próximos dias.
- **Disponíveis** (`/entregador/disponiveis`): retiradas lançadas pela central para o entregador, em tempo real
  (Supabase Realtime), com aceite e recusa.
- **Perfil** (`/entregador/perfil`): dados cadastrais, disponibilidade, telefone, histórico de entregas, troca de
  senha e saída.

A tela de entrega mantém as etapas (iniciar deslocamento → confirmar coleta → iniciar rota → confirmar entrega),
ocorrências e envio de comprovante.

**O aplicativo do entregador não mostra valores.** Os entregadores têm salário fixo: não há preço de entrega,
repasse nem histórico financeiro em nenhuma tela, e as consultas do aplicativo não pedem essas colunas ao
servidor (`COURIER_ORDER_COLUMNS` em `src/lib/api.ts`). Os testes `src/pages/courier/no-values.test.ts` e
`src/lib/courier-api.test.ts` falham se um valor voltar a aparecer.

### GPS — regra de honestidade de dados
- O switch de localização é **opt-in por entrega** e o pedido de permissão é feito ao navegador (`watchPosition`).
- Sem permissão, nada é gravado e a interface mostra explicitamente "sem compartilhamento".
- Posições acima de 3 minutos são rotuladas como **"última posição conhecida"**, nunca "tempo real".
- **A plataforma não gera, interpola ou simula coordenadas.**

### Distribuição por CEP e micro-rotas
Operação por lote diário, separada dos pedidos sob demanda. Referência completa em
`PROMPT-MESTRE-MICRO-ROTAS.md`.

- **Cobertura** (`/app/cobertura`): regiões, faixas de CEP com responsável, teste de CEP,
  limite diário por funcionário, por veículo e geral, e parâmetros dos roteiros.
- **Lote do dia** (`/app/distribuicao`): importação do romaneio (CSV ou colagem) com
  prévia e erros por linha, distribuição automática por CEP, exceções com motivo,
  atribuição manual, retenção e cancelamento, carga por funcionário e conflitos.
- **Roteiros** (por funcionário): geração automática em roteiros curtos, ajuste manual,
  liberação, recolhimento, transferência total ou parcial e reordenação.
- **Aplicativo do entregador** (aba Hoje, `/entregador`): conferência de saída e retorno por
  leitura de etiqueta, navegação por Waze ou Google Maps, baixa por pacote com foto,
  tentativa sem sucesso com motivo. Funciona sem internet e envia depois.
- **Rastro**: histórico de responsáveis, tentativas, leituras e eventos por pacote.

---

## 7. Distribuição híbrida (implementada em `src/lib/api.ts → suggestCouriers`)

| Critério | Peso |
|---|---|
| Disponível agora | +40 (offline +10) |
| Mesma cidade da coleta | +20 |
| Atua no bairro (zona) | +10 |
| Distância até a coleta | até +30 (`30 − km`) |

O despachante vê a pontuação, os motivos e a distância, e decide. Toda alteração gera `order_assignments`
e `order_events`.

---

## 8. Financeiro (manual, sem gateway)

- Valores por entrega vindos do contrato ativo da farmácia (base + km excedente + taxas de urgência/refrigeração).
- Fatura por período com importação das entregas ainda não faturadas (índice único impede duplicidade).
- Pagamentos parciais: `paid_cents` e status recalculados por trigger no banco.
- Repasses por entregador com status próprio.
- **Nenhuma integração com gateway de pagamento**, conforme solicitado.

---

## 9. Administrador inicial (SUPER_ADMIN)

- E-mail: `marco.lp12@hotmail.com`
- Perfil: **SUPER_ADMIN**, ativo.
- Senha temporária: **`Dlc-p6xldi#RM7K!24`** — gerada aleatoriamente, entregue por este canal e com
  `must_change_password = true`: a plataforma **exige a troca no primeiro login** antes de qualquer outra ação.

> Recomendo trocar a senha imediatamente após o primeiro acesso e não reutilizá-la. Para redefinir depois,
> use o Painel do Supabase (Authentication → Users) ou o botão *Gerenciar → Nova senha* na aba Usuários.

---

## 10. Fluxo validado de ponta a ponta

Testado com sessões autenticadas reais, contra o banco de produção:

| Verificação | Resultado |
|---|---|
| Login dos 6 perfis (super admin, despacho, financeiro, gestor e operador de farmácia, entregador) | ✅ todos autenticam |
| Isolamento por farmácia (pedidos, farmácias, faturas) | ✅ farmácia vê 6 pedidos, 1 farmácia, 1 fatura |
| Farmacêutico cria pedido na própria unidade | ✅ `201` |
| Farmacêutico tenta criar pedido em farmácia alheia | ✅ bloqueado (`403`) |
| Farmacêutico tenta ler pedidos de outra farmácia | ✅ 0 linhas |
| Farmacêutico tenta se promover a `SUPER_ADMIN` | ✅ bloqueado (`403`), papel inalterado |
| Entregador tenta ler faturas / leads | ✅ 0 linhas em ambas |
| Entregador tenta gravar GPS de outro entregador | ✅ bloqueado |
| Entregador aceita oferta → coleta → rota → entrega | ✅ `ACCEPTED → PICKING_UP → COLLECTED → IN_TRANSIT → DELIVERED` |
| Formulário público de orçamento e de candidatura (visitante anônimo) | ✅ `201` nos dois |
| Visitante anônimo tenta ler farmácias, pedidos, leads | ✅ 0 linhas |

## 11. Deploy no Vercel

**Endereço publicado:** https://dluca-connect.vercel.app

Projeto `dluca-connect` (team `bloco3-jaccob`), framework **Vite**, build `npm run build`, saída `dist`.
Deploy conectado ao repositório GitHub `marcos167/DLucas`: cada push na branch publica uma nova versão.

1. O `vercel.json` já configura o SPA fallback e os cabeçalhos de segurança
   (`X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` com geolocalização e câmera liberadas só para o próprio domínio).
2. Variáveis de ambiente configuradas em produção, preview e desenvolvimento:
   `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
3. No Supabase → Authentication → **URL Configuration**:
   - Site URL: `https://dluca-connect.vercel.app`
   - Redirect URLs: `https://dluca-connect.vercel.app/**` e `http://localhost:5173/**`
4. O domínio não tem proteção de SSO — o link abre direto para qualquer pessoa com a URL.

### Atenção: usuários criados por SQL direto

Se você criar usuários com `INSERT` em `auth.users` em vez de usar a Edge Function `admin-users`
ou o painel do Supabase, **preencha as colunas de token com string vazia**. Caso contrário o login
devolve HTTP 500 `Database error querying schema` (o GoTrue lê essas colunas como `string` e não
aceita `NULL`). A migration `20261115000600_auth_users_fix.sql` corrige esse estado de forma idempotente.

---

## 12. Limitações conhecidas desta primeira versão

- Exportação de faturas/relatórios em PDF **não** foi implementada (apenas visualização em tela).
- Criação de usuários depende da Edge Function `admin-users` (já publicada); se ela falhar, use o Painel do Supabase.
- A geocodificação usa o Nominatim público (limite de uso); sem resultado, o pedido é criado sem coordenadas e
  por isso não aparece no mapa — o comportamento é informado na tela.
- Notificações por e-mail/SMS não foram configuradas (o painel usa notificações internas + Realtime).
- Não há app nativo: a área do entregador é web. Desde o módulo de micro-rotas ela tem service worker
  (casca offline) e fila de envio no aparelho; as telas antigas de pedidos sob demanda continuam exigindo internet.
- Módulo de micro-rotas: sem PostGIS (distância calculada no navegador), sem tempo real (consulta periódica) e
  leitura por câmera só onde o navegador tem leitor de código de barras. Detalhes na seção 10 de
  `PROMPT-MESTRE-MICRO-ROTAS.md`.
