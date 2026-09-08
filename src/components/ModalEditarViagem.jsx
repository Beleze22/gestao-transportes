import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import ViagemForm from "@/components/ViagemForm";
import { linhaParaFormulario } from "@/lib/viagem";

// Modal de edição. O App controla QUAL viagem está aberta; o rascunho do formulário
// mora aqui e é reconstruído a cada abertura pelo remount via `key` — o mesmo padrão
// do ModalQuickAdd, que dispensa sincronizar com useEffect.
export default function ModalEditarViagem({
  viagem,
  listaClientes,
  listaMotoristas,
  listaCaminhoes,
  onSalvar,
  onFechar,
  onCancelarViagem,
  onReativarViagem,
  onAdicionarCliente,
  onAdicionarMotorista,
  onAdicionarCaminhao,
}) {
  const [form, setForm] = useState(() =>
    viagem ? linhaParaFormulario(viagem) : null,
  );
  const [salvando, setSalvando] = useState(false);

  if (!viagem || !form) return null;

  const cancelada = viagem.status === "cancelada";

  const submeter = async (e) => {
    e.preventDefault();
    setSalvando(true);
    try {
      await onSalvar(viagem.id, form);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onFechar()}>
      {/* O DialogContent padrão é max-w-lg e não tem altura máxima nem overflow — o
          formulário completo passa de 600px e ficaria com o topo fora da tela no
          celular, sem como rolar (o Radix trava o scroll do body).
          dvh e não vh: no Safari do iPhone, vh ignora a barra de endereço. */}
      <DialogContent className="sm:max-w-xl max-h-[90dvh] overflow-y-auto p-0 gap-0">
        {/* O título visível é o do Card do formulário; estes existem para o Radix
            não emitir aviso de acessibilidade. */}
        <DialogTitle className="sr-only">Editar viagem #{viagem.id}</DialogTitle>
        <DialogDescription className="sr-only">
          Altere os dados da viagem e salve.
        </DialogDescription>

        <ViagemForm
          viagem={form}
          setViagem={setForm}
          listaClientes={listaClientes}
          listaMotoristas={listaMotoristas}
          listaCaminhoes={listaCaminhoes}
          onSalvar={submeter}
          onAdicionarCliente={onAdicionarCliente}
          onAdicionarMotorista={onAdicionarMotorista}
          onAdicionarCaminhao={onAdicionarCaminhao}
          titulo={`Viagem #${viagem.id}`}
          textoBotao="Salvar alterações"
          salvando={salvando}
          onCancelar={onFechar}
          // pr-10 abre espaço para o X que o DialogContent posiciona sozinho.
          className="border-0 shadow-none [&>*:first-child]:pr-10"
        />

        <div className="flex flex-col items-center gap-1 border-t px-6 py-4">
          {cancelada ? (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => onReativarViagem(viagem)}
              disabled={salvando}>
              Reativar viagem
            </Button>
          ) : (
            <Button
              type="button"
              variant="destructive"
              className="w-full"
              onClick={() => onCancelarViagem(viagem)}
              disabled={salvando}>
              Cancelar viagem
            </Button>
          )}
          <p className="text-xs text-muted-foreground text-center">
            {cancelada
              ? "Viagem cancelada — está fora de todos os cálculos."
              : "Cancelar mantém o registro no histórico e fora dos cálculos."}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
