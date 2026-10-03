import { useOutletContext } from "react-router";
import DespesaForm from "@/components/DespesaForm";

// Ver NovaViagem: tela sem estado próprio, tudo vem do layout.
export default function NovaDespesa() {
  const ctx = useOutletContext();

  return (
    <DespesaForm
      className="max-w-[640px] border-t-4 border-t-destructive"
      titulo={null}
      despesa={ctx.despesa}
      setDespesa={ctx.setDespesa}
      listaCategorias={ctx.listaCategorias}
      onSalvar={ctx.onSalvarDespesa}
      onAdicionarCategoria={ctx.onAdicionarCategoria}
    />
  );
}
