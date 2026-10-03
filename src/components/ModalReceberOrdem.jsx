import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SeletorEmpresa from "@/components/SeletorEmpresa";
import { brl } from "@/lib/formato";
import { hojeISO } from "@/lib/campos";

// Registrar recebimento. Os dois campos são obrigatórios e o banco recusa sem eles.
//
// "Conta que recebeu" não é a mesma coisa que "empresa da viagem": o cliente paga tudo
// numa conta só, e no resumo cada viagem continua contando para a empresa que a realizou.
// É por isso que o texto diz "o dinheiro caiu na conta da" e não "empresa".
//
// O bloco de repasse entre as empresas que aparece no protótipo desta tela é da spec 03 —
// aqui ele não existe.
export default function ModalReceberOrdem({ ordem, total, onFechar, onConfirmar }) {
  const [data, setData] = useState(hojeISO);
  const [conta, setConta] = useState("");
  const [salvando, setSalvando] = useState(false);

  if (!ordem) return null;

  const enviar = async (e) => {
    e.preventDefault();
    if (salvando) return;
    setSalvando(true);
    try {
      await onConfirmar({ recebida_em: data || null, empresa_recebedora: conta || null });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar recebimento da ordem #{ordem.id}</DialogTitle>
          <DialogDescription>
            {ordem.clientes?.nome} · {brl(total)}. Ao confirmar, todas as viagens desta
            ordem contam como recebidas no mês da data informada.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={enviar} className="flex flex-col gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="ordem-recebida-em">Data do recebimento</Label>
            <Input
              id="ordem-recebida-em"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              required
            />
          </div>

          <SeletorEmpresa
            valor={conta}
            onChange={setConta}
            rotulo="O dinheiro caiu na conta da"
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando ? "Confirmando..." : "Confirmar recebimento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
