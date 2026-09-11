import { Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export default function DespesaForm({
  despesa, setDespesa, listaCategorias, onSalvar, onAdicionarCategoria,
  // Defaults iguais ao comportamento de cadastro, para a aba "Despesa" não mudar.
  titulo = "Nova Despesa",
  textoBotao = "Salvar Despesa 💸",
  salvando = false,
  onCancelar,
  className = "border-t-4 border-t-destructive",
}) {
  const set = (campo) => (val) => setDespesa({ ...despesa, [campo]: val });

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSalvar} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Empresa Pagadora</Label>
            <Select value={despesa.empresa} onValueChange={set("empresa")}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Rohan">Rohan</SelectItem>
                <SelectItem value="TransBeleze">TransBeleze</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Data</Label>
            <Input type="date" value={despesa.data}
              onChange={(e) => set("data")(e.target.value)} required />
          </div>

          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <div className="flex gap-2">
              <Select value={despesa.categoria} onValueChange={set("categoria")}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {listaCategorias.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.categoria}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" size="icon" onClick={onAdicionarCategoria}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Input placeholder="Ex: Troca de óleo, Pneu..." value={despesa.descricao}
              onChange={(e) => set("descricao")(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Valor (R$)</Label>
            <Input type="number" placeholder="0.00" value={despesa.valor}
              onChange={(e) => set("valor")(e.target.value)} required />
          </div>

          {onCancelar ? (
            <div className="flex gap-2">
              {/* type="button" é obrigatório: dentro de um <form>, o default é submit. */}
              <Button type="button" variant="outline" onClick={onCancelar} disabled={salvando}>
                Cancelar
              </Button>
              <Button type="submit" variant="destructive" className="flex-1" disabled={salvando}>
                {salvando ? "Salvando..." : textoBotao}
              </Button>
            </div>
          ) : (
            <Button type="submit" variant="destructive" className="w-full" disabled={salvando}>
              {salvando ? "Salvando..." : textoBotao}
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
