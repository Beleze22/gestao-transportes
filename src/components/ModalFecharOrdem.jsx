import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import SeletorEmpresa from "@/components/SeletorEmpresa";
import { brl } from "@/lib/formato";

const FORMAS = [
  { valor: "pix", rotulo: "PIX" },
  { valor: "boleto", rotulo: "Boleto" },
  { valor: "transferencia", rotulo: "Transferência" },
  { valor: "dinheiro", rotulo: "Dinheiro" },
];

// Fechar é o ato de enviar a cobrança ao cliente. A data de envio não é pedida aqui: o
// banco grava `fechada_em` com a data de hoje ao fechar, e pedir uma data que quase sempre
// é hoje só acrescenta um campo para errar.
//
// A empresa da nota só aparece com "com nota" marcado — e aí é obrigatória, porque é ela
// que decide qual CNPJ emite. O banco recusa fechar sem ela.
export default function ModalFecharOrdem({ ordem, total, onFechar, onConfirmar }) {
  const [vencimento, setVencimento] = useState("");
  const [forma, setForma] = useState("");
  const [comNota, setComNota] = useState(false);
  const [empresaNota, setEmpresaNota] = useState("");
  const [salvando, setSalvando] = useState(false);

  if (!ordem) return null;

  const enviar = async (e) => {
    e.preventDefault();
    if (salvando) return;
    setSalvando(true);
    try {
      await onConfirmar({
        vencimento: vencimento || null,
        forma_pagamento: forma || null,
        com_nota: comNota,
        empresa_nota: comNota ? empresaNota || null : null,
      });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fechar a ordem #{ordem.id}</DialogTitle>
          <DialogDescription>
            {ordem.clientes?.nome} · {brl(total)}. Fechar marca a ordem como enviada ao
            cliente e trava o valor, a empresa e o cliente das viagens dela.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={enviar} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ordem-vencimento">Vencimento</Label>
              <Input
                id="ordem-vencimento"
                type="date"
                value={vencimento}
                onChange={(e) => setVencimento(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ordem-forma">Forma de pagamento</Label>
              <Select value={forma} onValueChange={setForma}>
                <SelectTrigger id="ordem-forma">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {FORMAS.map((f) => (
                    <SelectItem key={f.valor} value={f.valor}>{f.rotulo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Label className="flex h-11 cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              className="accent-brand-gold"
              checked={comNota}
              onChange={(e) => setComNota(e.target.checked)}
            />
            O cliente exige nota fiscal
          </Label>

          {comNota && (
            <SeletorEmpresa
              valor={empresaNota}
              onChange={setEmpresaNota}
              rotulo="Empresa que emite a nota"
            />
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando ? "Fechando..." : "Fechar ordem"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
