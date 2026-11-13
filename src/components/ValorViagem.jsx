import { brl } from "@/lib/formato";

// Frete da viagem e, quando houver, o estacionamento cobrado do cliente embaixo, em texto
// secundário (spec 05). Usado nas tabelas de A faturar, Legado, Ordem e Painel, para o
// estacionamento aparecer igual em todas. Não alinha nem dá peso: quem decide é a célula.
export default function ValorViagem({ viagem, semValor = "—" }) {
  const estacionamento = Number(viagem.valor_estacionamento || 0);
  return (
    <>
      {viagem.valor_frete != null ? brl(viagem.valor_frete) : semValor}
      {estacionamento > 0 && (
        <span className="block text-xs font-normal text-muted-foreground">
          + {brl(estacionamento)} estacionamento
        </span>
      )}
    </>
  );
}
