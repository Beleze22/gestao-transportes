# Melhorias Futuras

## Segurança

- [ ] **RLS / autenticação no Supabase** — o app web usa a chave `anon` sem login e as tabelas `viagens`/`despesas` estão com acesso aberto: qualquer pessoa com a URL do Netlify pode ler e alterar os dados (que são reais, ainda que o projeto seja de aprendizagem). Decisão de jul/2026: aceitar o risco por enquanto. Quando implementar: Supabase Auth (login simples) + políticas RLS por tabela. A tabela `conversas` já está protegida.
- [x] **Endpoints `/test` com secret** — exigem header `x-test-secret` (env `TEST_ENDPOINT_SECRET` no Railway); desabilitados sem a env var.

## Infraestrutura / DevOps

- [ ] **Dependabot** — ativar no GitHub para receber PRs automáticos de atualização de dependências semanalmente. Arquivo a criar: `.github/dependabot.yml`. Previne o problema do `node-fetch` / SDK desatualizado que quebrou o serviço em jun/2026.
- [ ] **Remover serviço `evolution-api`** do Railway — não é mais usado desde a migração para Telegram (o código `whatsapp.js` + axios já foi removido do repo em jul/2026).
- [ ] **Trocar `npm install` por `npm ci`** no Dockerfile do agente — garante builds reproduzíveis a partir do lockfile.
- [ ] **ESLint na pasta `agent/`** — o `eslint.config.js` aplica globals de browser ao código Node do agente (acusa `process is not defined`). Adicionar bloco com `globals: { ...globals.node }` para `agent/**`.
- [ ] **Ambiente de staging** — branch `dev` + serviço Railway de staging + projeto Supabase separado + bot Telegram de teste (discutido em jun/2026, adiado).

## Agente IA

Aplicadas e em produção (jul/2026):

- [x] **FIX #1–#7** — execução sequencial de tools, aviso de limite de iterações, system prompt único, `temperature: 0`, truncagem de histórico, validação de entrada, interrupção em erro de escrita.
- [x] **FIX #8 — guard anti-alucinação** — bloqueia resposta que afirma gravação sem ferramenta de escrita executada no turno; regra "prova de gravação" exige citar o ID retornado.
- [x] **Confirmação antes de gravar** + **regra DATA ATUAL com ISO** + **regras de re-consulta**.
- [x] **Histórico com marcador de gravações** — `[registro do sistema: gravações executadas...]` anexado às respostas no histórico.
- [x] **Lock de concorrência por chat + dedup de `update_id`**.
- [x] **Timezone `America/Sao_Paulo`** em `hojeISO()` (`datas.js`).
- [x] **Telegram: Markdown com fallback + divisão de mensagens > 4096 chars**.
- [x] **Modelo via env var** (`ANTHROPIC_MODEL`).
- [x] **Normalização de erros de transcrição** no prompt (ex: "negro" → "nego").
- [x] **Transcrição de áudio (Groq Whisper)** — `whisper-large-v3-turbo` via `telegram.js`.
- [x] **Auditoria diária** (23h) — detecta confirmações suspeitas por tempo de resposta.

Pendentes:

- [ ] **Contexto de memória curto** — o agente vê só as últimas 20 mensagens (`LIMITE_CONTEXTO` em `history.js`); o limite de 80k tokens nunca é atingido. Avaliar aumentar para 40–60 mensagens.
- [ ] **`gerar_relatorio` exige frete E pgto motorista não nulos** — viagem com frete definido mas pagamento pendente fica fora do faturamento. Validar se é o comportamento desejado.

## Dados

- [ ] **MARCELO no banco** — `caminhoes` id=7 tem `placa="MARCELO"` (nome de pessoa, não placa). Corrigir com a placa real quando disponível.
- [ ] **Novos usuários** — quando os números 11 965055544 e 11 912516744 enviarem a primeira mensagem, adicionar os chat_ids gerados ao `TELEGRAM_ALLOWED_IDS` no Railway.
- [x] **Viagem SUNSHINE 10/07 restaurada** — id 420, inserida manualmente após alucinação de confirmação do agente (caso que motivou o FIX #8).
