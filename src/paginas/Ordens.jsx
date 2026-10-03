import { useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import CabecalhoFinanceiro from "@/components/CabecalhoFinanceiro";
import EtiquetaSituacao from "@/components/EtiquetaSituacao";
import ResumoDoPeriodo from "@/components/ResumoDoPeriodo";
import {
  ehDoLegado, elegivelParaOrdem, estaVencida, rotuloNota, totaisPorEmpresa,
} from "@/lib/ordem";
import { brl, dataCurta } from "@/lib/formato";
import { hojeISO } from "@/lib/campos";

const FILTROS = [
  { chave: "todas", rotulo: "Todas" },
  { chave: "aberta", rotulo: "Abertas" },
  { chave: "fechada", rotulo: "Fechadas" },
  { chave: "recebida", rotulo: "Recebidas" },
];

// O resumo por empresa de uma ordem sai da view `ordens_resumo`, que faz a soma no banco.
// O Number() existe porque `numeric` do Postgres pode chegar como string no JSON.
function somarOrdens(ordens, resumoPorId) {
  const t = { Rohan: 0, TransBeleze: 0 };
  for (const o of ordens) {
    const r = resumoPorId[o.id];
    if (!r) continue;
    t.Rohan += Number(r.total_rohan ?? 0);
    t.TransBeleze += Number(r.total_transbeleze ?? 0);
  }
  return t;
}

export default function Ordens() {
  const ctx = useOutletContext();
  const [filtro, setFiltro] = useState("todas");
  const [busca, setBusca] = useState("");
  const hoje = hojeISO();
  const mesAtual = hoje.slice(0, 7);

  // A quitação de legado não é cobrança: ela não foi enviada a ninguém e não tem data de
  // recebimento. Fica fora desta lista, e aparece na tela Legado a conferir.
  const ordens = useMemo(
    () => ctx.listaOrdens.filter((o) => !o.legado),
    [ctx.listaOrdens],
  );

  const contagem = useMemo(() => {
    const c = { todas: ordens.length, aberta: 0, fechada: 0, recebida: 0 };
    for (const o of ordens) c[o.status] += 1;
    return c;
  }, [ordens]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const lista = ordens.filter((o) => {
      if (filtro !== "todas" && o.status !== filtro) return false;
      if (termo && !(o.clientes?.nome ?? "").toLowerCase().includes(termo)) return false;
      return true;
    });

    // Vencidas primeiro, depois fechadas pelo vencimento, abertas e recebidas — a ordem do
    // protótipo, que é a ordem da urgência.
    const peso = (o) => {
      if (estaVencida(o, hoje)) return 0;
      if (o.status === "fechada") return 1;
      if (o.status === "aberta") return 2;
      return 3;
    };
    return [...lista].sort(
      (a, b) =>
        peso(a) - peso(b) ||
        (a.vencimento ?? "9999").localeCompare(b.vencimento ?? "9999") ||
        b.id - a.id,
    );
  }, [ordens, filtro, busca, hoje]);

  const vencidas = useMemo(() => ordens.filter((o) => estaVencida(o, hoje)), [ordens, hoje]);
  const fechadas = useMemo(() => ordens.filter((o) => o.status === "fechada"), [ordens]);

  const recebidasNoMes = useMemo(
    () =>
      ordens.filter(
        (o) => o.status === "recebida" && (o.recebida_em ?? "").startsWith(mesAtual),
      ),
    [ordens, mesAtual],
  );

  const aFaturar = useMemo(
    () =>
      totaisPorEmpresa(
        ctx.listaViagens.filter(
          (v) => !v.ordem_id && elegivelParaOrdem(v) && !ehDoLegado(v, ctx.inicioControle),
        ),
      ).total,
    [ctx.listaViagens, ctx.inicioControle],
  );

  const totalVencido = somarOrdens(vencidas, ctx.resumoOrdens);
  const totalFechadas = somarOrdens(fechadas, ctx.resumoOrdens);

  const nomeDoMes = new Date(`${hoje}T12:00:00`).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  return (
    <>
      <CabecalhoFinanceiro
        titulo="Ordens"
        descricao="Cobranças enviadas aos clientes e o que já entrou."
        numeros={[
          ...(vencidas.length
            ? [{ rotulo: `Vencido em ${vencidas.length}`, valor: brl(totalVencido.Rohan + totalVencido.TransBeleze) }]
            : []),
          {
            rotulo: `A receber em ${fechadas.length} ${fechadas.length === 1 ? "ordem" : "ordens"}`,
            valor: brl(totalFechadas.Rohan + totalFechadas.TransBeleze),
            destaque: true,
          },
        ]}
      />

      <ResumoDoPeriodo
        periodo={nomeDoMes}
        recebido={somarOrdens(recebidasNoMes, ctx.resumoOrdens)}
        aReceber={totalFechadas}
        aFaturar={aFaturar}
      />

      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por situação">
          {FILTROS.map((f) => (
            <button
              key={f.chave}
              type="button"
              aria-pressed={filtro === f.chave}
              onClick={() => setFiltro(f.chave)}
              className={`h-11 rounded-full border px-4 text-sm transition-colors ${
                filtro === f.chave
                  ? "border-transparent bg-brand-green font-semibold text-white"
                  : "bg-card hover:bg-secondary"
              }`}>
              {f.rotulo} ({contagem[f.chave]})
            </button>
          ))}
        </div>

        <Input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar cliente"
          aria-label="Buscar cliente"
          className="h-11 sm:max-w-64"
        />
      </div>

      {visiveis.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          {ordens.length === 0
            ? "Nenhuma ordem criada ainda. Comece em A faturar, escolhendo viagens de um cliente."
            : "Nenhuma ordem com esse filtro."}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-secondary">
                <TableRow>
                  <TableHead className="text-xs">Ordem</TableHead>
                  <TableHead className="text-xs">Cliente</TableHead>
                  <TableHead className="text-xs">Situação</TableHead>
                  <TableHead className="hidden text-xs md:table-cell">Enviada</TableHead>
                  <TableHead className="hidden text-xs sm:table-cell">Vencimento</TableHead>
                  <TableHead className="hidden text-xs lg:table-cell">Nota</TableHead>
                  <TableHead className="text-right text-xs">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.map((o) => {
                  const r = ctx.resumoOrdens[o.id];
                  return (
                    <TableRow key={o.id} className="hover:bg-secondary/50">
                      <TableCell className="font-semibold">
                        {/* O link cobre a célula inteira; a linha toda não é clicável para
                            o alvo de toque continuar previsível no celular. */}
                        <Link
                          to={`/financeiro/ordens/${o.id}`}
                          className="block py-1 underline-offset-4 hover:underline">
                          #{o.id}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-40 truncate">{o.clientes?.nome ?? "—"}</TableCell>
                      <TableCell><EtiquetaSituacao ordem={o} /></TableCell>
                      <TableCell className="hidden tabular-nums md:table-cell">
                        {o.fechada_em ? dataCurta(o.fechada_em) : "Não enviada"}
                      </TableCell>
                      <TableCell className="hidden tabular-nums sm:table-cell">
                        {dataCurta(o.vencimento)}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">{rotuloNota(o)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {brl(Number(r?.total ?? 0))}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </>
  );
}
