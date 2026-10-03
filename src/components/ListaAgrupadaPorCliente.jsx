import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import EtiquetaEmpresa from "@/components/EtiquetaEmpresa";
import { brl, dataCurta, rota } from "@/lib/formato";
import { totaisPorEmpresa } from "@/lib/ordem";

// Um cartão por cliente, com a tabela de viagens, seleção e um rodapé que resume o que foi
// marcado. É a mesma estrutura nas telas A faturar e Legado a conferir — no protótipo as
// duas só diferem nas ações do rodapé, que entram por `acoes`.
//
// A seleção vive aqui, por grupo, e é zerada quando a ação termina: depois de criar uma
// ordem com quatro viagens, aquelas viagens saem da lista, e manter os ids marcados
// deixaria o rodapé somando algo que não está mais na tela.
export default function ListaAgrupadaPorCliente({ grupos, acoes, vazio }) {
  const [aberto, setAberto] = useState(() => new Set());
  const [selecao, setSelecao] = useState(() => new Map());

  if (!grupos.length) {
    return (
      <Card className="p-8 text-center text-muted-foreground">{vazio}</Card>
    );
  }

  const alternarGrupo = (clienteId) =>
    setAberto((prev) => {
      const proximo = new Set(prev);
      if (proximo.has(clienteId)) proximo.delete(clienteId);
      else proximo.add(clienteId);
      return proximo;
    });

  const idsSelecionados = (clienteId) => selecao.get(clienteId) ?? new Set();

  const alternarViagem = (clienteId, viagemId) =>
    setSelecao((prev) => {
      const proximo = new Map(prev);
      const atual = new Set(proximo.get(clienteId) ?? []);
      if (atual.has(viagemId)) atual.delete(viagemId);
      else atual.add(viagemId);
      proximo.set(clienteId, atual);
      return proximo;
    });

  const alternarTodas = (grupo) =>
    setSelecao((prev) => {
      const proximo = new Map(prev);
      const atual = idsSelecionados(grupo.clienteId);
      const todas = grupo.viagens.length > 0 && atual.size === grupo.viagens.length;
      proximo.set(grupo.clienteId, todas ? new Set() : new Set(grupo.viagens.map((v) => v.id)));
      return proximo;
    });

  const limpar = (clienteId) =>
    setSelecao((prev) => {
      const proximo = new Map(prev);
      proximo.delete(clienteId);
      return proximo;
    });

  return (
    <div className="flex flex-col gap-3">
      {grupos.map((grupo) => {
        const estaAberto = aberto.has(grupo.clienteId);
        const marcadas = idsSelecionados(grupo.clienteId);
        const viagensMarcadas = grupo.viagens.filter((v) => marcadas.has(v.id));
        const totalMarcado = totaisPorEmpresa(viagensMarcadas).total;

        return (
          <Card key={grupo.clienteId} className="overflow-hidden">
            <button
              type="button"
              onClick={() => alternarGrupo(grupo.clienteId)}
              aria-expanded={estaAberto}
              className="flex w-full items-center justify-between gap-3 border-b px-4 py-4 text-left hover:bg-secondary/50 md:px-5">
              <span className="flex min-w-0 items-center gap-3">
                {estaAberto ? (
                  <ChevronDown aria-hidden="true" className="size-5 flex-none text-muted-foreground" />
                ) : (
                  <ChevronRight aria-hidden="true" className="size-5 flex-none text-muted-foreground" />
                )}
                <span className="truncate font-semibold">{grupo.nome}</span>
                <span className="flex-none text-sm text-muted-foreground">
                  {grupo.viagens.length} {grupo.viagens.length === 1 ? "viagem" : "viagens"}
                </span>
              </span>

              <span className="flex flex-none items-center gap-3 tabular-nums md:gap-5">
                {/* No celular só o total: os dois parciais não cabem ao lado do nome. */}
                <span className="hidden text-sm text-muted-foreground md:inline">
                  Rohan {brl(grupo.totais.Rohan)}
                </span>
                <span className="hidden text-sm text-muted-foreground md:inline">
                  TransBeleze {brl(grupo.totais.TransBeleze)}
                </span>
                <strong>{brl(grupo.totais.total)}</strong>
              </span>
            </button>

            {estaAberto && (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-secondary">
                      <TableRow>
                        <TableHead className="w-10">
                          <input
                            type="checkbox"
                            className="accent-brand-gold"
                            aria-label={`Selecionar todas as viagens de ${grupo.nome}`}
                            checked={marcadas.size === grupo.viagens.length}
                            onChange={() => alternarTodas(grupo)}
                          />
                        </TableHead>
                        <TableHead className="text-xs">Data</TableHead>
                        <TableHead className="hidden text-xs md:table-cell">Trajeto</TableHead>
                        <TableHead className="hidden text-xs sm:table-cell">Motorista</TableHead>
                        <TableHead className="text-xs">Empresa</TableHead>
                        <TableHead className="text-right text-xs">Frete</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {grupo.viagens.map((v) => (
                        <TableRow key={v.id}>
                          <TableCell>
                            <input
                              type="checkbox"
                              className="accent-brand-gold"
                              aria-label={`Selecionar viagem #${v.id}`}
                              checked={marcadas.has(v.id)}
                              onChange={() => alternarViagem(grupo.clienteId, v.id)}
                            />
                          </TableCell>
                          <TableCell className="tabular-nums">{dataCurta(v.data)}</TableCell>
                          <TableCell className="hidden md:table-cell">
                            {rota(v) || <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            {v.motoristas?.nome ?? "—"}
                          </TableCell>
                          <TableCell>
                            <EtiquetaEmpresa empresa={v.empresa} />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {brl(v.valor_frete)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* O rodapé só aparece com algo marcado: sem seleção, não há ação possível,
                    e um rodapé permanente com botões desabilitados só ocupa espaço. */}
                {marcadas.size > 0 && (
                  <div className="flex flex-col gap-3 border-t bg-secondary/40 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-5">
                    <p className="text-sm tabular-nums">
                      <strong>{marcadas.size}</strong>{" "}
                      {marcadas.size === 1 ? "selecionada" : "selecionadas"}, somando{" "}
                      <strong>{brl(totalMarcado)}</strong>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {acoes({
                        grupo,
                        viagensSelecionadas: viagensMarcadas,
                        idsSelecionados: [...marcadas],
                        limparSelecao: () => limpar(grupo.clienteId),
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </Card>
        );
      })}
    </div>
  );
}
