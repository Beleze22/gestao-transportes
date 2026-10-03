import { Badge } from "@/components/ui/badge";
import { estaVencida, rotuloSituacao } from "@/lib/ordem";

// Situação da ordem: aberta, fechada, vencida, recebida ou quitação de legado. O texto sai
// de rotuloSituacao (e inclui a data do recebimento ou os dias de atraso); aqui só a cor.
//
// Vencida tem cor própria, de alerta, porque é a única que pede ação imediata — e mesmo
// assim o texto diz "Vencida há N dias", para quem não distingue as cores.
function classes(ordem) {
  if (ordem.legado) return "bg-status-recebida text-status-recebida-foreground";
  if (ordem.status === "aberta") return "bg-status-aberta text-status-aberta-foreground";
  if (ordem.status === "recebida") return "bg-status-recebida text-status-recebida-foreground";
  if (estaVencida(ordem)) return "bg-status-vencida text-status-vencida-foreground";
  return "bg-status-fechada text-status-fechada-foreground";
}

export default function EtiquetaSituacao({ ordem }) {
  return (
    <Badge className={`border-transparent font-bold ${classes(ordem)}`}>
      {rotuloSituacao(ordem)}
    </Badge>
  );
}
