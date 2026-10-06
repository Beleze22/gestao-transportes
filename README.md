# Rohan Transportes — gestão de viagens e despesas

Sistema de controle financeiro de duas transportadoras, **Rohan** e **TransBeleze**, operadas
pela mesma pessoa. Registra viagens (cliente, motorista, caminhão, frete, pagamento ao
motorista, locais de carga e descarga) e despesas por categoria, e apura faturamento, custo e
lucro por período.

O lançamento acontece por dois caminhos: um **app web** e uma **conversa no Telegram** com um
agente de IA que entende mensagens em linguagem natural, inclusive áudio.

---

## As três peças

```
   navegador                    Telegram
       │                            │
       │ chave publishable          │ webhook
       │ (vai no bundle)            ▼
       │                   ┌──────────────────┐
       │                   │  agent/  Node 22 │  ← Railway
       │                   │  Express + cron  │
       │                   └────────┬─────────┘
       ▼                            │ chave secreta
┌──────────────┐                    │ (ignora RLS)
│   src/       │                    │
│  React+Vite  │ ← Netlify          │
└──────┬───────┘                    │
       │                            │
       └──────────► Supabase ◄──────┘
                  Postgres + PostgREST
```

| Onde | O quê |
|---|---|
| **Netlify** | App React em `src/`, publicado em `beleze-transportes.netlify.app` |
| **Railway** | Agente do Telegram em `agent/`, container Node 22 (serviço `transporte-agent`) |
| **Supabase** | Postgres — o único lugar onde existe estado |

