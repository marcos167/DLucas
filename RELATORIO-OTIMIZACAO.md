# Revisão e otimização — 15/11/2026

## Escopo e verificação

Revisão do repositório com foco nos fluxos de pedidos, despacho, localização, faturamento, indicadores, autenticação, políticas SQL, dependências e build. Foram examinados os principais caminhos de execução e a suíte automatizada; isto **não equivale a uma auditoria manual de cada linha nem a uma homologação autenticada em produção**.

Nesta branch, sem alterar dados de produção ou reaplicar migrações:

- O pedido novo só utiliza coordenadas de destino quando o endereço atual corresponde ao endereço geocodificado. Edições posteriores anulam a estimativa anterior e avisam que é preciso localizar novamente. Consultas em andamento cujo endereço mudou são descartadas. A origem usa as coordenadas da unidade quando cadastradas.
- A seleção de pedidos faturáveis pagina pedidos e consulta os itens somente dos pedidos candidatos, em lotes menores; erros de consulta interrompem a operação em vez de tratar pedidos já faturados como novos.
- Consultas de indicadores financeiros, status e entregas passam a percorrer as páginas da API, evitando contagens truncadas. Erros passam a aparecer no painel em vez de serem confundidos com zero/ausência de pedidos.
- A consulta de última localização, quando chamada, deixa de aplicar um limite global antes da deduplicação por entregador. Erros nas atualizações secundárias de localização e despacho não são mais ignorados.
- Testes de regressão cobrem endereço/estimativa na interface, faturamento com mais de 500 pedidos, falha na busca de itens, contagens paginadas e posição por entregador.

Verificações: `npm run lint`, `npm run typecheck`, `npm run test:run` (82 testes), `npm run test:migrations`, `npm run test:postgres` (cluster PG17 isolado) e `npm run build` passaram. Nenhuma dessas verificações escreveu na base remota.

## Pontos ainda pendentes

1. `npm audit --omit=dev` reporta 3 alertas de produção: `zod` (1 alto, exaustão de memória em coleções grandes com restrições), `react-router` e `react-router-dom` (2 moderados). As correções propostas exigem major (`zod` 4.6.7 e React Router 7.18.5), que requerem migração/testes de compatibilidade; **não foram aplicadas automaticamente**.
2. Envio de ofertas e atribuição direta ainda fazem múltiplas chamadas HTTP em vez de uma transação no banco. Erros agora são expostos, mas a atomicidade completa exige uma RPC/migração planejada e ensaio concorrente antes de aplicar em produção.
3. Relatórios paginados podem demandar muitas solicitações quando o volume crescer. Para grandes bases, agregações SQL/RPC com controles de autorização são a próxima etapa de desempenho.
4. A função de última localização faz uma leitura por entregador; não é chamada pelas telas atuais. Uma consulta SQL com `DISTINCT ON`/RPC poderia substituir as leituras se esse recurso passar a ser usado em escala.
5. `AuthContext` ainda merece teste específico de respostas assíncronas de sessões concorrentes: uma consulta antiga de perfil pode terminar após uma troca de sessão. Não alteramos esse fluxo sensível sem um teste de regressão de autenticação.
6. A autenticação HTTP real com conta de teste separada, sem usar `marco.lp12@hotmail.com`, ainda não foi homologada. O baseline 001–006 permanece não reconciliado com o histórico remoto: **não executar `db push`**.

As otimizações desta branch não foram implantadas no Vercel ou na Supabase. O deploy anterior continua no SHA `37e7dca`.
