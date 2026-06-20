import { useState } from "react";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function ViagemForm({
  viagem,
  setViagem,
  listaClientes,
  listaMotoristas,
  listaCaminhoes,
  onSalvar,
  onAdicionarCliente,
  onAdicionarMotorista,
  onAdicionarCaminhao,
}) {
  const [mostrarLogistica, setMostrarLogistica] = useState(false);

  const set = (campo) => (val) => setViagem({ ...viagem, [campo]: val });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nova Viagem</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSalvar} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Empresa</Label>
            <Select value={viagem.empresa} onValueChange={set("empresa")}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Rohan">Rohan</SelectItem>
                <SelectItem value="TransBeleze">TransBeleze</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Data</Label>
            <Input
              type="date"
              value={viagem.data}
              onChange={(e) => set("data")(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label>Cliente</Label>
            <div className="flex gap-2">
              <Select
                value={viagem.cliente_id}
                onValueChange={set("cliente_id")}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {listaClientes.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={onAdicionarCliente}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Motorista</Label>
            <div className="flex gap-2">
              <Select
                value={viagem.motorista_id}
                onValueChange={set("motorista_id")}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {listaMotoristas.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={onAdicionarMotorista}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Caminhão</Label>
            <div className="flex gap-2">
              <Select
                value={viagem.caminhao_id}
                onValueChange={set("caminhao_id")}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {listaCaminhoes.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.placa}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={onAdicionarCaminhao}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Valores (R$)</Label>
            <div className="grid grid-cols-2 gap-3">
              <Input
                type="number"
                placeholder="Frete"
                value={viagem.valorFrete}
                onChange={(e) => set("valorFrete")(e.target.value)}
              />
              <Input
                type="number"
                placeholder="Pgto Motorista"
                value={viagem.valorMotorista}
                onChange={(e) => set("valorMotorista")(e.target.value)}
              />
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            className="w-full border border-dashed text-muted-foreground"
            onClick={() => setMostrarLogistica((v) => !v)}
          >
            {mostrarLogistica ? (
              <>
                <ChevronUp className="h-4 w-4 mr-2" />
                Ocultar logística
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 mr-2" />
                Logística (opcional)
              </>
            )}
          </Button>

          {mostrarLogistica && (
            <div className="space-y-4 rounded-lg border bg-muted/40 p-4">
              <div className="space-y-1.5">
                <Label>Carregamento</Label>
                <div className="flex gap-2">
                  <Input
                    className="flex-1"
                    placeholder="Local de origem"
                    value={viagem.localCarregamento}
                    onChange={(e) => set("localCarregamento")(e.target.value)}
                  />
                  <Input
                    type="time"
                    className="w-28 flex-none"
                    value={viagem.horarioCarregamento}
                    onChange={(e) => set("horarioCarregamento")(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Descarregamento</Label>
                <div className="flex gap-2">
                  <Input
                    className="flex-1"
                    placeholder="Local de destino"
                    value={viagem.localDescarregamento}
                    onChange={(e) =>
                      set("localDescarregamento")(e.target.value)
                    }
                  />
                  <Input
                    type="time"
                    className="w-28 flex-none"
                    value={viagem.horarioDescarregamento}
                    onChange={(e) =>
                      set("horarioDescarregamento")(e.target.value)
                    }
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Observações</Label>
                <Textarea
                  placeholder="Informações adicionais..."
                  rows={3}
                  value={viagem.observacoes}
                  onChange={(e) => set("observacoes")(e.target.value)}
                />
              </div>
            </div>
          )}

          <Button type="submit" className="w-full">
            Salvar Viagem
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
