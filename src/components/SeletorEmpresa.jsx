import { useId } from "react";
import { Label } from "@/components/ui/label";

// Os dois valores que o banco aceita, escritos exatamente como são gravados. A coluna
// `empresa` é texto livre e o agente grava as mesmas duas palavras — qualquer variação de
// caixa aqui criaria uma terceira empresa silenciosamente.
const EMPRESAS = ["Rohan", "TransBeleze"];

// Escolha entre duas opções, como no protótipo: dois botões lado a lado, o escolhido em
// verde com texto branco. Por trás é um grupo de rádios de verdade — é o que dá navegação
// por seta, leitura correta em leitor de tela e o `required` do formulário. Um par de
// <button> estilizados não daria nenhuma das três coisas.
export default function SeletorEmpresa({ valor, onChange, rotulo = "Empresa" }) {
  // O mesmo formulário é montado duas vezes ao mesmo tempo quando o modal de edição abre
  // sobre a tela de lançamento. O useId dá um `name` próprio a cada instância, para um
  // grupo de rádios não mexer no outro.
  const id = useId();

  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1.5 text-sm font-medium leading-none">{rotulo}</legend>
      <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-input">
        {EMPRESAS.map((empresa, i) => {
          const escolhida = valor === empresa;
          return (
            <Label
              key={empresa}
              htmlFor={`${id}-${empresa}`}
              className={[
                "flex h-11 cursor-pointer items-center justify-center gap-2 text-sm",
                i > 0 && "border-l border-input",
                escolhida
                  ? "bg-brand-green font-semibold text-white"
                  : "bg-card text-foreground hover:bg-secondary",
              ]
                .filter(Boolean)
                .join(" ")}>
              <input
                type="radio"
                id={`${id}-${empresa}`}
                name={id}
                value={empresa}
                checked={escolhida}
                onChange={() => onChange(empresa)}
                className="accent-brand-gold"
              />
              {empresa}
            </Label>
          );
        })}
      </div>
    </fieldset>
  );
}
