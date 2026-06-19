# Melhorias Futuras

## Infraestrutura / DevOps

- [ ] **Dependabot** — ativar no GitHub para receber PRs automáticos de atualização de dependências semanalmente. Arquivo a criar: `.github/dependabot.yml` (ver conversa de jun/2026 para o conteúdo exato). Previne o problema do `node-fetch` / SDK desatualizado que quebrou o serviço em jun/2026.
- [ ] **Remover serviço `evolution-api`** do Railway — não é mais usado desde a migração para Telegram.
- [ ] **Trocar `npm install` por `npm ci`** no Dockerfile do agente — garante builds reproduzíveis a partir do lockfile, sem risco de instalar versões diferentes a cada deploy.

## Agente IA — Melhorias de comportamento (regressão jun/2026)

Estas melhorias estavam implementadas e funcionando, mas foram perdidas durante rollbacks de emergência. Reaplicar sobre o estado atual estável:

- [ ] **FIX #1** — Execução sequencial de ferramentas (`executarFerramentasSequencial`) em vez de `Promise.all`, evita race conditions em escritas encadeadas.
- [ ] **FIX #2** — Flag `atingiuLimite` com mensagem explícita ao usuário quando o loop atinge `MAX_ITERACOES`.
- [ ] **FIX #3** — System prompt montado uma única vez antes do loop (não a cada iteração).
- [ ] **FIX #4** — `temperature: 0` para máximo determinismo em agente financeiro.
- [ ] **FIX #5** — `truncarHistorico()` com limite de tokens estimados para evitar context overflow.
- [ ] **FIX #6** — `validarEntrada()` rejeita mensagens vazias ou muito longas antes de qualquer I/O.
- [ ] **FIX #7** — Interrompe o loop e avisa o usuário se uma ferramenta de escrita retornar erro.
- [ ] **Confirmação antes de gravar** — antes de chamar qualquer ferramenta de escrita, mostrar resumo completo e pedir "Confirma?" ao usuário. Só gravar após confirmação explícita.
- [ ] **Regra DATA ATUAL** — injetar data atual no system prompt com diretiva explícita para nunca inferir "hoje" do histórico de conversa.
- [ ] **Regras de consulta** — ao consultar viagens sem especificar empresa, buscar ambas sem filtro; ao ser questionado sobre resultado, sempre re-consultar antes de responder.

## Histórico e Auditoria

- [ ] **Histórico completo para auditoria** — armazenar todas as mensagens na tabela `conversas` sem deletar, mas enviar apenas as últimas 20 ao Claude. Requer correção no `history.js` (order desc + limit + reverse).
- [ ] **Timezone em `hojeISO()`** — `agenda.js` usa `toISOString()` (UTC) para filtrar datas, o que pode retornar a data errada após 21h (horário de Brasília). Corrigir para usar `America/Sao_Paulo`.

## Digest / Notificações

- [ ] **Formato inline do digest** — linha de viagem no formato `Empresa | Cliente | Motorista | Veículo | local+hora carregamento | local+hora descarregamento`.
- [ ] **`marcarRealizadasPendentes`** — separar viagens com valores (→ `concluida`) das sem valores (→ `realizada_pendente`). Versão atual move todas para `realizada_pendente` independente de ter valores.
- [ ] **Filtro de segurança em `viagensComValorPendente`** — adicionar `.or("valor_frete.is.null,valor_motorista.is.null")` para evitar falsos positivos.
- [ ] **Endpoints de teste** — `POST /test/digest-manha` e `POST /test/digest-noite` para acionar digests manualmente sem esperar o scheduler.

## Funcionalidades Novas

- [ ] **Transcrição de áudio (Groq Whisper)** — implementar `transcricao.js` com `whisper-large-v3-turbo`, tratar `message.voice` no webhook do Telegram. Já foi implementado e validado tecnicamente; estava funcionando a transcrição mas bloqueado pelo bug do SDK (agora resolvido).
- [ ] **MARCELO no banco** — `caminhoes` id=7 tem `placa="MARCELO"` (nome de pessoa, não placa). Corrigir com a placa real quando disponível.
- [ ] **Novos usuários** — quando os números 11 965055544 e 11 912516744 enviarem a primeira mensagem, adicionar os chat_ids gerados ao `TELEGRAM_ALLOWED_IDS` no Railway.
