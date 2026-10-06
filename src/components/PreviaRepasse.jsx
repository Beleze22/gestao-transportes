import { TriangleAlert } from "lucide-react";
import {
  aliquotaVencida, calcularDevido, comoPercentual, diasDesdeAtualizacao, explicarDevido,
} from "@/lib/repasse";
import { brl } from "@/lib/formato";

// O repasse que a ordem vai gerar, mostrado ANTES de confirmar o recebimento e de novo no
// detalhe da ordem recebida. Duas razões para existir: o valor sai de uma conta de três
// casos, e é dinheiro que vai sair de uma empresa para a outra depois.
//
// O número vem de lib/repasse.js, espelho da view do banco. Depois do recebimento, o valor
// que vale é o da view — e os dois têm de coincidir.
export default function PreviaRepasse({
  totais,
  comNota,
  empresaNota,
  empresaRecebedora,
  aliquotaDaEmissora,
  atualizadaEm,
}) {
  if (!empresaRecebedora) {
    return (
      <p className="rounded-lg border bg-secondary px-3 py-2.5 text-sm text-muted-foreground">
        Escolha a conta que recebeu para ver o repasse que esta ordem vai gerar.
      </p>
    );
  }

  const aliquota = comNota ? aliquotaDaEmissora : 0;
  const devido = calcularDevido({ totais, comNota, empresaNota, empresaRecebedora, aliquota });
  const vencida = comNota && aliquotaVencida(atualizadaEm);
  const dias = diasDesdeAtualizacao(atualizadaEm);

  return (
    <div className="rounded-lg border bg-secondary px-3 py-2.5 text-sm">
      <p className="text-xs text-muted-foreground">Repasse que esta ordem vai gerar</p>

      {devido ? (
        <>
          <p className="mt-1 font-semibold">
            {devido.devedora} repassa {brl(devido.valor)} à {devido.credora}
          </p>
          <p className="mt-1 text-muted-foreground">
            {explicarDevido(devido, { comNota, empresaNota, empresaRecebedora })}
          </p>
        </>
      ) : (
        <p className="mt-1 font-semibold">
          Nenhum repasse: todas as viagens são da empresa que recebeu
          {comNota && empresaNota === empresaRecebedora ? ", e a nota é dela" : ""}.
        </p>
      )}

      {vencida && (
        <p className="mt-2 flex gap-2 text-status-vencida-foreground">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 flex-none" />
          <span>
            A alíquota da {empresaNota} ({comoPercentual(aliquota)}) foi atualizada
            {dias != null ? ` há ${dias} dias` : " há muito tempo"}. Ela deve mudar todo mês —
            confira em Alíquotas antes de confirmar.
          </span>
        </p>
      )}
    </div>
  );
}
