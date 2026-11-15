# Prompt mestre — Micro-rotas por funcionário com distribuição por CEP

Este é o documento de referência do módulo de distribuição da DLucas Express. Ele reúne
as regras de negócio, o modelo de dados, o contrato das funções e os critérios de teste.
Qualquer evolução do módulo — feita por uma pessoa ou por um agente de IA — deve partir
daqui e manter este arquivo verdadeiro.

> **Como usar com um agente:** entregue este arquivo inteiro como contexto e peça a
> mudança. As seções 2 (regras) e 9 (critérios de teste) são contrato: uma alteração só
> está pronta quando os testes que as cobrem continuam passando ou foram atualizados na
> mesma entrega, junto com este documento.

---

## 1. O problema

Todo dia a central recebe um lote de pacotes (romaneio) que precisa sair para a rua.
Cada funcionário atende uma região definida por faixas de CEP. O sistema precisa:

1. decidir **quem** leva cada pacote, pelo CEP;
2. dividir o dia de cada funcionário em **roteiros pequenos** e ordenados;
3. deixar o funcionário **executar** os roteiros pelo celular, inclusive sem internet;
4. dar à supervisão o **controle**: exceções, transferências, conferência e rastro.

Volume de referência: 49 pacotes por funcionário por dia, que viram 20 ou mais roteiros
de 2 paradas. Esses números são parâmetros, não regras fixas.

"Funcionário" é o cadastro de entregador que já existia (`public.couriers`): mesma
identidade, mesmo login, mesmas permissões do restante da plataforma.

## 2. Regras de negócio

**Distribuição**

- R1. O responsável por um pacote é decidido pelo CEP. Para cada CEP vale a **faixa mais
  específica**; em faixas do mesmo tamanho, a de **maior prioridade**. O responsável da
  faixa, quando definido, substitui o da região.
- R2. O banco nunca adivinha. Pacote que não pode ser distribuído vira **exceção** com
  motivo: CEP inválido, CEP sem cobertura, região sem responsável, responsável
  indisponível, acima do limite diário ou retido pela supervisão.
- R3. Distribuir de novo reprocessa as exceções automáticas (corrigiu a cobertura,
  distribuiu, resolveu). O que a supervisão **reteve** não é tocado.
- R4. O limite diário é um parâmetro com precedência: **funcionário → veículo → lote →
  padrão geral (49)**. A distribuição automática respeita o limite; a atribuição manual
  pode ultrapassá-lo e o excesso fica visível. O limite de cada funcionário só é alterado
  pela equipe de distribuição (o banco recusa a alteração feita por outro perfil).
- R5. Um pacote tem **um único responsável atual**. Toda troca fica no histórico, com
  quem fez, quando e por quê.
- R6. Uma etiqueta existe uma única vez na operação. Reimportar não duplica: os códigos
  repetidos são devolvidos. Cancelar um pacote libera o código.

**Roteiros**

- R7. Pacotes do **mesmo endereço** (CEP + logradouro + número) formam **uma parada**,
  com um código por pacote. O complemento não separa paradas: dois apartamentos do mesmo
  prédio são uma parada só.
- R8. Um pacote está em **no máximo um roteiro ativo**; um endereço aparece **uma vez**
  em cada roteiro.
- R9. O dia do funcionário é um trajeto único cortado em roteiros numerados: o Roteiro 02
  começa onde o Roteiro 01 terminou. Tamanho do roteiro (paradas, pacotes, trecho máximo)
  é parâmetro.
- R10. Roteiro nasce **rascunho**, invisível para o funcionário. A supervisão ajusta à
  mão e **libera**. Gerar de novo substitui só os rascunhos.
- R11. A ordem pode ser alterada depois (pela central ou pelo próprio funcionário), mas
  só nas paradas pendentes, e a **ordem planejada original fica registrada**.
- R12. Transferência: roteiro não iniciado muda de dono por inteiro; roteiro em andamento
  cede **só o que falta**, em um roteiro novo. O que já foi feito fica com quem fez.

**Execução em campo**

