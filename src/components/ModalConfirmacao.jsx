import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Confirmação de remoção, usada por viagem e por despesa.
//
// Viagem tem dois níveis: cancelar (reversível, sai dos cálculos, fica no histórico) e,
// escondida atrás dele, a exclusão definitiva. Despesa não tem status, então não existe
// meio-termo — abre direto no nível de exclusão.
//
// O nível 2 é alcançado trocando o modo DENTRO do mesmo diálogo, nunca abrindo um
// segundo por cima: diálogos aninhados no Radix deixam dois overlays empilhados e é
// assim que o body fica preso com pointer-events: none.
//
// Não usa AlertDialog porque @radix-ui/react-alert-dialog não está instalado, e o que
// ele acrescentaria aqui (role e não fechar no clique fora) sai com duas linhas —
// fechar sem querer aborta a ação, que é o lado seguro.
export default function ModalConfirmacao({ alvo, onCancelar, onExcluir, onFechar }) {
  const podeCancelar = Boolean(alvo?.permiteCancelar);
  const [modo, setModo] = useState(podeCancelar ? "cancelar" : "excluir");
  const [confirmacaoId, setConfirmacaoId] = useState("");
  const [processando, setProcessando] = useState(false);

  if (!alvo) return null;

  const excluir = modo === "excluir";
  // Digitar o ID prova duas coisas de uma vez: a intenção e que é o registro certo.
  // Um texto fixo como "EXCLUIR" só prova a primeira.
  const idConfere = confirmacaoId.trim() === String(alvo.id);

  const executar = async (acao) => {
    setProcessando(true);
    try {
      await acao(alvo.id);
    } finally {
      setProcessando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent className="sm:max-w-sm" role="alertdialog">
        <DialogHeader>
          <DialogTitle>
            {excluir ? "Excluir permanentemente?" : `Cancelar esta ${alvo.rotulo}?`}
          </DialogTitle>
          <DialogDescription>{alvo.resumo}</DialogDescription>
        </DialogHeader>

        {excluir ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Esta ação <strong className="text-foreground">não pode ser desfeita</strong>. O
              registro será apagado do banco.
              {podeCancelar && " Se você só quer tirá-la dos relatórios, use Cancelar."}
            </p>
            <div className="space-y-1.5">
              <p className="text-sm">
                Digite <strong className="tabular-nums">{alvo.id}</strong> para confirmar:
              </p>
              <Input
                value={confirmacaoId}
                onChange={(e) => setConfirmacaoId(e.target.value)}
                inputMode="numeric"
                autoComplete="off"
                placeholder={String(alvo.id)}
              />
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Ela continua na lista marcada como{" "}
            <strong className="text-foreground">Cancelada</strong> e sai de todos os cálculos
            financeiros. Você pode reativá-la depois.
          </p>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => (excluir && podeCancelar ? setModo("cancelar") : onFechar())}
            disabled={processando}>
            Voltar
          </Button>
          <Button
            variant="destructive"
            disabled={processando || (excluir && !idConfere)}
            onClick={() => executar(excluir ? onExcluir : onCancelar)}>
            {processando ? "Aguarde..." : excluir ? "Excluir" : `Cancelar ${alvo.rotulo}`}
          </Button>
        </DialogFooter>

        {!excluir && (
          <button
            type="button"
            onClick={() => setModo("excluir")}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-destructive mx-auto">
            Excluir permanentemente
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}
