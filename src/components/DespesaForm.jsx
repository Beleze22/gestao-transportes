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
}) {
  const set = (campo) => (val) => setDespesa({ ...despesa, [campo]: val });

  return (
    <Card className="border-t-4 border-t-destructive">
      <CardHeader>
        <CardTitle>Nova Despesa</CardTitle>
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

          <Button type="submit" variant="destructive" className="w-full">
            Salvar Despesa 💸
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
