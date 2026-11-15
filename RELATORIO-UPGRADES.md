# Relatório de upgrades — DLucas Express

Registro do que foi evoluído, por que e o que falta. Escrito para ser lido
tanto por quem vai manter o código quanto por quem toma decisão de negócio.

**Última atualização:** novembro de 2026

---

## Resumo executivo

A plataforma saiu de "funciona na demonstração" para "tem rede de proteção".
As três mudanças que mais importam:

1. **Nenhuma credencial vai mais para o bundle publicado.** Uma senha de
   super administrador estava compilada no JavaScript servido ao navegador.
2. **Falhas deixam de ser silenciosas.** Antes, 14 de 25 operações não
   tratavam erro: o usuário clicava e nada acontecia.
3. **Existe verificação automática.** 57 testes e um CI que roda lint, tipos,
   testes, build e varredura de segredos em cada pull request.

| Indicador | Antes | Agora |
|---|---|---|
| Testes automatizados | 0 | **57** |
| CI no GitHub Actions | não existia | lint + tipos + testes + build + segredos |
| Credenciais no bundle | 1 (senha de super admin) | **0** |
| Mutations sem tratamento de erro | 14 de 25 | **0** |
| Bundle principal (gzip) | 175 kB | **69 kB** |
| Recuperação de senha | inexistente | telas + fluxo completo |
| Rota 404 | redirecionava para a home | página própria |

---

## 1. Exposição de credencial no bundle *(crítico — resolvido)*

### O que acontecia

`src/pages/auth/Login.tsx` tinha um bloco "Acesso rápido (demonstração)" com as
contas de teste. Entre elas, a conta real de super administrador:

```ts
{ email: 'marco.lp12@hotmail.com', password: 'Dlc-...', label: 'Super admin' }
```

O Vite compila esse valor para dentro do JavaScript. Qualquer pessoa podia
abrir o DevTools, buscar pelo texto e obter a credencial de maior privilégio
da plataforma — sem autenticação, sem log, sem rastro. Essa conta tem acesso a
dados de todas as farmácias, financeiro e criação de usuários.

### O que foi feito

- A senha foi **removida do código**.
- O bloco passou a ser condicional: só renderiza quando `VITE_DEMO_LOGINS=1`.
  Em produção a variável não é configurada, então **o bloco não existe no HTML
  nem no bundle**.
- As 4 contas fictícias restantes continuam disponíveis para demonstração,
  habilitadas por variável de ambiente.
- O CI agora **falha o build** se encontrar padrão de credencial no artefato.

### Como apresentar ao cliente

Defina `VITE_DEMO_LOGINS=1` no ambiente de *preview* da Vercel (não em
produção) ou no `.env` local. O bloco volta a aparecer com as contas fictícias.

### Pendência sua

A senha do super administrador foi trocada por você — a exposição está
neutralizada. Vale confirmar que a nova senha não é reutilizada em outro
serviço.

---

## 2. Testes automatizados *(novo)*

Antes existia apenas `typecheck` e build. Uma mudança de peso no cálculo de
despacho, ou numa regra de validação, passaria sem aviso até alguém notar em
produção.

**Stack:** Vitest + Testing Library, com cobertura em `src/lib` e `src/hooks`.

| Arquivo | Testes | O que protege |
|---|---|---|
| `src/lib/dispatch.test.ts` | 11 | O ranking de entregadores: pesos, filtros, ordenação e motivos |
| `src/lib/validation.test.ts` | 21 | Todos os formulários (pedido, orçamento, candidatura, contrato, senhas) |
| `src/lib/utils.test.ts` | 16 | Formatação de dinheiro/data, máscaras, distância, frescor de GPS |
| `src/hooks/useApiMutation.test.ts` | 9 | Tradução de erro técnico do banco para português |

### Por que esses e não outros

Os testes cobrem **regra de negócio**, não pixel. Um teste que verifica se um
botão é azul quebra a cada ajuste de design e não protege nada. Já o teste que
verifica que "disponível agora vale +40" protege o critério que o despachante
usa para decidir — e que está escrito no deck de apresentação ao cliente.

### Exemplos do que os testes fixam

