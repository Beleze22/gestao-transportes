import { Card } from "@/components/ui/card";
import { brl } from "@/lib/formato";

// Recebido, a receber e a faturar, lado a lado. Três perguntas diferentes, por isso três
// blocos e não uma linha de números soltos:
//
//   recebido  — o dinheiro que entrou no período, pela DATA DO RECEBIMENTO da ordem. Cada
//               viagem conta para a empresa que a realizou, não para a conta que recebeu:
//               uma ordem mista recebida na conta da Rohan soma a parte da TransBeleze no
//               recebido da TransBeleze.
//   a receber — ordens já enviadas ao cliente e ainda não pagas. Não tem período: é saldo.
//   a faturar — viagens realizadas que ainda não foram cobradas de ninguém.
export default function ResumoDoPeriodo({ periodo, recebido, aReceber, aFaturar }) {
  return (
    <Card className="mb-4 grid gap-4 p-4 tabular-nums sm:grid-cols-3 md:p-5">
      <Bloco titulo={`Recebido em ${periodo}`} valores={recebido} />
      <Bloco titulo="A receber (ordens enviadas)" valores={aReceber} />
      <div>
        <p className="text-xs text-muted-foreground">A faturar</p>
        <p className="mt-1 text-lg font-bold text-brand-green">{brl(aFaturar)}</p>
        <p className="text-xs text-muted-foreground">ainda sem ordem</p>
      </div>
    </Card>
  );
}

function Bloco({ titulo, valores }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="mt-1 text-lg font-bold text-brand-green">
        {brl(valores.Rohan + valores.TransBeleze)}
      </p>
      <p className="text-xs text-muted-foreground">
        Rohan {brl(valores.Rohan)} · TransBeleze {brl(valores.TransBeleze)}
      </p>
    </div>
  );
}