- R13. Nada sai da central sem **conferência de saída** (leitura de cada etiqueta), e só
  de roteiro liberado. No retorno, tudo que saiu precisa ter sido entregue, devolvido ou
  transferido para a conferência fechar. Só a central fecha com divergência, e ela fica
  anotada e auditada.
- R14. Cada pacote recebe baixa individual: **entregue** (quem recebeu, foto opcional) ou
  **não entregue** (motivo obrigatório, vira ocorrência). A parada e o roteiro mudam de
  situação sozinhos. O não entregue volta para a central na conferência de retorno
  (**devolvido**) e pode ser **reprogramado** pela supervisão: atribuído de novo, volta a
  aguardar roteiro, com as tentativas anteriores preservadas.
- R15. O aplicativo funciona **sem internet**. Todo registro é gravado primeiro no
  aparelho e enviado depois, em ordem. Reenviar não duplica.
- R16. Registro que chega depois de a situação mudar (roteiro transferido, pacote já
  baixado) **não é aplicado nem descartado**: fica guardado como conflito e a supervisão
  decide.

**Acesso**

- R17. O funcionário vê apenas os próprios pacotes e roteiros liberados. **Nenhuma tabela
  do módulo tem valor financeiro.**
- R18. Situação, responsável e baixa só mudam por função transacional do banco. Nem a
  equipe escreve nessas colunas diretamente.
- R19. Toda ação operacional deixa rastro (auditoria e histórico do roteiro).

## 3. Modelo de dados

Migração: `supabase/migrations/20261115150000_logistics_micro_routes_010.sql` (aditiva).
Aplicada em produção em 15/11/2026 e registrada no histórico com a versão
`20261115150000`. O arquivo não muda mais (`npm run test:migrations` confere);
qualquer ajuste de banco entra em uma migração nova.

| Tabela | O que guarda |
|---|---|
| `postal_code_regions` | Região de atendimento e responsável padrão |
| `postal_code_assignments` | Faixa de CEP (`zip_start..zip_end`, inteiros), prioridade e responsável próprio opcional |
| `distribution_batches` | Lote do dia (`LT-AAMMDD-NNNN`), situação e limite próprio opcional |
| `packages` | Um pacote por etiqueta; `address_key` é coluna gerada (CEP + logradouro + número) |
| `package_assignments` | Histórico de responsáveis; índice único garante um responsável atual |
| `delivery_routes` | Roteiro numerado do funcionário no lote |
| `route_stops` | Parada (um endereço); `sequence` é a ordem atual, `planned_sequence` a original |
| `route_packages` | Pacote ↔ parada; índice único garante um roteiro ativo por pacote |
| `route_events` | Histórico operacional do roteiro e do pacote |
| `route_optimization_logs` | O que o organizador fez: algoritmo, provedor, parâmetros, plano anterior e novo |
| `loading_manifests` | Conferência de saída e retorno (uma viagem) |
| `package_scans` | Leituras de etiqueta (saída, devolução, transferência, consulta) |
| `delivery_attempts` | Entregas e tentativas; `sync_status` = APPLIED, CONFLICT ou DISCARDED |
| `delivery_proofs` | Comprovantes de uma tentativa (arquivo no bucket privado `proofs`) |
| `manifest_items` (view) | O que saiu em cada conferência e que fim levou |

Também: `couriers.daily_package_limit`, `occurrences.package_id`/`route_id` e a chave
`distribution` em `settings`.

**Situações**

- Pacote: `RECEIVED → ASSIGNED → ROUTED → LOADED → DELIVERED`, com `EXCEPTION`,
  `FAILED`, `RETURNED` e `CANCELLED`.
- Roteiro: `DRAFT → RELEASED → IN_PROGRESS → COMPLETED`, ou `CANCELLED`.
- Parada: `PENDING`, `COMPLETED`, `PARTIAL`, `FAILED` (calculada a partir dos pacotes).
- Conferência: `OPEN → DEPARTED → CLOSED`.

## 4. Permissões

