import { useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router";
import { toast } from "sonner";
import { ChevronLeft, Plus, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import EtiquetaEmpresa from "@/components/EtiquetaEmpresa";
import EtiquetaSituacao from "@/components/EtiquetaSituacao";
import ModalFecharOrdem from "@/components/ModalFecharOrdem";
import ModalReceberOrdem from "@/components/ModalReceberOrdem";
import ModalReabrirOrdem from "@/components/ModalReabrirOrdem";
import { elegivelParaOrdem, linhaDoTempo, rotuloNota, totaisPorEmpresa } from "@/lib/ordem";
import { brl, dataCurta, rota } from "@/lib/formato";

const FORMAS = {
  pix: "PIX", boleto: "Boleto", transferencia: "Transferência", dinheiro: "Dinheiro",
};

export default function Ordem() {
  const ctx = useOutletContext();
  const { id } = useParams();
  const navigate = useNavigate();
  const ordemId = Number(id);

  const [modal, setModal] = useState(null); // 'fechar' | 'receber' | 'reabrir'
  const [incluindo, setIncluindo] = useState(false);
  const [marcadas, setMarcadas] = useState(() => new Set());
  const [salvando, setSalvando] = useState(false);

  const ordem = ctx.listaOrdens.find((o) => o.id === ordemId);

  const viagens = useMemo(
    () =>
      ctx.listaViagens
        .filter((v) => v.ordem_id === ordemId)
        .sort((a, b) => a.data.localeCompare(b.data)),
    [ctx.listaViagens, ordemId],
  );

  // Candidatas a entrar: do mesmo cliente, realizadas, sem ordem. A data não limita —
  // viagem antiga pode entrar numa ordem normal; só o contrário é barrado.
  const candidatas = useMemo(
    () =>
      ordem
        ? ctx.listaViagens.filter(
            (v) => !v.ordem_id && v.cliente_id === ordem.cliente_id && elegivelParaOrdem(v),
          )
        : [],
    [ctx.listaViagens, ordem],
  );

  const totais = totaisPorEmpresa(viagens);

  if (!ordem) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        Ordem #{id} não encontrada. Ela pode ter sido excluída.
        <div className="mt-4">
          <Button asChild variant="outline">
            <Link to="/financeiro/ordens">Voltar para Ordens</Link>
          </Button>
        </div>
      </Card>
    );
  }

  const aberta = ordem.status === "aberta";
  const travada = !aberta;

  const executar = async (acao) => {
    if (salvando) return;
    setSalvando(true);
    try {
      await acao();
      setModal(null);
    } catch (err) {
      // Mensagem do banco (TRV01), escrita para ser mostrada assim.
      toast.error(err.message);
    } finally {
      setSalvando(false);
    }
  };

  const alternarCandidata = (viagemId) =>
    setMarcadas((prev) => {
      const proximo = new Set(prev);
      if (proximo.has(viagemId)) proximo.delete(viagemId);
      else proximo.add(viagemId);
      return proximo;
    });

  return (
    <>
      <nav aria-label="Trilha" className="mb-3 flex items-center gap-1 text-sm text-muted-foreground">
        <Link to="/financeiro/ordens" className="flex items-center gap-1 hover:text-foreground">
          <ChevronLeft aria-hidden="true" className="size-4" />
          Ordens
        </Link>
        <span aria-hidden="true">/</span>
        <span>#{ordem.id}</span>
      </nav>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-brand-green">
          Ordem #{ordem.id}, {ordem.clientes?.nome ?? "sem cliente"}
        </h1>
        <EtiquetaSituacao ordem={ordem} />
      </div>

      <Card className="mb-4 grid gap-4 p-4 sm:grid-cols-2 md:grid-cols-4 md:p-5">
        {linhaDoTempo(ordem).map(([rotulo, valor]) => (
          <div key={rotulo}>
            <p className="text-xs text-muted-foreground">{rotulo}</p>
            <p className="font-semibold tabular-nums">{valor}</p>
          </div>
        ))}
        <div>
          <p className="text-xs text-muted-foreground">Forma</p>
          <p className="font-semibold">{FORMAS[ordem.forma_pagamento] ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Nota fiscal</p>
          <p className="font-semibold">{rotuloNota(ordem)}</p>
        </div>
        {ordem.motivo_reabertura && (
          <div className="sm:col-span-2 md:col-span-4">
            <p className="text-xs text-muted-foreground">Motivo da última reabertura</p>
            <p className="text-sm">{ordem.motivo_reabertura}</p>
          </div>
        )}
      </Card>

      <Card className="mb-4 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 md:px-5">
          <h2 className="font-semibold">
            Viagens <span className="text-muted-foreground">({viagens.length})</span>
          </h2>
          {travada && (
            <p className="text-xs text-muted-foreground">
              Travadas: para mudar valor, empresa ou cliente, reabra a ordem.
            </p>
          )}
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-secondary">
              <TableRow>
                <TableHead className="text-xs">Data</TableHead>
                <TableHead className="hidden text-xs md:table-cell">Trajeto</TableHead>
                <TableHead className="hidden text-xs sm:table-cell">Motorista</TableHead>
                <TableHead className="text-xs">Empresa</TableHead>
                <TableHead className="text-right text-xs">Frete</TableHead>
                {aberta && <TableHead className="w-12"><span className="sr-only">Tirar</span></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {viagens.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={aberta ? 6 : 5} className="py-8 text-center text-muted-foreground">
                    Nenhuma viagem nesta ordem. Inclua ao menos uma para poder fechá-la.
                  </TableCell>
                </TableRow>
              ) : (
                viagens.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="tabular-nums">{dataCurta(v.data)}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      {rota(v) || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{v.motoristas?.nome ?? "—"}</TableCell>
                    <TableCell><EtiquetaEmpresa empresa={v.empresa} /></TableCell>
                    <TableCell className="text-right tabular-nums">{brl(v.valor_frete)}</TableCell>
                    {aberta && (
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Tirar a viagem de ${dataCurta(v.data)} da ordem`}
                          disabled={salvando}
                          onClick={() =>
                            executar(async () => {
                              await ctx.tirarViagemDaOrdem(v.id);
                              toast.success("Viagem devolvida para A faturar.");
                            })
                          }>
                          <X aria-hidden="true" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-4 border-t bg-secondary/40 px-4 py-3 tabular-nums md:px-5">
          <span className="text-sm text-muted-foreground">Rohan {brl(totais.Rohan)}</span>
          <span className="text-sm text-muted-foreground">
            TransBeleze {brl(totais.TransBeleze)}
          </span>
          <strong className="text-lg">Total {brl(totais.total)}</strong>
        </div>
      </Card>

      {/* Incluir viagens pelo detalhe, e não só pela tela A faturar: lá o botão "incluir na
          ordem #N" só aparece quando o cliente tem UMA ordem aberta, e com duas não haveria
          como escolher. */}
      {aberta && (
        <Card className="mb-4 p-4 md:p-5">
          {!incluindo ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setIncluindo(true)}
              disabled={candidatas.length === 0}>
              <Plus aria-hidden="true" />
              {candidatas.length === 0
                ? "Nenhuma viagem deste cliente a faturar"
                : `Incluir viagens (${candidatas.length} disponíveis)`}
            </Button>
          ) : (
            <>
              <h2 className="mb-3 font-semibold">Viagens deste cliente, ainda sem ordem</h2>
              <div className="flex flex-col gap-1.5">
                {candidatas.map((v) => (
                  <Label
                    key={v.id}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 hover:bg-secondary/50">
                    <input
                      type="checkbox"
                      className="accent-brand-gold"
                      checked={marcadas.has(v.id)}
                      onChange={() => alternarCandidata(v.id)}
                    />
                    <span className="tabular-nums">{dataCurta(v.data)}</span>
                    <EtiquetaEmpresa empresa={v.empresa} />
                    <span className="truncate text-muted-foreground">{rota(v)}</span>
                    <span className="ml-auto tabular-nums">{brl(v.valor_frete)}</span>
                  </Label>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIncluindo(false);
                    setMarcadas(new Set());
                  }}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  disabled={salvando || marcadas.size === 0}
                  onClick={() =>
                    executar(async () => {
                      await ctx.incluirViagensNaOrdem(ordem.id, [...marcadas]);
                      toast.success(`${marcadas.size} viagem(ns) incluída(s).`);
                      setMarcadas(new Set());
                      setIncluindo(false);
                    })
                  }>
                  Incluir {marcadas.size > 0 ? marcadas.size : ""}{" "}
                  {marcadas.size === 1 ? "viagem" : "viagens"}
                </Button>
              </div>
            </>
          )}
        </Card>
      )}

      <FormularioNota ordem={ordem} salvando={salvando} onSalvar={(dados) =>
        executar(async () => {
          await ctx.editarNota(ordem.id, dados);
          toast.success("Nota atualizada.");
        })
      } />

      {/* Ações do estado atual. Um só botão dourado por área: a ação principal do estado. */}
      <div className="flex flex-wrap gap-2">
        {aberta && (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={salvando}
              onClick={() =>
                executar(async () => {
                  await ctx.excluirOrdem(ordem.id);
                  toast.success("Ordem excluída. As viagens voltaram para A faturar.");
                  navigate("/financeiro/ordens");
                })
              }>
              Excluir ordem
            </Button>
            <Button type="button" disabled={salvando || viagens.length === 0} onClick={() => setModal("fechar")}>
              Fechar ordem e enviar ao cliente
            </Button>
          </>
        )}

        {ordem.status === "fechada" && (
          <>
            <Button type="button" variant="outline" disabled={salvando} onClick={() => setModal("reabrir")}>
              Reabrir ordem
            </Button>
            <Button type="button" disabled={salvando} onClick={() => setModal("receber")}>
              Registrar recebimento
            </Button>
          </>
        )}

        {ordem.status === "recebida" && !ordem.legado && (
          <Button
            type="button"
            variant="outline"
            disabled={salvando}
            onClick={() =>
              executar(async () => {
                await ctx.desfazerRecebimento(ordem.id);
                toast.success("Recebimento desfeito. A ordem voltou para a receber.");
              })
            }>
            Desfazer recebimento
          </Button>
        )}
      </div>

      {modal === "fechar" && (
        <ModalFecharOrdem
          ordem={ordem}
          total={totais.total}
          onFechar={() => setModal(null)}
          onConfirmar={(dados) =>
            executar(async () => {
              await ctx.fecharOrdem(ordem.id, dados);
              toast.success(`Ordem #${ordem.id} fechada.`);
            })
          }
        />
      )}

      {modal === "receber" && (
        <ModalReceberOrdem
          ordem={ordem}
          total={totais.total}
          onFechar={() => setModal(null)}
          onConfirmar={(dados) =>
            executar(async () => {
              await ctx.receberOrdem(ordem.id, dados);
              toast.success(`Recebimento da ordem #${ordem.id} registrado.`);
            })
          }
        />
      )}

      {modal === "reabrir" && (
        <ModalReabrirOrdem
          ordem={ordem}
          onFechar={() => setModal(null)}
          onConfirmar={(motivo) =>
            executar(async () => {
              await ctx.reabrirOrdem(ordem.id, motivo);
              toast.success(`Ordem #${ordem.id} reaberta.`);
            })
          }
        />
      )}
    </>
  );
}

// Número e data da nota são editáveis em qualquer estado, inclusive na recebida: a nota
// costuma sair depois do envio da cobrança, e às vezes depois do pagamento.
function FormularioNota({ ordem, salvando, onSalvar }) {
  const [numero, setNumero] = useState(ordem.numero_nota ?? "");
  const [data, setData] = useState(ordem.data_nota ?? "");

  const mudou = numero !== (ordem.numero_nota ?? "") || data !== (ordem.data_nota ?? "");

  return (
    <Card className="mb-4 p-4 md:p-5">
      <h2 className="mb-3 font-semibold">Nota fiscal</h2>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="space-y-1.5 sm:w-40">
          <Label htmlFor="nota-numero">Número</Label>
          <Input
            id="nota-numero"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            placeholder="Ex: 431"
          />
        </div>
        <div className="space-y-1.5 sm:w-48">
          <Label htmlFor="nota-data">Data da nota</Label>
          <Input id="nota-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={salvando || !mudou}
          onClick={() => onSalvar({ numero_nota: numero || null, data_nota: data || null })}>
          Salvar nota
        </Button>
      </div>
      {!ordem.com_nota && (
        <p className="mt-3 text-xs text-muted-foreground">
          Esta ordem foi fechada sem nota. Preencher o número aqui não muda isso — se a nota
          passou a ser necessária, reabra e feche de novo marcando a nota.
        </p>
      )}
    </Card>
  );
}
