import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { avisoDeReabertura } from "@/lib/ordem";

// Reabrir é a saída para viagem esquecida ou valor errado numa ordem já enviada. O motivo
// é obrigatório — o banco recusa sem ele — e fica gravado: é o que explica, meses depois,
// por que o valor cobrado mudou depois do envio.
//
// Quando já existe número de nota, o aviso cita o número: a nota saiu fora do sistema e
// vai precisar de correção lá, coisa que o sistema não faz e não tem como saber se foi
// feita.
export default function ModalReabrirOrdem({ ordem, onFechar, onConfirmar }) {
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  if (!ordem) return null;

  const vazio = motivo.trim() === "";

  const enviar = async (e) => {
    e.preventDefault();
    if (salvando || vazio) return;
    setSalvando(true);
    try {
      await onConfirmar(motivo.trim());
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reabrir a ordem #{ordem.id}</DialogTitle>
          <DialogDescription>{avisoDeReabertura(ordem)}</DialogDescription>
        </DialogHeader>

        <form onSubmit={enviar} className="flex flex-col gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="ordem-motivo">Motivo da reabertura</Label>
            <Textarea
              id="ordem-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex: faltou a viagem do dia 12; valor do frete estava errado"
              rows={3}
              required
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando || vazio}>
              {salvando ? "Reabrindo..." : "Reabrir ordem"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
