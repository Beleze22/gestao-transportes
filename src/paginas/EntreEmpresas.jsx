import { useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router";
import { toast } from "sonner";
import { Pencil, TriangleAlert, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import CabecalhoFinanceiro from "@/components/CabecalhoFinanceiro";
import ModalMovimento from "@/components/ModalMovimento";
import { aliquotaVencida, comoPercentual, fraseDoSaldo } from "@/lib/repasse";
import { brl, dataCurta } from "@/lib/formato";

// Extrato de conta corrente entre as duas empresas. Três origens de linha:
//
//   devido  — derivado de cada ordem mista recebida. Não é gravado: sai da view.
//   ajuste  — dívida lançada à mão, sem ordem por trás.
//   repasse — dinheiro que já foi transferido, abatendo a dívida de quem pagou.
//
// O saldo acumulado é calculado aqui, linha a linha, e não no banco: ele depende da ORDEM
// de exibição, que é decisão de tela. O saldo TOTAL vem da view, que é a fonte de verdade —
// e a última linha do extrato tem de coincidir com ele.
export default function EntreEmpresas() {
  const ctx = useOutletContext();
  const [modal, setModal] = useState(null); // { tipo, movimento? }
  const [salvando, setSalvando] = useState(false);

  // Sinal no sentido TransBeleze -> Rohan, o mesmo da view: positivo, a TB deve.
  const linhas = useMemo(() => {
    const devidos = ctx.devidos.map((d) => ({
      chave: `devido-${d.ordem_id}`,
      data: d.recebida_em,
      tipo: "devido",
      descricao: `Ordem #${d.ordem_id}, ${d.cliente ?? "sem cliente"}`,
      detalhe: d.com_nota
        ? `nota da ${d.empresa_nota}, ${comoPercentual(d.aliquota)} — caiu na conta da ${d.devedora}`
        : `sem nota — caiu na conta da ${d.devedora}`,
      de: d.devedora,
      para: d.credora,
      valor: Number(d.valor),
      sinal: d.devedora === "TransBeleze" ? 1 : -1,
      ordemId: d.ordem_id,
    }));

    const movs = ctx.movimentos.map((m) => ({
      chave: `mov-${m.id}`,
      data: m.data,
      tipo: m.tipo,
      descricao: m.tipo === "repasse" ? "Repasse" : "Ajuste",
      detalhe: m.observacao ?? "",
      de: m.de_empresa,
      para: m.para_empresa,
      valor: Number(m.valor),
      // Repasse paga dívida, então entra com o sinal invertido.
      sinal:
        (m.de_empresa === "TransBeleze" ? 1 : -1) * (m.tipo === "repasse" ? -1 : 1),
      movimento: m,
    }));

    const todas = [...devidos, ...movs].sort(
      (a, b) => (a.data ?? "").localeCompare(b.data ?? "") || a.chave.localeCompare(b.chave),
    );

    let acumulado = 0;
    return todas.map((l) => {
      acumulado += l.sinal * l.valor;
      return { ...l, acumulado };
    });
  }, [ctx.devidos, ctx.movimentos]);

  const saldo = ctx.saldoEntreEmpresas;
  const vencidas = ctx.aliquotas.filter((a) => aliquotaVencida(a.atualizada_em));

  // Se divergir, é sinal de que a fórmula espelhada da prévia saiu de sintonia com a view,
  // ou que uma linha ficou fora do extrato. Melhor dizer na tela do que calar.
  const ultimoAcumulado = linhas.length ? linhas[linhas.length - 1].acumulado : 0;
  const divergencia = Math.abs(ultimoAcumulado - saldo) > 0.005;

  const executar = async (acao) => {
    if (salvando) return;
    setSalvando(true);
    try {
      await acao();
      setModal(null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <CabecalhoFinanceiro
        titulo="Entre empresas"
        descricao="Toda ordem mista é paga numa conta só. Quem recebeu repassa à outra a parte das viagens dela, descontando o imposto quando houve nota."
        numeros={[{ rotulo: "Saldo", valor: fraseDoSaldo(saldo), destaque: true }]}
      />

      {vencidas.length > 0 && (
        <Card className="mb-4 flex gap-2.5 border-status-vencida bg-status-vencida px-4 py-3 text-sm text-status-vencida-foreground">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 flex-none" />
          <p>
            A alíquota{vencidas.length > 1 ? "s" : ""} de{" "}
            {vencidas.map((a) => a.empresa).join(" e ")} está sem atualizar há mais de 35
            dias. Ela muda todo mês, e os repasses calculados com a faixa errada transferem
            dinheiro a menos ou a mais.{" "}
            <Link to="/configuracoes/aliquotas" className="font-semibold underline underline-offset-4">
              Conferir alíquotas
            </Link>
          </p>
        </Card>
      )}

      {divergencia && (
        <Card className="mb-4 px-4 py-3 text-sm text-status-vencida-foreground">
          O extrato soma {brl(ultimoAcumulado)} e o saldo do banco é {brl(saldo)}. Me avise:
          é sinal de linha faltando no extrato ou de regra fora de sintonia.
        </Card>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => setModal({ tipo: "ajuste" })}>
          Lançar ajuste
        </Button>
        <Button type="button" onClick={() => setModal({ tipo: "repasse" })}>
          Registrar repasse
        </Button>
      </div>

      {linhas.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          Nada entre as empresas ainda. Um devido aparece aqui quando uma ordem com viagens
          das duas transportadoras é recebida.
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-secondary">
                <TableRow>
                  <TableHead className="text-xs">Data</TableHead>
                  <TableHead className="text-xs">Origem</TableHead>
                  <TableHead className="hidden text-xs md:table-cell">Direção</TableHead>
                  <TableHead className="text-right text-xs">Valor</TableHead>
                  <TableHead className="text-right text-xs">Saldo</TableHead>
                  <TableHead className="w-20"><span className="sr-only">Ações</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((l) => (
                  <TableRow key={l.chave}>
                    <TableCell className="tabular-nums">{dataCurta(l.data)}</TableCell>
                    <TableCell>
                      {l.tipo === "devido" ? (
                        <Link
                          to={`/financeiro/ordens/${l.ordemId}`}
                          className="font-medium underline-offset-4 hover:underline">
                          {l.descricao}
                        </Link>
                      ) : (
                        <span className="font-medium">{l.descricao}</span>
                      )}
                      {l.detalhe && (
                        <span className="block text-xs text-muted-foreground">{l.detalhe}</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                      {l.tipo === "repasse"
                        ? `${l.de} pagou à ${l.para}`
                        : `${l.de} deve à ${l.para}`}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{brl(l.valor)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {/* O acumulado também por extenso seria longo demais numa coluna;
                          aqui o sinal basta, porque o saldo em frase está no cabeçalho. */}
                      {brl(Math.abs(l.acumulado))}
                      <span className="block text-xs font-normal text-muted-foreground">
                        {Math.abs(l.acumulado) < 0.005
                          ? "zerado"
                          : l.acumulado > 0
                            ? "TB deve"
                            : "Rohan deve"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {/* Devido não se edita: ele é derivado da ordem. Para mudá-lo, muda-se
                          a ordem — desfazendo o recebimento. */}
                      {l.movimento && (
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Editar ${l.descricao.toLowerCase()} de ${dataCurta(l.data)}`}
                            onClick={() => setModal({ tipo: l.tipo, movimento: l.movimento })}>
                            <Pencil aria-hidden="true" className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Excluir ${l.descricao.toLowerCase()} de ${dataCurta(l.data)}`}
                            disabled={salvando}
                            onClick={() =>
                              executar(async () => {
                                await ctx.excluirMovimento(l.movimento.id);
                                toast.success("Movimento excluído.");
                              })
                            }>
                            <X aria-hidden="true" className="size-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {modal && (
        <ModalMovimento
          key={modal.movimento?.id ?? `novo-${modal.tipo}`}
          tipo={modal.tipo}
          movimento={modal.movimento}
          onFechar={() => setModal(null)}
          onConfirmar={(campos) =>
            executar(async () => {
              if (modal.movimento) {
                await ctx.editarMovimento(modal.movimento.id, campos);
                toast.success("Movimento atualizado.");
              } else {
                await ctx.salvarMovimento(campos);
                toast.success(modal.tipo === "repasse" ? "Repasse registrado." : "Ajuste lançado.");
              }
            })
          }
        />
      )}
    </>
  );
}
