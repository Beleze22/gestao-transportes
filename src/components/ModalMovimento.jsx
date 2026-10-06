import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { outraEmpresa } from "@/lib/repasse";
import { hojeISO } from "@/lib/campos";

// Um diálogo para os dois tipos de movimento, porque os campos são os mesmos — o que muda
// é o significado e a obrigatoriedade da observação:
//
//   repasse — dinheiro que saiu de uma empresa para a outra. ABATE a dívida de quem pagou.
//   ajuste  — dívida sem ordem por trás (o saldo anterior a 01/10/2026, ou um erro a
//             corrigir). CRIA dívida de quem está em `de_empresa`. Exige observação, senão
//             ninguém entende o valor meses depois.
//
// Também é o diálogo de edição: `movimento` preenchido abre com os valores dele.
export default function ModalMovimento({ tipo, movimento, onFechar, onConfirmar }) {
  const ehAjuste = tipo === "ajuste";

  const [data, setData] = useState(() => movimento?.data ?? hojeISO());
  const [de, setDe] = useState(() => movimento?.de_empresa ?? "Rohan");
  const [valor, setValor] = useState(() => (movimento ? String(movimento.valor) : ""));
  const [observacao, setObservacao] = useState(() => movimento?.observacao ?? "");
  const [salvando, setSalvando] = useState(false);

  const para = outraEmpresa(de);
  const valorNumero = Number(String(valor).replace(",", "."));
  const valorOk = Number.isFinite(valorNumero) && valorNumero > 0;
  const observacaoOk = !ehAjuste || observacao.trim() !== "";

  const enviar = async (e) => {
    e.preventDefault();
    if (salvando || !valorOk || !observacaoOk) return;
    setSalvando(true);
    try {
      await onConfirmar({
        data,
        tipo,
        de_empresa: de,
        para_empresa: para,
        valor: valorNumero,
        observacao: observacao.trim() || null,
      });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {movimento ? "Editar" : ehAjuste ? "Lançar" : "Registrar"}{" "}
            {ehAjuste ? "ajuste" : "repasse"}
          </DialogTitle>
          <DialogDescription>
            {ehAjuste
              ? "Dívida de uma empresa com a outra sem ordem por trás — um saldo antigo, ou a correção de um erro. Some ao saldo."
              : "Dinheiro que já saiu de uma empresa para a outra. Abate do saldo."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={enviar} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="mov-data">Data</Label>
              <Input
                id="mov-data"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mov-valor">Valor (R$)</Label>
              <Input
                id="mov-valor"
                type="number"
                step="0.01"
                min="0.01"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Direção por extenso, e não dois seletores: com duas empresas, escolher a
              origem já determina o destino, e a frase elimina a chance de inverter. */}
          <fieldset className="space-y-1.5">
            <legend className="mb-1.5 text-sm font-medium leading-none">Direção</legend>
            <div className="grid gap-2">
              {["Rohan", "TransBeleze"].map((empresa) => (
                <Label
                  key={empresa}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 text-sm hover:bg-secondary/50">
                  <input
                    type="radio"
                    name="direcao-movimento"
                    className="accent-brand-gold"
                    checked={de === empresa}
                    onChange={() => setDe(empresa)}
                  />
                  {ehAjuste
                    ? `${empresa} passa a dever à ${outraEmpresa(empresa)}`
                    : `${empresa} transferiu para a ${outraEmpresa(empresa)}`}
                </Label>
              ))}
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="mov-obs">
              Observação {ehAjuste ? "(obrigatória)" : "(opcional)"}
            </Label>
            <Textarea
              id="mov-obs"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
              placeholder={
                ehAjuste
                  ? "Ex: saldo acumulado até 30/09/2026, conferido na planilha"
                  : "Ex: PIX do dia 12"
              }
              required={ehAjuste}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando || !valorOk || !observacaoOk}>
              {salvando ? "Salvando..." : movimento ? "Salvar alterações" : "Lançar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
