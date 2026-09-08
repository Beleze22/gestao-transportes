# Melhorias Futuras

## Segurança

- [ ] **RLS / autenticação no Supabase** — o app web usa a chave `anon` sem login e as tabelas `viagens`/`despesas` estão com acesso aberto: qualquer pessoa com a URL do Netlify pode ler e alterar os dados (que são reais, ainda que o projeto seja de aprendizagem). Decisão de jul/2026: aceitar o risco por enquanto. Quando implementar: Supabase Auth (login simples) + políticas RLS por tabela. A tabela `conversas` já está protegida.
- [x] **Endpoints `/test` com secret** — exigem header `x-test-secret` (env `TEST_ENDPOINT_SECRET` no Railway); desabilitados sem a env var.

## Infraestrutura / DevOps

- [ ] **Dependabot** — ativar no GitHub para receber PRs automáticos de atualização de dependências semanalmente. Arquivo a criar: `.github/dependabot.yml`. Previne o problema do `node-fetch` / SDK desatualizado que quebrou o serviço em jun/2026.
- [ ] **Remover serviço `evolution-api`** do Railway — não é mais usado desde a migração para Telegram (o código `whatsapp.js` + axios já foi removido do repo em jul/2026).
- [ ] **Trocar `npm install` por `npm ci`** no Dockerfile do agente — garante builds reproduzíveis a partir do lockfile.
- [ ] **ESLint na pasta `agent/`** — o `eslint.config.js` aplica globals de browser ao código Node do agente (acusa `process is not defined`). Adicionar bloco com `globals: { ...globals.node }` para `agent/**`. O mesmo config também acusa `'Icon' is defined but never used` no `Dashboard.jsx`, onde `Icon` é usado em JSX — falta a regra que conta uso em JSX.
- [x] **Testes automatizados do agente** — `agent/test/`, rodando com `npm test` (`node --test`, sem dependência nova). Cobrem os FIX #11 a #14. Criados em set/2026 depois de duas rodadas de correções em regra de status irem para produção sem rede de proteção.
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
- [x] **FIX #11 — turno que aborta não deixa pedido órfão** — quando a chamada à API falha (crédito esgotado, timeout), o histórico agora registra o fechamento do turno em vez de deixar a mensagem do usuário sem resposta. Sem isso o modelo lia o pedido como pendente e podia executá-lo sozinho enquanto o usuário repetia — duplicando o registro. Inclui: aviso ao usuário que diferencia falha antes/depois de gravar, separação entre erro de processamento e erro de envio, regra no prompt sobre pedidos antigos que falharam, e `agent/scripts/fechar-turnos-orfaos.js` para o resíduo já no banco.
- [x] **FIX #14 — editar viagem cancelada não a ressuscita** — `atualizarViagem` não tratava `cancelada`, então o status caía no `statusPorCompletude` e voltava para `confirmada`, devolvendo a viagem a todos os totais financeiros. Para descancelar, o status agora precisa vir explícito em `campos`.
- [x] **FIX #13 — conferência nome↔ID passou a ser estrutural** — substitui o FIX #10, que extraía o nome do resumo em texto livre com regex (`/Motorista:\s*\*\*(...)\*\*/`). O prompt nunca exigiu aquele formato, então a regex quase nunca casava e a checagem passava reto **em silêncio** (`if (!nomeCitado) continue`). Agora o nome é parâmetro da própria ferramenta (`cliente_nome`, `motorista_nome`, `caminhao_placa`, `categoria_nome`) e `services/referencias.js` cruza nome e ID contra o banco em `tools.js/executar` — falha **fechada**: ID sem o nome é recusado. Estendido a `registrar_apelido_motorista`, onde a associação errada envenena toda resolução futura. `validarReferencias` (viagens.js) e as checagens de existência em catalogo.js foram removidas por virarem duplicata — o banco tem FK nas três colunas.
- [x] **FIX #12 — erro de escrita não mente sobre o que já foi gravado** — o caminho de erro não recuperável (FIX #7) afirmava "Nada foi registrado" mesmo quando escritas anteriores do turno já tinham ido para o banco, e ainda anexava a conferência do que foi gravado logo abaixo. Além disso, as gravações eram contabilizadas *depois* do `return` antecipado, então uma escrita bem-sucedida no mesmo lote da que falhou sumia do aviso e do histórico. O fechamento do turno foi centralizado em `finalizarTurno()` — os três pontos de saída divergiram justamente por duplicarem essa lógica.

Pendentes:

- [ ] **Contexto de memória curto** — o agente vê só as últimas 20 mensagens (`LIMITE_CONTEXTO` em `history.js`); o limite de 80k tokens nunca é atingido. Avaliar aumentar para 40–60 mensagens.
- [ ] **`gerar_relatorio` exige frete E pgto motorista não nulos** — viagem com frete definido mas pagamento pendente fica fora do faturamento. Validar se é o comportamento desejado.

## Dados

- [ ] **MARCELO no banco** — `caminhoes` id=7 tem `placa="MARCELO"` (nome de pessoa, não placa). Corrigir com a placa real quando disponível.
- [ ] **Novos usuários** — quando os números 11 965055544 e 11 912516744 enviarem a primeira mensagem, adicionar os chat_ids gerados ao `TELEGRAM_ALLOWED_IDS` no Railway.
- [x] **Viagem SUNSHINE 10/07 restaurada** — id 420, inserida manualmente após alucinação de confirmação do agente (caso que motivou o FIX #8).

## App web

- [x] **Editar e cancelar viagens** (set/2026) — a tabela do Dashboard abre um modal com o `ViagemForm` completo. Cancelar marca `status='cancelada'` (reversível, com ação de reativar); a exclusão definitiva fica dentro do modal, atrás de uma confirmação que exige digitar o ID da viagem.
- [x] **Filtro de período livre** — opção "Personalizado" com data inicial e final. Campo em branco deixa o lado em aberto; datas invertidas se trocam.
- [x] **Escritas exigem uma linha de retorno** — um `update`/`delete` barrado por RLS responde `200` com lista vazia e `error: null`. Sem a checagem, o app confirmaria "salvo!" sem ter salvo. Ver `exigirUmaLinha` em `useTransporteData.js`.
- [x] **`buscarDados({ silencioso })`** — o spinner de tela cheia desmontava a árvore inteira a cada regravação; como as `Tabs` são não-controladas, isso jogava o usuário de volta para a aba "Viagem" e zerava os filtros do Dashboard. Agora só a carga inicial mostra spinner.

Pendentes:

- [ ] **Concorrência entre o site e o agente** — não há trava nem coluna de versão em `viagens`. Se você editar no site enquanto o bot altera a mesma viagem, o último a gravar vence, sem aviso. Aceitável com um operador só; o caminho seria `atualizado_em` + `.eq()` na condição do update, devolvendo "alterada em outro lugar, recarregue".
- [ ] **Exclusão sem trilha de auditoria** — um `delete` não deixa registro em lugar nenhum, e não há backup point-in-time no plano free do Supabase. É por isso que a exclusão está escondida atrás do cancelamento.
- [ ] **Componentes órfãos** — `DiarioViagens`, `FiltrosRelatorio`, `ResumoFinanceiro`, `TabelasRelatorio`, `TabNav` e `Toast` não são importados por ninguém desde a migração para Tailwind/shadcn. Remover.