| Perfil | Pode |
|---|---|
| Administrador | Tudo, inclusive os parâmetros gerais |
| Despacho | Operar lotes, cobertura, roteiros, exceções e conflitos; limite por funcionário |
| Financeiro | Só consultar |
| Entregador | Ler e executar o que é dele (roteiros liberados), pelas funções de campo |
| Farmácia e visitante | Nada |

A regra vale no banco (RLS, privilégios e verificação dentro de cada função), não só na
tela. Tabelas e funções novas nascem liberadas no Supabase; a migração fecha isso
explicitamente.

## 5. Funções do banco (API)

Todas em `public`, chamadas por `supabase.rpc`, com wrappers em `src/lib/logistics/api.ts`.

- **Distribuição:** `resolve_postal_code`, `import_packages`, `distribute_batch`,
  `assign_packages`, `hold_packages`, `cancel_packages`
- **Roteiros:** `save_route_plan`, `set_routes_status`, `transfer_route`,
  `reorder_route_stops`
- **Campo:** `rider_day`, `start_route`, `register_delivery_attempt`,
  `add_delivery_proof`, `open_manifest`, `register_package_scan`, `depart_manifest`,
  `close_manifest`, `logistics_client_config`
- **Supervisão:** `batch_overview`, `list_packages`, `courier_plan`, `package_detail`,
  `list_attempt_conflicts`, `resolve_attempt_conflict`

### Contrato de sincronização

As funções de campo recebem um identificador gerado no aparelho e respondem, em vez de
falhar:

| Resposta | Significado | O aplicativo |
|---|---|---|
| `APPLIED` | Registro aceito | Tira da fila |
| `DUPLICATE` | O servidor já tinha este registro | Tira da fila |
| `CONFLICT` | Não combina com a situação atual | Mostra ao funcionário; a central decide |
| erro de rede | Servidor inacessível | Tenta de novo depois, na mesma ordem |
| recusa do banco | Dado inválido ou sem permissão | Falha visível, reenviável |

Ordem das travas nas funções de campo: **roteiro, depois pacote** — a mesma da
transferência. Isso evita travamento mútuo entre a baixa do funcionário e a ação da
central (testado com duas conexões reais em PostgreSQL 17).

## 6. Organizador de roteiros

`src/lib/logistics/organizer.ts`, funções puras:

1. `buildStops` — junta os pacotes de cada endereço em uma parada;
2. `orderStops` — encadeia as paradas em um trajeto (vizinho mais próximo, depois 2-opt
   e realocação);
3. `splitIntoRoutes` — corta o trajeto pelos limites de paradas, pacotes e trecho máximo.

Distâncias vêm de um `MatrixProvider` (`matrix.ts`). O padrão é o cálculo local em linha
reta com fator de correção; um serviço externo no formato OSRM pode ser ligado por
`VITE_ROUTING_MATRIX_URL`, com queda automática para o cálculo local se ele falhar.
Parada sem coordenada entra ao lado da de CEP mais próximo, sem distância inventada.

## 7. Aplicativo do funcionário

- `src/pages/courier/RiderRoutes.tsx` — roteiros do dia, progresso e envio pendente
- `src/pages/courier/RiderCheck.tsx` — conferência de saída e de retorno (câmera, leitor
  ou digitação)
- `src/pages/courier/RiderRoute.tsx` — paradas, navegação (Waze/Google Maps), baixa com
  foto, reordenação
- `src/pages/courier/rider/RiderContext.tsx` — estado do dia: cópia do servidor + fila
- `src/lib/logistics/offline/` — fila (`queue.ts`), envio (`runner.ts`) e armazenamento
  no aparelho (`store.ts`, IndexedDB)
- `public/sw.js` — casca offline (só `index.html` e `/assets/`; nenhum dado passa por ele)

## 8. Painel da central

- `/app/distribuicao` — lote, importação com prévia, distribuição, carga por
  funcionário, pacotes, exceções e conflitos
- `/app/distribuicao/:lote/funcionario/:id` — gerar, ajustar, liberar, recolher,
  transferir e reordenar roteiros; conferências
- `/app/cobertura` — regiões, faixas de CEP, teste de CEP, limites e parâmetros

## 9. Critérios de teste

Cada regra tem teste automatizado. Para mudar uma regra, mude o teste junto.

