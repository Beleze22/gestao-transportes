import { useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import CabecalhoFinanceiro from "@/components/CabecalhoFinanceiro";
import ListaAgrupadaPorCliente from "@/components/ListaAgrupadaPorCliente";
import { agruparPorCliente, ehDoLegado, elegivelParaOrdem, totaisPorEmpresa } from "@/lib/ordem";
import { brl, dataBR } from "@/lib/formato";

// Viagens de antes do início do controle que não estão em nenhuma ordem. A maioria já foi
// paga e só precisa ser carimbada como quitada; o resto ainda está a receber e vai para
// uma ordem normal. A revisão é feita aos poucos, cliente por cliente.
export default function Legado() {
  const ctx = useOutletContext();
  const navigate = useNavigate();
  const [salvando, setSalvando] = useState(false);

  const { aConferir, jaConferidas } = useMemo(() => {
    const antigas = ctx.listaViagens.filter(
      (v) => ehDoLegado(v, ctx.inicioControle) && elegivelParaOrdem(v),
    );
    return {
      aConferir: antigas.filter((v) => !v.ordem_id),
      jaConferidas: antigas.filter((v) => v.ordem_id),
    };
  }, [ctx.listaViagens, ctx.inicioControle]);

  const grupos = useMemo(() => agruparPorCliente(aConferir), [aConferir]);
  const totais = useMemo(() => totaisPorEmpresa(aConferir), [aConferir]);

  const executar = async (acao, limparSelecao) => {
    if (salvando) return;
    setSalvando(true);
    try {
      await acao();
      limparSelecao();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <CabecalhoFinanceiro
        titulo="Legado a conferir"
        descricao={
          ctx.inicioControle
            ? `Viagens anteriores a ${dataBR(ctx.inicioControle)} que não estão em nenhuma ordem. O que já foi pago, quite no legado. O que ainda está a receber, inclua numa ordem normal.`
            : "Viagens anteriores ao início do controle que não estão em nenhuma ordem."
        }
        numeros={[
          { rotulo: "A conferir", valor: String(aConferir.length) },
          { rotulo: "Já conferidas", valor: String(jaConferidas.length) },
          { rotulo: "Ainda sem destino", valor: brl(totais.total), destaque: true },
        ]}
      />

      <ListaAgrupadaPorCliente
        grupos={grupos}
        vazio="Legado conferido. Nenhuma viagem anterior ao início do controle ficou sem destino."
        acoes={({ grupo, idsSelecionados, limparSelecao }) => {
          const quantas = idsSelecionados.length;

          return (
            <>
              {/* Ordem normal, para o que ainda vai ser cobrado. Uma viagem antiga pode
                  entrar numa ordem normal sem restrição — só o contrário é barrado. */}
              <Button
                type="button"
                variant="outline"
                disabled={salvando}
                onClick={() =>
                  executar(async () => {
                    const ordem = await ctx.criarOrdemComViagens(grupo.clienteId, idsSelecionados);
                    toast.success(`Ordem #${ordem.id} criada com ${quantas} viagem(ns).`);
                    navigate(`/financeiro/ordens/${ordem.id}`);
                  }, limparSelecao)
                }>
                Ainda a receber: incluir em ordem
              </Button>

              {/* Quitação de legado: carimbo de "pago antes do sistema". Não tem data de
                  recebimento, então não entra no recebido de nenhum período — e dá para
                  desfazer, tirando a viagem de volta. */}
              <Button
                type="button"
                disabled={salvando}
                onClick={() =>
                  executar(async () => {
                    await ctx.quitarNoLegado(grupo.clienteId, idsSelecionados);
                    toast.success(
                      `${quantas} viagem(ns) de ${grupo.nome} quitada(s) no legado.`,
                    );
                  }, limparSelecao)
                }>
                Já pagas: quitar no legado
              </Button>
            </>
          );
        }}
      />
    </>
  );
}
