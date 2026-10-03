import { useState } from "react";
import { Link } from "react-router";
import { Lock } from "lucide-react";
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
  // Spec 02: a ordem desta viagem, quando há uma. Vem do App, que já tem a lista.
  ordem = null,
}) {
  const [form, setForm] = useState(() =>
    viagem ? linhaParaFormulario(viagem) : null,
  );
  const [salvando, setSalvando] = useState(false);

  if (!viagem || !form) return null;

  const cancelada = viagem.status === "cancelada";
  // Em ordem aberta tudo pode ser editado, menos cancelar. Em ordem fechada, recebida ou
  // quitação de legado, o que foi cobrado do cliente está travado.
  const travado = Boolean(ordem) && ordem.status !== "aberta";
  const emOrdemAberta = Boolean(ordem) && ordem.status === "aberta";

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
          travado={travado}
          avisoDeTrava={
            travado ? (
              <div className="flex gap-2.5 rounded-lg border bg-secondary px-3 py-2.5 text-sm">
                <Lock aria-hidden="true" className="mt-0.5 size-4 flex-none text-muted-foreground" />
                <p>
                  {ordem.legado
                    ? "Esta viagem está quitada no legado, então valor, empresa e cliente estão travados. Para alterá-los, tire a viagem da quitação."
                    : "Esta viagem já foi cobrada do cliente, então valor, empresa e cliente estão travados. Para alterá-los, reabra a ordem."}{" "}
                  <Link
                    to={`/financeiro/ordens/${ordem.id}`}
                    onClick={onFechar}
                    className="font-semibold underline underline-offset-4">
                    Ver ordem #{ordem.id}
                  </Link>
                </p>
              </div>
            ) : null
          }
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
              // Viagem em ordem não é cancelada: em ordem aberta, ela sai da ordem antes;
              // em ordem fechada, a ordem é reaberta antes. O banco recusa as duas, e
              // desabilitar aqui evita o toast de erro depois do clique.
              disabled={salvando || travado || emOrdemAberta}>
              Cancelar viagem
            </Button>
          )}
          <p className="text-xs text-muted-foreground text-center">
            {cancelada
              ? "Viagem cancelada — está fora de todos os cálculos."
              : travado
                ? `Para cancelar, ${ordem.legado ? "tire a viagem da quitação de legado" : `reabra a ordem #${ordem.id} e tire a viagem dela`}.`
                : emOrdemAberta
                  ? `Para cancelar, tire a viagem da ordem #${ordem.id} primeiro.`
                  : "Cancelar mantém o registro no histórico e fora dos cálculos."}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