**Não há backend entre o navegador e o banco.** O app web chama o PostgREST direto, do
navegador, com a chave publishable. É por isso que a segurança depende inteiramente do login do
Supabase Auth mais as policies de RLS — veja [Acesso aos dados](#acesso-aos-dados).

---

## Rodando local

### App web

```bash
npm install
cp .env.example .env.local   # preencha com as credenciais reais
npm run dev                  # http://localhost:5173
```

Entrar exige um usuário criado em **Authentication > Users** no painel do Supabase, mesmo
rodando local: o app aponta para o banco de produção e não há cadastro pela tela.

O arquivo **precisa começar com ponto**: o Vite carrega `.env.local`, e ignora `env.local`.
Só variáveis com prefixo `VITE_` chegam ao app — e elas são **embutidas no bundle em tempo de
build**, ou seja, ficam visíveis para quem abrir o site. Nunca coloque `VITE_` numa chave
secreta.

### Agente do Telegram

```bash
cd agent
npm install
cp .env.example .env         # preencha com as credenciais reais
npm start                    # ou npm run dev, com --watch
npm test                     # 42 casos, sem dependência externa
```

O agente precisa da **chave secreta** do Supabase (`sb_secret_…`, antiga `service_role`), que
ignora RLS. Sem ela a tabela `conversas` responde lista vazia — sem erro, o que engana.

---

## Publicação

Push na branch `stable` dispara os dois deploys:

- **Railway** reconstrói `agent/` pelo `agent/Dockerfile` e registra o deploy no GitHub como
  `transporte-agent / production`.
- **Netlify** roda o build do Vite e publica `dist/`.

**Quase nenhuma configuração de infraestrutura está neste repositório.** Não existe
`netlify.toml`, `railway.json`, `Procfile` nem workflow do GitHub Actions. Comando de build,
variáveis de ambiente, domínio e política de restart vivem apenas nos painéis do Railway e do
Netlify. O registro do webhook no Telegram (URL e `secret_token`) também é feito fora daqui,
direto na API do Telegram.

A única exceção é **`public/_redirects`**, que o Vite copia para o `dist/`: ele manda o Netlify
servir o `index.html` em qualquer caminho. Sem esse arquivo, abrir `/painel` direto ou recarregar
fora da raiz dá 404 — o roteamento é todo no navegador, e o `dist/` não tem pasta `/painel`.

Consequência prática: **mudar variável de ambiente exige redeploy no Netlify** (elas entram no
bundle durante o build) e reinício no Railway.

---

## Banco de dados

Migrations ficam em `agent/migrations/` e são **rodadas à mão** no SQL Editor do Supabase, em
ordem. Não há runner, nem tabela de controle, nem `npm run migrate` — o cabeçalho de cada
arquivo diz como aplicar.

| Migration | O que faz | Estado |
|---|---|---|
| `001_agente_whatsapp.sql` | Campos de logística e `status` em `viagens`; cria `conversas` e `config_notificacoes` | aplicada |
| `002_multiempresa_apelidos.sql` | `empresa` passa a aceitar nulo; cria `motoristas_apelidos` | aplicada |
| `003_corrigir_status_legado.sql` | Corrige 3 datas com ano corrompido e recalcula o status de 376 viagens legadas | aplicada em 16/09/2026 |
| `004_login_gerentes.sql` | Fecha as seis tabelas antigas para o papel `anon`: uma policy "gerentes autenticados" em cada, só para `authenticated` | aplicada em 30/09/2026 |
| `005_ordens_pagamento.sql` | Cria `ordens_pagamento` e `configuracao_financeira`, a coluna `viagens.ordem_id`, a view `ordens_resumo` e as duas triggers de trava (erros com SQLSTATE `TRV01`) | aplicada em 03/10/2026 |
| `006_mensagens_trava.sql` | Corrige o texto de três mensagens da 005 que mandavam o usuário fazer o que a própria trava proíbe, e dá `TRV01` à segunda quitação de legado. Só substitui as duas funções | aplicada em 03/10/2026 |
| `007_repasses.sql` | Cria `aliquotas_repasse` e `movimentos_entre_empresas`, a coluna `ordens_pagamento.aliquota_repasse`, as views `devidos_entre_empresas` e `saldo_entre_empresas`, e trava os campos que definem o repasse na ordem recebida | aplicada em 05/10/2026 |

Duas ressalvas honestas sobre esse processo:

- Um script rodado à mão **não tem rollback automático**. A 003 cria uma tabela de backup antes
  de escrever e traz a receita de reversão comentada no fim.
- **Os arquivos são um registro parcial, não o schema de verdade.** A coluna `criado_em`, usada
  por `agent/src/services/auditoria.js`, não é criada por nenhuma migration — foi adicionada
  pelo painel. O schema de referência é o do Supabase.
- **Função de trigger substituída aparece em mais de uma migration.** `trv_ordem_transicao`
  foi criada pela 005, reescrita pela 006 (mensagens) e pela 007 (alíquota e travas da ordem
  recebida), sempre com `create or replace`. A versão que está no banco é a da migration mais
  alta — procurar a regra na 005 leva a uma versão antiga. O mesmo vale para
  `trv_viagem_em_ordem`, criada na 005 e reescrita na 006.

### Acesso aos dados

**Todas as nove tabelas dependem de RLS, e nenhuma está aberta ao público.** Quem chega sem
sessão é o papel `anon` — a chave publishable que vai embutida no bundle — e ele não tem policy
em tabela nenhuma.

| Tabela | Quem alcança |
|---|---|
| `viagens`, `despesas`, `clientes`, `motoristas`, `caminhoes`, `categoriasdespesas` | gerente logado (papel `authenticated`, policy "gerentes autenticados") e o agente |
| `motoristas_apelidos`, `conversas`, `config_notificacoes` | só o agente — sem policy nenhuma, e a web não as usa |

A policy das seis é `for all to authenticated using (true) with check (true)`: todos os gerentes
veem e editam tudo, porque não há perfis diferentes. Ela foi criada pela migration 004, que
removeu as policies "Acesso total \<tabela>" para o papel `public` — herdadas de quando essas
seis tabelas foram criadas pelo painel, antes de o Supabase ligar RLS por padrão. Até então
qualquer pessoa com a URL do site lia e alterava viagens e despesas reais.

O agente atravessa tudo isso: a chave secreta ignora RLS. **Regra de negócio que precisa valer
para os dois lados vai para constraint ou trigger, nunca para policy.**

Duas consequências que não são óbvias:

- **Leitura sem sessão não dá erro.** O PostgREST responde 200 com lista vazia, e um Dashboard
  sem sessão mostraria faturamento zero como se fosse verdade. É por isso que o portão de
  sessão (`src/components/PortaoSessao.jsx`) fica acima do `App`: sem sessão o app não é
  montado e nenhuma consulta a `/rest/v1` acontece. Escrita barrada, sim, dá erro (`42501`).
- **Cadastro público tem de ficar desligado** no painel de Auth. Com ele ligado, qualquer
  pessoa cria uma conta pela API com a chave do bundle, vira `authenticated` e recupera o
  acesso a tudo. Não há tela de "criar conta"; usuário e redefinição de senha são feitos pelo
  painel do Supabase.

---

## Por que o agente não roda em Supabase Edge Functions

Pergunta recorrente, com uma resposta menos óbvia do que parece. Metade dos motivos que se
costuma dar **não se aplica** aqui:

- **Tempo de execução não é o problema.** O limite é 150s no plano free e 400s no pago, com 2s
  de CPU que não contam I/O assíncrono. Um turno do agente leva 10 a 25 segundos, quase tudo
  esperando rede. Caberia.
- **Agendamento não é o problema.** O Supabase Cron (`pg_cron`) roda de minuto em minuto e sabe
  invocar Edge Function. Os três `cron.schedule` de `agent/src/scheduler.js` teriam para onde ir.

O que impede de verdade são **três características estruturais** do agente:

**1. O webhook responde antes de trabalhar.** Em `agent/src/index.js`, o `res.status(200).end()`
acontece *antes* de transcrever áudio, chamar a Anthropic, gravar no banco e responder ao
usuário — porque o Telegram reenvia a mensagem se não receber um 200 rápido. Numa plataforma
que congela a execução ao devolver a resposta, todo esse trabalho seria morto no meio: o
usuário fica sem resposta e o banco pode ficar com gravação parcial.

**2. Duas estruturas em memória guardam a correção do sistema.** `filasPorChat` serializa as
mensagens de um mesmo chat, para duas mensagens seguidas não intercalarem o histórico nem
gravarem em duplicidade; `updatesVistos` descarta `update_id` repetido quando o Telegram
reenvia. Nenhuma das duas tem equivalente no banco. Num ambiente sem estado elas simplesmente
não existem — e o resultado é registro financeiro duplicado, que já aconteceu aqui por outro
motivo (veja o FIX #11 no `MELHORIAS.md`).

**3. Duas das três tarefas agendadas não têm rota HTTP.** `marcarRealizadasPendentes` e
`rodarAuditoriaDiaria` só são alcançáveis pelo cron interno; não existe endpoint que as dispare.
E o agendador é iniciado de dentro do `app.listen` — sem processo residente, nada roda.

**Conclusão: o agente fica no Railway.** Migrar trocaria um serviço que funciona por um conjunto
de peças novas (locks no banco, tabela de updates processados, `pg_cron`, CLI do Supabase que
nunca foi introduzida aqui) para resolver um problema que não temos. O que de fato importava era
o acesso aberto às seis tabelas, e isso foi resolvido com login e RLS — veja
[Acesso aos dados](#acesso-aos-dados) —, sem tirar o agente do lugar.

Edge Functions só ganhariam sentido aqui se a validação precisasse morar no servidor. Hoje ela
vive no cliente (`src/lib/viagem.js`, `src/lib/despesa.js`) e no agente
(`agent/src/services/referencias.js`).

---

## Testes

```bash
cd agent && npm test
```

42 casos cobrindo as correções do agente (FIX #11 a #17): turno que aborta sem deixar pedido
órfão, aviso de erro que não mente sobre o que já foi gravado, conferência nome↔ID antes de
gravar, a regra de status da viagem, o reenvio quando a conexão com o Telegram cai, e a
limpeza dos blocos que só o código pode escrever. Usa o runner nativo do Node, sem dependência
nova.

Um dos casos espera o backoff de reenvio de verdade, então a suíte leva ~2s em vez de ~0,1s.

**O app web não tem suíte.** A verificação é `npm run build`, `npx eslint src/` e teste manual.
O lint acusa 4 erros pré-existentes, todos falsos positivos de configuração — veja `MELHORIAS.md`.

---

## Armadilhas conhecidas

- **`src/App.css` é código morto.** Não é importado por ninguém e contém cópias antigas de
  regras que hoje vivem em `src/index.css`. Editar o arquivo errado não tem efeito nenhum.
- **`src/components/` tem componentes órfãos** desde a migração para Tailwind/shadcn:
  `DiarioViagens`, `FiltrosRelatorio`, `ResumoFinanceiro`, `TabelasRelatorio`, `TabNav`,
  `Toast`. Vários contêm versões antigas das mesmas tabelas — quem procurar por um texto da
  interface pode cair no arquivo errado. `ui/tabs.jsx` entrou nessa lista quando as três abas
  do topo viraram menu lateral.
- **`src/components/ui/sidebar.jsx` tem correções feitas à mão**, descritas no cabeçalho do
  arquivo. A CLI do shadcn entrega a geração Tailwind 3, que escreve largura como
  `w-[--sidebar-width]` — forma que o Tailwind 4 traduz para `width:--sidebar-width`, uma
  declaração inválida que o navegador joga fora. O sintoma é o menu aparecer **sem largura
  nenhuma**. Regerar o arquivo pela CLI traz o problema de volta.
- **A URL pública do serviço no Railway não está registrada em lugar nenhum.** Ela aparece na
  resposta do `getWebhookInfo` do Telegram e no painel. Sem ela não dá para bater no `/health`
  nem nos endpoints `/test`.
