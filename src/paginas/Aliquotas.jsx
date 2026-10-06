import { useState } from "react";
import { useOutletContext } from "react-router";
import { toast } from "sonner";
import { TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import CabecalhoFinanceiro from "@/components/CabecalhoFinanceiro";
import { aliquotaVencida, diasDesdeAtualizacao } from "@/lib/repasse";
import { dataBR } from "@/lib/formato";

// Alíquota de repasse de cada empresa. Não é o imposto real: é a estimativa usada para
// descontar do repasse, porque o imposto só é pago no mês seguinte, por quem emitiu a nota.
// A prática é usar a faixa do mês anterior, arredondada um pouco para cima.
//
// Mudar aqui não mexe em ordem já recebida: cada ordem guarda a alíquota do dia do
// recebimento, congelada pelo banco. É o que o critério 3 da spec verifica.
export default function Aliquotas() {
  const ctx = useOutletContext();

  return (
    <>
      <CabecalhoFinanceiro
        titulo="Alíquotas"
        descricao="Percentual de imposto descontado nos repasses entre as empresas. O imposto é pago no mês seguinte por quem emitiu a nota, então aqui vai uma estimativa — a faixa do mês anterior, arredondada para cima."
      />

      <div className="grid max-w-[640px] gap-3">
        {ctx.aliquotas.map((a) => (
          <LinhaAliquota
            key={a.empresa}
            aliquota={a}
            onSalvar={(valor) => ctx.salvarAliquota(a.empresa, valor)}
          />
        ))}

        {ctx.aliquotas.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">
            Nenhuma alíquota cadastrada. A migration 007 cria as duas em 9%.
          </Card>
        )}
      </div>

      <p className="mt-4 max-w-prose text-sm text-muted-foreground">
        Mudar a alíquota não altera ordens já recebidas: cada uma guarda o percentual do dia
        do recebimento. A mudança vale para os próximos recebimentos.
      </p>
    </>
  );
}

function LinhaAliquota({ aliquota, onSalvar }) {
  // O campo é em PORCENTO e o banco guarda fração (0.09). Converter na borda evita que
  // alguém digite "9" e grave 900%.
  const [percentual, setPercentual] = useState(() =>
    String((Number(aliquota.aliquota) * 100).toFixed(2).replace(/\.00$/, "")),
  );
  const [salvando, setSalvando] = useState(false);

  const numero = Number(String(percentual).replace(",", "."));
  const valido = Number.isFinite(numero) && numero >= 0 && numero <= 100;
  const mudou = valido && Math.abs(numero / 100 - Number(aliquota.aliquota)) > 0.000001;
  const vencida = aliquotaVencida(aliquota.atualizada_em);
  const dias = diasDesdeAtualizacao(aliquota.atualizada_em);

  const salvar = async () => {
    if (!mudou || salvando) return;
    setSalvando(true);
    try {
      await onSalvar(numero / 100);
      toast.success(`Alíquota da ${aliquota.empresa} atualizada.`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Card className="p-4 md:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <Label htmlFor={`aliquota-${aliquota.empresa}`} className="text-base font-semibold">
            {aliquota.empresa}
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id={`aliquota-${aliquota.empresa}`}
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={percentual}
              onChange={(e) => setPercentual(e.target.value)}
              className="w-28"
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        </div>

        <div className="sm:text-right">
          <p className="text-xs text-muted-foreground">Última atualização</p>
          <p className="font-medium tabular-nums">{dataBR(aliquota.atualizada_em?.slice(0, 10))}</p>
          {vencida && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-status-vencida-foreground sm:justify-end">
              <TriangleAlert aria-hidden="true" className="size-3.5 flex-none" />
              {dias != null ? `há ${dias} dias` : "sem data"}
            </p>
          )}
        </div>

        <Button type="button" variant="outline" disabled={!mudou || salvando} onClick={salvar}>
          {salvando ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </Card>
  );
}
