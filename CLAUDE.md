# CLAUDE.md

Arquitetura, deploy, migrations aplicadas e armadilhas do repositório: @README.md
Regras visuais e de interface: @docs/design.md (protótipo aprovado em `docs/design/prototipo/`)
Histórico de correções (FIX #N) e pendências: `MELHORIAS.md`. Leia antes de mexer no agente
ou nas regras de viagem.

## O negócio, em poucas linhas

- Duas transportadoras, **Rohan** e **TransBeleze**, com a mesma gestão e faturamento e custos
  separados. Motoristas, caminhões e clientes servem às duas.
- Fretes dentro de São Paulo para empresas de eventos. Cada perna (ida ou volta) é uma viagem
  cobrada separadamente.
- Só os gerentes usam o sistema, pela web e pelo agente do Telegram. O agente faz o mesmo
  trabalho que a web, em linguagem natural.

## Como trabalhamos

- Ordem de implementação das specs: 01 (login), 04 (navegação), 02 (ordens), 03 (repasses).
  Cada uma validada em produção antes de começar a próxima.
- A tarefa vem de uma spec em `docs/specs/NN-nome.md`. Antes de escrever código, apresente um
  plano: arquivos que vão mudar, separados por lado (banco, web, agente), e como cada critério
  de aceite será verificado. Espere aprovação.
- Uma spec por branch (`spec-NN-nome`). Nunca faça commit nem push na `stable`: o push nela
  publica a web e o agente.
- Se a spec e o código divergirem, ou se a spec não previu algo, pare e pergunte. Não adapte a
  spec em silêncio.
- Não amplie o escopo. Refatoração ou melhoria fora da spec vira uma linha em `MELHORIAS.md`.

## O banco é contrato compartilhado

- A web usa a chave publishable e passa por RLS. O agente usa a chave secreta e **ignora RLS**.
  Os dois leem e gravam as mesmas tabelas e sobem em builds independentes.
- Toda mudança de schema, RLS, trigger ou significado de campo precisa dizer o impacto nos dois
  lados. Antes de alterar uma coluna, procure todos os usos em `src/` e em `agent/src/`.
- Regra de negócio que precisa valer para os dois lados vai para o banco (constraint ou
  trigger), nunca para um dos clientes só. RLS não protege contra o agente.
- Regras hoje duplicadas: o status da viagem em `src/lib/viagem.js` e em
  `agent/src/services/viagens.js`. Mudou uma, mude a outra e o teste
  `agent/test/status-viagem.test.mjs`. A validação de cadastro existe em `src/lib/viagem.js`,
  `src/lib/despesa.js` e `agent/src/services/referencias.js`.
- `viagens.status` descreve só o ciclo operacional da viagem. Estado financeiro (faturada,
  recebida) nunca vai nesse campo.
- A coluna `empresa` é texto com os valores exatos `Rohan` e `TransBeleze`.

## Migrations

- Nova migration é um novo arquivo numerado em `agent/migrations/`, com cabeçalho (o que faz,
  como aplicar, impacto na web e no agente), tudo dentro de uma transação e com o script de
  reversão comentado no fim.
- Nunca edite uma migration já aplicada. A tabela do README diz quais estão aplicadas.
- Você não aplica migration em produção. Entregue o arquivo; eu rodo à mão no SQL Editor.
  Depois de aplicada, atualize a tabela do README.
- Tabela nova nasce com RLS ativo e policy para `authenticated`. View nova usa
  `security_invoker = true`, senão ignora o RLS.
- Erro de regra de negócio levantado pelo banco usa o SQLSTATE `TRV01`, com uma mensagem que
  pode ser mostrada ao usuário como está.

## Chaves, segredos e dados

- O frontend só conhece `VITE_SUPABASE_URL` e `VITE_SUPABASE_KEY` (publishable). Nada com
  `sb_secret_` ou service_role em `src/` nem em variável `VITE_`: tudo que é `VITE_` vai para o
  bundle público.
- Operação privilegiada pelo lado da web vira Edge Function. Pergunte antes de criar uma.
- Não leia nem imprima `.env`, `.env.local` ou `agent/.env`.
- Não faça commit de dados reais (CSVs, dumps, arquivos de backup como
  `backup-003-viagens.json`).

## Código

- Web: React 19, Vite, Tailwind 4 e componentes shadcn em `src/components/ui/`. Reaproveite
  esses componentes; não adicione biblioteca de UI sem perguntar.
- Tela nova vira componente próprio. Não faça `Dashboard.jsx` crescer além do que já é.
- `src/App.css` é código morto, e há componentes órfãos listados no README. Antes de editar um
  componente, confirme que ele é importado por alguém.
- Agente: as ferramentas ficam em `agent/src/tools.js`; o tratamento de erro de escrita segue o
  padrão do FIX #7 em `agent/src/agent.js`.
- Interface, mensagens de erro, comentários e commits em português.

## Antes de dizer "pronto"

- Agente: `cd agent && npm test` passando, com teste novo para cada regra nova.
- Web: `npm run build` sem erro e `npx eslint src/` sem erro novo (há 4 pré-existentes,
  descritos no `MELHORIAS.md`).
- Para cada critério de aceite da spec, diga como foi verificado: teste, SQL ou manual. O que
  só puder ser verificado em produção vira uma lista de passos para mim, com o SQL pronto.
- SQL de verificação sempre dentro de `begin; … rollback;`, para não deixar dado de teste.
