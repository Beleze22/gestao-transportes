import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import DespesaForm from "@/components/DespesaForm";
import { linhaParaFormularioDespesa } from "@/lib/despesa";

// Espelha o ModalEditarViagem: o App controla QUAL despesa está aberta, o rascunho mora
// aqui e é reconstruído a cada abertura pelo remount via `key`.
export default function ModalEditarDespesa({
  despesa,
  listaCategorias,
  onSalvar,
  onFechar,
  onExcluirDespesa,
  onAdicionarCategoria,
}) {
  const [form, setForm] = useState(() =>
    despesa ? linhaParaFormularioDespesa(despesa) : null,
  );
  const [salvando, setSalvando] = useState(false);

  if (!despesa || !form) return null;

  const submeter = async (e) => {
    e.preventDefault();
    setSalvando(true);
    try {
      await onSalvar(despesa.id, form);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onFechar()}>
      {/* dvh e não vh: no Safari do iPhone, vh ignora a barra de endereço e o topo do
          formulário fica fora da tela, sem como rolar (o Radix trava o scroll do body). */}
      <DialogContent className="sm:max-w-xl max-h-[90dvh] overflow-y-auto p-0 gap-0">
        <DialogTitle className="sr-only">Editar despesa #{despesa.id}</DialogTitle>
        <DialogDescription className="sr-only">
          Altere os dados da despesa e salve.
        </DialogDescription>

        <DespesaForm
          despesa={form}
          setDespesa={setForm}
          listaCategorias={listaCategorias}
          onSalvar={submeter}
          onAdicionarCategoria={onAdicionarCategoria}
          titulo={`Despesa #${despesa.id}`}
          textoBotao="Salvar alterações"
          salvando={salvando}
          onCancelar={onFechar}
          // pr-10 abre espaço para o X que o DialogContent posiciona sozinho.
          className="border-0 shadow-none [&>*:first-child]:pr-10"
        />

        <div className="flex flex-col items-center gap-1 border-t px-6 py-4">
          <Button
            type="button"
            variant="destructive"
            className="w-full"
            onClick={() => onExcluirDespesa(despesa)}
            disabled={salvando}>
            Excluir despesa
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            Despesa não tem cancelamento — a exclusão é definitiva.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
