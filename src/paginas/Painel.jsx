import { useOutletContext } from "react-router";
import Dashboard from "@/components/Dashboard";

// O Painel é o Dashboard de sempre, sem mudança de conteúdo nesta spec. Os modais de
// edição continuam morando no layout: é de lá que eles são abertos por estas duas ações.
export default function Painel() {
  const ctx = useOutletContext();

  return (
    <Dashboard
      listaViagens={ctx.listaViagens}
      listaDespesas={ctx.listaDespesas}
      listaClientes={ctx.listaClientes}
      listaMotoristas={ctx.listaMotoristas}
      onEditarViagem={ctx.abrirEdicaoViagem}
      onEditarDespesa={ctx.abrirEdicaoDespesa}
    />
  );
}