| Critério | Onde |
|---|---|
| Faixa mais específica vence; prioridade desempata; faixa desativada não conta (R1) | `backend.test.ts` |
| Exceções por motivo; redistribuir resolve; retido não é tocado (R2, R3) | `backend.test.ts` |
| Precedência do limite; 50º pacote vira exceção; manual pode exceder (R4) | `backend.test.ts` |
| Um responsável atual, com histórico (R5) | `backend.test.ts`, `test-postgres17.mjs` |
| Reimportação não duplica; cancelar libera o código (R6) | `backend.test.ts`, `import.test.ts` |
| Mesmo endereço = uma parada; chave idêntica na tela e no banco (R7) | `cep.test.ts`, `backend.test.ts` |
| Um roteiro ativo por pacote; plano inválido é recusado por inteiro (R8) | `backend.test.ts` |
| 49 pacotes viram 20+ roteiros, sem perder nem repetir pacote (R9) | `organizer.test.ts`, `backend.test.ts` |
| Rascunho invisível; regenerar não mexe no liberado (R10) | `backend.test.ts` |
| Reordenar só pendentes; planejado preservado (R11) | `backend.test.ts` |
| Transferência total e parcial (R12) | `backend.test.ts` |
| Conferência de saída e retorno; fechamento com divergência só pela central (R13) | `backend.test.ts` |
| Baixa individual; motivo obrigatório; ocorrência gerada (R14) | `backend.test.ts` |
| Sem internet: grava, mostra, envia em ordem, não duplica (R15) | `queue.test.ts`, `backend.test.ts` |
| Conflito guardado e decidido pela supervisão (R16) | `backend.test.ts` |
| Entregador só vê o que é dele; sem valor financeiro; visitante sem acesso (R17) | `backend.test.ts`, `test-postgres17.mjs` |
| Escrita direta recusada (R18) | `backend.test.ts` |
| Auditoria das ações (R19) | `backend.test.ts` |
| Envio simultâneo do mesmo registro; baixa × transferência sem travamento | `test-postgres17.mjs` |

Como rodar:

```bash
npm run test:run        # regras, organizador, fila e banco em memória (PGlite)
npm run test:postgres   # PostgreSQL 17 real, duas conexões, disputas
npm run test:migrations # confere o SQL com o que está em produção
```

`backend.test.ts` usa o cliente Supabase de verdade contra um PostgreSQL em memória com
as migrações reais (`src/test/supabase-emulator.ts`). Nenhum teste toca em produção.

Para experimentar no navegador com dados fictícios:

```bash
LOCAL_BACKEND_PASSWORD=escolha-uma npm run local:api
VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=local npm run dev
```

## 10. Decisões e limites conhecidos

- **Sem PostGIS.** As posições são colunas de latitude e longitude e a distância é
  calculada no navegador. Para o volume atual (dezenas de paradas por funcionário) isso
  basta; consultas espaciais no banco exigiriam a extensão.
- **Sem tempo real.** As telas atualizam por consulta periódica (20 a 45 segundos), como
  o restante do painel.
- **Leitura pela câmera** depende do leitor de código de barras do navegador
  (Chrome/Android). Onde não existe, o funcionário digita o código ou usa um leitor.
- **Sem internet não dá para abrir nem fechar a conferência**, só para ler etiquetas,
  registrar a saída e dar baixa.
- **A exigência de conferência de saída é aplicada pelo aplicativo.** O banco aceita a
  baixa de um pacote não conferido e a destaca no painel ("entregue sem conferência").
- **Endereços sem coordenada** entram no roteiro pelo CEP. A central pode localizá-los
  sob demanda (serviço público do OpenStreetMap, uma consulta por segundo).
- **Pacote não muda de lote.** Um pacote devolvido pode ser reprogramado no mesmo lote
  (atribuir de novo o devolve à fila de roteiros); para levá-lo ao lote de outro dia,
  cancele e importe de novo.
- **As telas antigas do entregador** (pedidos sob demanda) continuam mostrando o valor do
  repasse. O módulo novo não tem dado financeiro.
