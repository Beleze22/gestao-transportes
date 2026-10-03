// Cabeçalho das telas do Financeiro: título à esquerda, uma frase curta explicando a tela,
// e os números-resumo à direita (docs/design.md). No celular os números vão para baixo do
// título, porque lado a lado não cabem — e o título já está na barra do topo, então aqui
// ele aparece só no computador.
//
// `numeros` é uma lista de { rotulo, valor, destaque }. Com `destaque`, o número vem maior e
// em verde-escuro: é o total, o que a pessoa procura primeiro.
export default function CabecalhoFinanceiro({ titulo, descricao, numeros = [] }) {
  return (
    <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-6">
      <div className="min-w-0">
        <h1 className="hidden text-2xl font-bold text-brand-green md:block">{titulo}</h1>
        {descricao && (
          <p className="mt-1.5 max-w-prose text-sm text-muted-foreground">{descricao}</p>
        )}
      </div>

      {numeros.length > 0 && (
        <dl className="flex flex-wrap items-end gap-x-7 gap-y-3 tabular-nums">
          {numeros.map((n) => (
            <div key={n.rotulo}>
              <dt className="text-xs text-muted-foreground">{n.rotulo}</dt>
              <dd
                className={
                  n.destaque
                    ? "text-xl font-bold text-brand-green"
                    : "text-base font-semibold"
                }>
                {n.valor}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
