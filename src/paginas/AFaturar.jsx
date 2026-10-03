import { useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import CabecalhoFinanceiro from "@/components/CabecalhoFinanceiro";
import ListaAgrupadaPorCliente from "@/components/ListaAgrupadaPorCliente";
import { agruparPorCliente, ehDoLegado, elegivelParaOrdem, totaisPorEmpresa } from "@/lib/ordem";
import { brl, dataBR } from "@/lib/formato";

// Viagens realizadas que ainda não estão em nenhuma ordem, a partir do início do controle.
// As anteriores a essa data ficam na tela Legado a conferir: são de antes do sistema, e
// quase todas já foram pagas.
export default function AFaturar() {
  const ctx = useOutletContext();
  const navigate = useNavigate();
  const [salvando, setSalvando] = useState(false);

  const viagens = useMemo(
    () =>
      ctx.listaViagens.filter(
        (v) =>
          !v.ordem_id &&
          elegivelParaOrdem(v) &&
          !ehDoLegado(v, ctx.inicioControle),
      ),
    [ctx.listaViagens, ctx.inicioControle],
  );

  const grupos = useMemo(() => agruparPorCliente(viagens), [viagens]);
  const totais = useMemo(() => totaisPorEmpresa(viagens), [viagens]);

  // Ordem aberta por cliente: com uma, as viagens selecionadas podem ir para ela em vez de
  // criar outra. Duas ordens abertas do mesmo cliente são possíveis no banco, mas aí não há
  // escolha óbvia — então o botão de incluir só aparece quando existe exatamente uma.
  const ordemAbertaDoCliente = (clienteId) => {
    const abertas = ctx.listaOrdens.filter(
      (o) => o.cliente_id === clienteId && o.status === "aberta" && !o.legado,
    );
    return abertas.length === 1 ? abertas[0] : null;
  };

  const executar = async (acao, limparSelecao) => {
    if (salvando) return;
    setSalvando(true);
    try {
      await acao();
      limparSelecao();
    } catch (err) {
      // A mensagem vem do banco (TRV01) escrita para ser lida assim.
      toast.error(err.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <CabecalhoFinanceiro
        titulo="A faturar"
        descricao={
          ctx.inicioControle
            ? `Viagens realizadas a partir de ${dataBR(ctx.inicioControle)} que ainda não estão em nenhuma ordem.`
            : "Viagens realizadas que ainda não estão em nenhuma ordem."
        }
        numeros={[
          { rotulo: "Rohan", valor: brl(totais.Rohan) },
          { rotulo: "TransBeleze", valor: brl(totais.TransBeleze) },
          {
            rotulo: `Total em ${viagens.length} ${viagens.length === 1 ? "viagem" : "viagens"}`,
            valor: brl(totais.total),
            destaque: true,
          },
        ]}
      />

      <ListaAgrupadaPorCliente
        grupos={grupos}
        vazio="Nenhuma viagem a faturar. Tudo que foi realizado já está em alguma ordem."
        acoes={({ grupo, idsSelecionados, limparSelecao }) => {
          const aberta = ordemAbertaDoCliente(grupo.clienteId);
          const quantas = idsSelecionados.length;

          return (
            <>
              {aberta && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={salvando}
                  onClick={() =>
                    executar(async () => {
                      await ctx.incluirViagensNaOrdem(aberta.id, idsSelecionados);
                      toast.success(`${quantas} viagem(ns) incluída(s) na ordem #${aberta.id}.`);
                    }, limparSelecao)
                  }>
                  Incluir na ordem #{aberta.id}
                </Button>
              )}

              <Button
                type="button"
                disabled={salvando}
                onClick={() =>
                  executar(async () => {
                    const ordem = await ctx.criarOrdemComViagens(grupo.clienteId, idsSelecionados);
                    toast.success(`Ordem #${ordem.id} criada com ${quantas} viagem(ns).`);
                    navigate(`/financeiro/ordens/${ordem.id}`);
                  }, limparSelecao)
                }>
                Criar ordem com {quantas} {quantas === 1 ? "viagem" : "viagens"}
              </Button>
            </>
          );
        }}
      />
    </>
  );
}
