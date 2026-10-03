import { Badge } from "@/components/ui/badge";

// Qual das duas transportadoras fez a viagem. As cores vêm da tabela do docs/design.md,
// via variáveis — e o nome da empresa está escrito, não só colorido: cor nunca é a única
// informação.
const CORES = {
  Rohan: "bg-empresa-rohan text-empresa-rohan-foreground",
  TransBeleze: "bg-empresa-tb text-empresa-tb-foreground",
};

export default function EtiquetaEmpresa({ empresa }) {
  if (!empresa) return <span className="text-muted-foreground">—</span>;

  return (
    <Badge className={`border-transparent font-bold ${CORES[empresa] ?? "bg-secondary text-secondary-foreground"}`}>
      {empresa}
    </Badge>
  );
}
