import { useOutletContext } from "react-router";
import ViagemForm from "@/components/ViagemForm";

// Tela de lançamento de viagem. Nenhum estado próprio: o formulário e os dados vivem no
// layout (App.jsx), acima das rotas, para que trocar de tela não apague um rascunho nem
// dispare nova carga do Supabase.
//
// `titulo={null}` porque o nome da tela já é o <h1> da AreaConteudo.
export default function NovaViagem() {
  const ctx = useOutletContext();

  return (
    <ViagemForm
      className="max-w-[640px]"
      titulo={null}
      viagem={ctx.viagem}
      setViagem={ctx.setViagem}
      listaClientes={ctx.listaClientes}
      listaMotoristas={ctx.listaMotoristas}
      listaCaminhoes={ctx.listaCaminhoes}
      onSalvar={ctx.onSalvarViagem}
      onAdicionarCliente={ctx.onAdicionarCliente}
      onAdicionarMotorista={ctx.onAdicionarMotorista}
      onAdicionarCaminhao={ctx.onAdicionarCaminhao}
    />
  );
}