- Entregador em rota nunca aparece na sugestão.
- A pontuação de distância tem piso em zero (não fica negativa).
- A distância é simétrica: A→B é igual a B→A.
- Posição com mais de 3 minutos é "última conhecida", nunca "agora".
- `violates row-level security policy` vira "Ação não permitida para o seu perfil".
- Senha nova exige 8 caracteres e confirmação idêntica.

### Comandos

```bash
npm run test          # modo watch
npm run test:run      # uma execução (usado no CI)
npm run test:coverage # relatório de cobertura em HTML
```

---

## 3. CI no GitHub Actions *(novo)*

`.github/workflows/ci.yml` roda em todo push na `main` e em todo pull request:

1. `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run test:run`
5. `npm run build`
6. **Varredura de segredos no bundle** — o passo que teria pego o problema do item 1

Push novo na mesma branch cancela a execução anterior (economiza minutos).

---

## 4. Tratamento de erros *(entregue no ciclo anterior)*

Das 25 chamadas `useMutation`, 14 não tratavam falha. Em `Dispatch.tsx` — tela
onde o despachante envia ofertas — a operação falhava em silêncio absoluto.

| Peça | Papel |
|---|---|
| `components/ui/Toast.tsx` | Notificação flutuante, com `aria-live` e limite de 4 na tela |
| `hooks/useApiMutation.ts` | Toast automático de erro e sucesso |
| `errorMessage()` | Traduz erro técnico do Supabase para português |
| `layout/ErrorBoundary.tsx` | Erro de render mostra tela explicativa, não página branca |

---

## 5. Recuperação de senha *(entregue no ciclo anterior)*

`/recuperar-senha` e `/nova-senha`, com link no login. Confirma o envio mesmo
quando o e-mail não existe, para não revelar quais endereços têm conta.

**Pendência de infraestrutura:** o envio usa o SMTP padrão do Supabase, com
cota baixa no plano gratuito. Para uso real é preciso configurar um provedor
(Resend, SendGrid ou Amazon SES) em *Authentication → SMTP*. O código está
pronto; falta apenas o provedor.

---

## 6. Desempenho *(entregue no ciclo anterior)*

`React.lazy` nas rotas internas e chunks separados para Leaflet, Recharts e
Supabase.

| Chunk | Tamanho | Quando carrega |
|---|---|---|
| Principal | 250 kB (69 kB gzip) | sempre |
| Gráficos | 577 kB | só dashboard e relatórios |
| Supabase | 229 kB | sempre |
| Mapa | 155 kB | só `/app/mapa` |

O site institucional deixou de baixar o mapa e os gráficos do sistema.

---

## O que ainda falta

Em ordem de retorno sobre esforço.

### Curto prazo

| Item | Por quê | Esforço |
|---|---|---|
| SMTP próprio | recuperação de senha não funciona de verdade sem isso | baixo (só configuração) |
| Tirar o `.env` do repositório | a `anon key` é pública, mas é boa prática mover para variáveis da Vercel | baixo |
| Testar a RLS com testes de integração | as 54 policies são a defesa central e não têm teste automatizado | médio |
| Branch protection na `main` | exigir CI verde antes de mergear | baixo (só configuração) |

### Médio prazo

| Item | Por quê |
|---|---|
| Exportação em PDF de faturas e relatórios | pedido pelo cliente final, hoje só visualização em tela |
| Notificações por e-mail/SMS | hoje o aviso é só dentro da plataforma |
| Paginação real | `api.ts` usa `.limit(200)`; com volume alto, a tela trunca em silêncio |
| PWA com service worker | a área do entregador funciona no navegador, mas não offline |

### Longo prazo

| Item | Depende de |
|---|---|
| App nativo do entregador | escopo e orçamento |
| Integração com gateway de pagamento | definição comercial |
| Domínio próprio | registro do domínio pela DLucas Express |

---

## Como rodar as verificações

```bash
npm ci
npm run lint
npm run typecheck
npm run test:run
npm run build
```

Tudo deve terminar sem saída nos dois primeiros e com "57 passed" nos testes.
O CI executa exatamente esta sequência.
