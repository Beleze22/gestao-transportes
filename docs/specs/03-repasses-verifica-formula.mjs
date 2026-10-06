// Confere se o espelho JavaScript da fórmula de repasse ainda bate com a regra do banco.
//
// POR QUE EXISTE
// O cálculo do devido vive em dois lugares: na view `devidos_entre_empresas` (migration
// 007), que é a fonte de verdade, e em `src/lib/repasse.js`, que a prévia usa porque
// precisa do valor ANTES de a ordem ser recebida. Se os dois divergirem, a tela promete um
// repasse e o extrato cobra outro.
//
// O lado do banco é verificado por docs/specs/03-repasses-testes.sql, critério 1. Este
// arquivo verifica o lado do JavaScript, com os MESMOS seis casos.
//
// COMO RODAR (da raiz do projeto)
//
//   npx esbuild src/lib/repasse.js --bundle --format=esm --alias:@=./src \
//     --outfile=/tmp/repasse.mjs --log-level=error
//   node --input-type=module -e "
//     import('/tmp/repasse.mjs').then(m => import('./docs/specs/03-repasses-verifica-formula.mjs')
//       .then(t => t.rodar(m.calcularDevido)))"
//
// Ou, mais curto, com o bundle ao lado deste arquivo:
//
//   npx esbuild src/lib/repasse.js --bundle --format=esm --alias:@=./src \
//     --outfile=docs/specs/.repasse-bundle.mjs --log-level=error
//   node -e "Promise.all([import('./docs/specs/.repasse-bundle.mjs'), import('./docs/specs/03-repasses-verifica-formula.mjs')]).then(([m,t])=>t.rodar(m.calcularDevido))"
//
// O esbuild é necessário só para resolver o alias `@/` — ele já é dependência do Vite,
// não há nada a instalar. Sai com código 1 se algum caso divergir.

const TOTAIS = { Rohan: 1000, TransBeleze: 500 };

// Os quatro casos da tabela da spec 03, mais o critério 2 e o critério 3.
const CASOS = [
  { nome: "sem nota, caiu na Rohan", totais: TOTAIS, comNota: false, empresaNota: null,
    conta: "Rohan", aliquota: 0, valor: 500, devedora: "Rohan", credora: "TransBeleze" },
  { nome: "nota Rohan, caiu na Rohan", totais: TOTAIS, comNota: true, empresaNota: "Rohan",
    conta: "Rohan", aliquota: 0.09, valor: 455, devedora: "Rohan", credora: "TransBeleze" },
  { nome: "nota Rohan, caiu na TransBeleze", totais: TOTAIS, comNota: true, empresaNota: "Rohan",
    conta: "TransBeleze", aliquota: 0.09, valor: 1045, devedora: "TransBeleze", credora: "Rohan" },
  { nome: "nota TransBeleze, caiu na Rohan", totais: TOTAIS, comNota: true, empresaNota: "TransBeleze",
    conta: "Rohan", aliquota: 0.09, valor: 590, devedora: "Rohan", credora: "TransBeleze" },
  // Critério 2: só viagens de quem recebeu, com nota dele — nenhum devido.
  { nome: "só Rohan, nota Rohan, conta Rohan", totais: { Rohan: 1000, TransBeleze: 0 },
    comNota: true, empresaNota: "Rohan", conta: "Rohan", aliquota: 0.09, valor: null },
  // Critério 3: a mesma composição com 10% em vez de 9%.
  { nome: "alíquota 10% em vez de 9%", totais: TOTAIS, comNota: true, empresaNota: "Rohan",
    conta: "Rohan", aliquota: 0.1, valor: 450, devedora: "Rohan", credora: "TransBeleze" },
];

export function rodar(calcularDevido) {
  let falhas = 0;

  for (const c of CASOS) {
    const d = calcularDevido({
      totais: c.totais,
      comNota: c.comNota,
      empresaNota: c.empresaNota,
      empresaRecebedora: c.conta,
      aliquota: c.aliquota,
    });

    const ok =
      c.valor === null
        ? d === null
        : Boolean(d) && d.valor === c.valor && d.devedora === c.devedora && d.credora === c.credora;

    if (!ok) falhas++;
    const obtido = d ? `${d.valor} (${d.devedora} -> ${d.credora})` : "nenhum devido";
    const esperado = c.valor === null ? "nenhum devido" : `${c.valor} (${c.devedora} -> ${c.credora})`;
    console.log(`${ok ? "ok   " : "FALHA"} ${c.nome.padEnd(34)} esperado ${esperado} | obtido ${obtido}`);
  }

  console.log(
    falhas === 0
      ? "\nO espelho JS bate com a regra do banco nos 6 casos."
      : `\n*** ${falhas} divergência(s). A prévia da tela e o extrato vão discordar. ***`,
  );
  if (falhas > 0) process.exitCode = 1;
  return falhas;
}
