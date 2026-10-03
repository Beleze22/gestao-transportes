# Melhorias Futuras

## Segurança

- [x] **RLS / autenticação no Supabase** (spec 01, set/2026) — era o risco aceito em jul/2026: o app web usava a chave `anon` sem login e as seis tabelas antigas tinham policy aberta para o papel `public`, então qualquer pessoa com a URL do Netlify lia e alterava dados reais. Agora a web exige sessão do Supabase Auth (`src/components/PortaoSessao.jsx`, acima do `App`, para que nenhuma consulta saia sem sessão) e a migration `004_login_gerentes.sql` deixa nas seis tabelas uma única policy "gerentes autenticados", só para `authenticated`. O agente não mudou: a chave secreta ignora RLS.
  Ficou de fora, de propósito: recuperação de senha pela tela (é feita no painel do Supabase), perfis ou permissões diferentes entre gerentes (todos podem tudo, daí o `using (true)`), e policies para `motoristas_apelidos`, `conversas` e `config_notificacoes` — a web não as usa e elas seguem alcançáveis só pela chave secreta.
  Duas coisas que passam a ser pré-condição permanente: **cadastro público desligado** no painel (com ele ligado, qualquer pessoa cria conta pela API com a chave do bundle e volta a ter acesso total) e `SUPABASE_SERVICE_KEY` no Railway sendo de fato uma `sb_secret_…`.
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

Encontrados e corrigidos durante a validação da spec 01 (out/2026):

- [x] **FIX #16 — envio ao Telegram repete falha de conexão** — em 01/10/2026 duas respostas seguidas se perderam (faturamento 13:02:54 e despesa #88 13:03:47) com `TypeError: fetch failed` / `[cause]: AggregateError [ETIMEDOUT]` em `internalConnectMultiple`, estourando em `telegram.js`: a conexão com `api.telegram.org` não se estabeleceu, então **não houve status HTTP** — e o único retry que existia cobria só `status === 400` (erro de parse do Markdown). O `[errors]: [ [Error], [Error] ]` é a assinatura do Happy Eyeballs do Node tentando IPv6 e IPv4 e estourando os dois (250 ms por endereço, padrão do Node 22); falhou em ~1 segundo. Nos dois casos o aviso do FIX #11, enviado pela mesma função ~1 s depois, **chegou** — prova de que repetir resolvia. Agora `postSendMessage` tenta 3 vezes com espera de 500 ms e 1 s quando o fetch rejeita. Fora do escopo de propósito: 429 e 5xx, que chegam com status e resposta, e repetir 429 sem respeitar o `retry_after` piora o bloqueio. Risco aceito e comentado no código: uma queda de rede *depois* de o corpo ter sido enviado duplicaria a mensagem (o Telegram não tem chave de idempotência) — mensagem repetida é incômodo visual, resposta perdida é o gerente sem saber se gravou.
- [x] **FIX #17 — o modelo não escreve mais os blocos do sistema** — na mesma despesa #88, a resposta saiu com a "📋 Conferência automática" e o `[registro do sistema: ...]` **duas vezes**, e as cópias divergiam: a do modelo inventava `Obs: teste`, campo que o código não gera. Causa: `finalizarTurno` grava `texto + marcador` no histórico, o modelo vê o marcador nas conversas anteriores e aprendeu a escrevê-lo. O sintoma leve é a duplicação; o grave é **o marcador deixar de ser prova** — ele existe para que confirmação real venha acompanhada de gravação, e um turno que não gravou nada passaria a carregar prova falsa para os turnos seguintes. (O guard do FIX #8 em si não se abala: é determinístico, olha se uma ferramenta de escrita rodou no turno.) `limparBlocosDeSistema` corta tudo a partir do cabeçalho da conferência e remove qualquer marcador remanescente, tolerando paráfrase e negrito; se não sobrar nada, entra um "Pronto." para a mensagem não ir vazia — texto vazio é recusado pelo Telegram com 400, e a limpeza perderia a resposta inteira. Caminho preterido: tirar o marcador do `content` e pôr em coluna própria de `conversas` (migration nova) — mais limpo, mas o modelo deve continuar vendo marcadores reais, que é a intenção do FIX #8.

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

- [x] **Login e portão de sessão** (spec 01, set/2026) — tela de login com e-mail e senha (`Login.jsx`, do protótipo `docs/design/prototipo/Login.dc.html`), sessão em `useSessao.js` e botão Sair no cabeçalho. O portão fica acima do `App` porque `useTransporteData` dispara `buscarDados()` na montagem: sem sessão o `App` não é montado, e sair desmonta tudo — é o que apaga viagens e despesas da memória, sem limpeza manual.

Pendentes:

- [x] **Navegação lateral e endereços por tela** (spec 04, out/2026) — as três abas do topo viraram menu lateral (Sidebar do shadcn, 68/240 px, gaveta de 300 px no celular) e cada tela ganhou URL própria com `react-router`. O `App.jsx` passou a ser o layout: os dados e os rascunhos de formulário ficam nele, acima das rotas, para trocar de tela não recarregar o Supabase nem apagar formulário pela metade. O Sair saiu do cabeçalho e foi para o rodapé do menu, como a spec previa. O seletor de empresa virou dois botões (`SeletorEmpresa`), com grupo de rádios por trás.
- [ ] **Concorrência entre o site e o agente** — não há trava nem coluna de versão em `viagens`. Se você editar no site enquanto o bot altera a mesma viagem, o último a gravar vence, sem aviso. Aceitável com um operador só; o caminho seria `atualizado_em` + `.eq()` na condição do update, devolvendo "alterada em outro lugar, recarregue".
- [ ] **Exclusão sem trilha de auditoria** — um `delete` não deixa registro em lugar nenhum, e não há backup point-in-time no plano free do Supabase. É por isso que a exclusão está escondida atrás do cancelamento.
- [ ] **Formatadores duplicados** — `brl` existe em três lugares (`App.jsx`, `Dashboard.jsx` e, o novo, `src/lib/formato.js`) e `rotaDaViagem` em dois (`Dashboard.jsx` e `formato.js`). O `lib/formato.js` nasceu na spec 02 e é o que o código novo usa; as cópias antigas ficaram para o diff da spec não misturar faxina com funcionalidade. Trocar é mecânico e sem risco.
- [ ] **Componentes órfãos** — `DiarioViagens`, `FiltrosRelatorio`, `ResumoFinanceiro`, `TabelasRelatorio`, `TabNav` e `Toast` não são importados por ninguém desde a migração para Tailwind/shadcn. Somou-se a eles o `ui/tabs.jsx` (e a dependência `@radix-ui/react-tabs`), sem uso desde que o menu lateral da spec 04 substituiu as abas do topo. Remover — ficou de fora da spec 04 para o diff dela não misturar limpeza com navegação.
- [ ] **`ui/sidebar.jsx` fora do padrão da CLI** — o arquivo tem três correções à mão (sintaxe de variável do Tailwind 4, cor do `shadow` em oklch, medidas do `design.md`), descritas no cabeçalho dele e no README. Enquanto a CLI do shadcn entregar a geração Tailwind 3 para este `components.json`, regerar o componente quebra as larguras do menu em silêncio. Caminho: ou migrar o `components.json` para o estilo novo (que troca todos os componentes `ui/` de geração), ou manter as correções e o aviso.
