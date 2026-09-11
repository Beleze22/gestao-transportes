import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import { AlertCircle, DollarSign, Pencil, TrendingDown, TrendingUp, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";

// ── CONSTANTS ──────────────────────────────────────────────

const PERIODO_OPTIONS = [
  { label: "Este mês", value: "mes_atual" },
  { label: "Mês anterior", value: "mes_anterior" },
  { label: "Últimos 3 meses", value: "3_meses" },
  { label: "Este ano", value: "ano_atual" },
  { label: "Personalizado", value: "personalizado" },
];

const PERSONALIZADO = "personalizado";

const STATUS_CONFIG = {
  rascunho:            { label: "Rascunho",   cls: "bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-100" },
  confirmada:          { label: "Confirmada",  cls: "bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100" },
  confirmada_sem_valor:{ label: "Sem valor",   cls: "bg-sky-100 text-sky-700 border-sky-200 hover:bg-sky-100" },
  realizada_pendente:  { label: "Pend. valor", cls: "bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100" },
  concluida:           { label: "Concluída",   cls: "bg-green-100 text-green-700 border-green-200 hover:bg-green-100" },
  cancelada:           { label: "Cancelada",   cls: "bg-red-100 text-red-700 border-red-200 hover:bg-red-100" },
};

const PIE_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#ef4444", "#6b7280"];

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

// ── HELPERS ────────────────────────────────────────────────

// Data local como YYYY-MM-DD. Não dá para usar toISOString(): ele converte para UTC,
// o que desloca o dia em qualquer fuso a leste de Greenwich.
function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function getRange(periodo, desde, ate) {
  if (periodo === PERSONALIZADO) {
    // Campo em branco vira lado aberto — enquanto você escolhe a data final, a lista
    // não desaparece. E datas invertidas trocam de lugar em vez de devolver vazio sem
    // explicação nenhuma.
    const i = desde || "0000-01-01";
    const f = ate || "9999-12-31";
    return i <= f ? { inicio: i, fim: f } : { inicio: f, fim: i };
  }

  const hoje = new Date();
  const a = hoje.getFullYear();
  const m = hoje.getMonth();
  const ranges = {
    mes_atual:    [new Date(a, m, 1),     new Date(a, m + 1, 0)],
    mes_anterior: [new Date(a, m - 1, 1), new Date(a, m, 0)],
    "3_meses":    [new Date(a, m - 2, 1), new Date(a, m + 1, 0)],
    ano_atual:    [new Date(a, 0, 1),     new Date(a, 11, 31)],
  };
  const [ini, fim] = ranges[periodo] ?? ranges.mes_atual;
  return { inicio: iso(ini), fim: iso(fim) };
}

function dataBR(s) {
  return s ? new Date(s + "T12:00:00").toLocaleDateString("pt-BR") : null;
}

function rotuloPeriodo(periodo, desde, ate) {
  if (periodo !== PERSONALIZADO) {
    return PERIODO_OPTIONS.find((p) => p.value === periodo)?.label ?? "";
  }
  if (desde && ate) return `${dataBR(desde)} a ${dataBR(ate)}`;
  if (desde) return `a partir de ${dataBR(desde)}`;
  if (ate) return `até ${dataBR(ate)}`;
  return "Todo o período";
}

function brl(v) {
  return (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Com período livre o intervalo pode cruzar anos, e aí só o nome do mês colide
// ("Jan" duas vezes). O ano só entra no rótulo quando é necessário distinguir.
function mesLabel(yyyymm, comAno = false) {
  const [ano, m] = yyyymm.split("-");
  const nome = MESES[parseInt(m) - 1];
  return comAno ? `${nome}/${ano.slice(2)}` : nome;
}

// ── SUB-COMPONENTS ─────────────────────────────────────────

function KpiCard({ title, value, icon: Icon, positive = true, sub }) {
  const cor = positive ? "text-green-600" : "text-red-600";
  const bg  = positive ? "bg-green-50"   : "bg-red-50";
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground truncate">{title}</p>
            <p className={`text-xl font-bold mt-0.5 ${cor}`}>{brl(value)}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className={`shrink-0 p-2 rounded-lg ${bg}`}>
            <Icon className={`h-4 w-4 ${cor}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.rascunho;
  return <Badge className={cfg.cls}>{cfg.label}</Badge>;
}

// ── DASHBOARD ──────────────────────────────────────────────

export default function Dashboard({
  listaViagens, listaDespesas, listaClientes, listaMotoristas,
  onEditarViagem, onEditarDespesa,
}) {
  const [periodo, setPeriodo]       = useState("mes_atual");
  const [empresa, setEmpresa]       = useState("todas");
  const [clienteId, setClienteId]   = useState("todos");
  const [motoristaId, setMotoristaId] = useState("todos");
  const [desde, setDesde] = useState("");
  const [ate, setAte] = useState("");

  const { inicio, fim } = useMemo(
    () => getRange(periodo, desde, ate),
    [periodo, desde, ate]);

  // Ao entrar no modo personalizado, semeia os campos com o período que já estava
  // selecionado, para partir de algo coerente em vez de um intervalo vazio.
  const trocarPeriodo = (novo) => {
    if (novo === PERSONALIZADO && !desde && !ate) {
      setDesde(inicio);
      setAte(fim);
    }
    setPeriodo(novo);
  };

  const viagensFilt = useMemo(() => listaViagens.filter((v) => {
    if (empresa !== "todas" && v.empresa !== empresa) return false;
    if (v.data < inicio || v.data > fim) return false;
    if (clienteId !== "todos" && String(v.cliente_id) !== clienteId) return false;
    if (motoristaId !== "todos" && String(v.motorista_id) !== motoristaId) return false;
    return true;
  }), [listaViagens, empresa, inicio, fim, clienteId, motoristaId]);

  const despesasFilt = useMemo(() => listaDespesas.filter((d) => {
    if (empresa !== "todas" && d.empresa !== empresa) return false;
    if (d.data < inicio || d.data > fim) return false;
    return true;
  }), [listaDespesas, empresa, inicio, fim]);

  // Exclui canceladas de todos os cálculos financeiros
  const viagensAtivas = useMemo(() =>
    viagensFilt.filter((v) => v.status !== "cancelada"),
    [viagensFilt]);

  const kpis = useMemo(() => {
    const fat  = viagensAtivas.reduce((s, v) => s + (v.valor_frete || 0), 0);
    const mot  = viagensAtivas.reduce((s, v) => s + (v.valor_motorista || 0), 0);
    const desp = despesasFilt.reduce((s, d) => s + (d.valor || 0), 0);
    return { faturamento: fat, motoristas: mot, despesas: desp, lucro: fat - mot - desp };
  }, [viagensAtivas, despesasFilt]);

  const barData = useMemo(() => {
    const g = {};
    viagensAtivas.forEach((v) => {
      const k = v.data.slice(0, 7);
      g[k] = { fat: (g[k]?.fat || 0) + (v.valor_frete || 0), desp: g[k]?.desp || 0 };
    });
    despesasFilt.forEach((d) => {
      const k = d.data.slice(0, 7);
      g[k] = { fat: g[k]?.fat || 0, desp: (g[k]?.desp || 0) + (d.valor || 0) };
    });
    const chaves = Object.keys(g);
    const multiAno = new Set(chaves.map((k) => k.slice(0, 4))).size > 1;
    return chaves.sort((a, b) => a.localeCompare(b))
      .map((k) => ({ mes: mesLabel(k, multiAno), Faturamento: g[k].fat, Despesas: g[k].desp }));
  }, [viagensAtivas, despesasFilt]);

  // Pizza usa viagensFilt (com canceladas) para mostrar distribuição real de status
  const pieData = useMemo(() => {
    const c = {};
    viagensFilt.forEach((v) => {
      const l = STATUS_CONFIG[v.status]?.label ?? v.status;
      c[l] = (c[l] || 0) + 1;
    });
    return Object.entries(c).map(([name, value]) => ({ name, value }));
  }, [viagensFilt]);

  const topClientes = useMemo(() => {
    const m = {};
    viagensAtivas.forEach((v) => {
      const n = v.clientes?.nome || "Não definido";
      if (!m[n]) m[n] = { nome: n, fat: 0, viagens: 0 };
      m[n].fat += v.valor_frete || 0;
      m[n].viagens++;
    });
    return Object.values(m).sort((a, b) => b.fat - a.fat).slice(0, 5);
  }, [viagensAtivas]);

  const topMotoristas = useMemo(() => {
    const m = {};
    viagensAtivas.forEach((v) => {
      const n = v.motoristas?.nome || "Não definido";
      if (!m[n]) m[n] = { nome: n, pago: 0, viagens: 0 };
      m[n].pago += v.valor_motorista || 0;
      m[n].viagens++;
    });
    return Object.values(m).sort((a, b) => b.viagens - a.viagens).slice(0, 5);
  }, [viagensAtivas]);

  const porCategoria = useMemo(() => {
    const m = {};
    despesasFilt.forEach((d) => {
      const c = d.categoriasdespesas?.categoria || "Sem categoria";
      m[c] = (m[c] || 0) + (d.valor || 0);
    });
    return Object.entries(m).sort(([, a], [, b]) => b - a).slice(0, 5);
  }, [despesasFilt]);

  const pendentes = useMemo(() =>
    listaViagens
      .filter((v) => v.status === "realizada_pendente")
      .sort((a, b) => a.data.localeCompare(b.data))
      .slice(0, 10),
    [listaViagens]);

  // Mais recentes primeiro: "Este ano" chega a ~480 viagens, e o que se procura numa
  // lista dessas costuma estar no fim do período, não no começo.
  const viagensDoDiario = useMemo(
    () => [...viagensFilt].sort((a, b) => b.data.localeCompare(a.data)),
    [viagensFilt]);

  // Soma só as ativas para bater com o KPI de Faturamento — canceladas aparecem na
  // lista (você quer vê-las) mas não entram na conta.
  const totalDiario = useMemo(
    () => viagensAtivas.reduce((s, v) => s + (v.valor_frete || 0), 0),
    [viagensAtivas]);

  // Mesma ordenação da tabela de viagens: mais recentes primeiro.
  const despesasDoDiario = useMemo(
    () => [...despesasFilt].sort((a, b) => b.data.localeCompare(a.data)),
    [despesasFilt]);

  const periodoLabel = rotuloPeriodo(periodo, desde, ate);

  // Descreve os filtros ativos, para a tabela dizer o que está mostrando.
  const filtrosAtivos = [
    empresa !== "todas" && empresa,
    clienteId !== "todos" && listaClientes.find((c) => String(c.id) === clienteId)?.nome,
    motoristaId !== "todos" && listaMotoristas.find((m) => String(m.id) === motoristaId)?.nome,
  ].filter(Boolean);

  return (
    <div className="space-y-5">

      {/* ── FILTROS ── */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Período", content: (
                <Select value={periodo} onValueChange={trocarPeriodo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PERIODO_OPTIONS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              )},
              { label: "Empresa", content: (
                <Select value={empresa} onValueChange={setEmpresa}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas</SelectItem>
                    <SelectItem value="Rohan">Rohan</SelectItem>
                    <SelectItem value="TransBeleze">TransBeleze</SelectItem>
                  </SelectContent>
                </Select>
              )},
              { label: "Cliente", content: (
                <Select value={clienteId} onValueChange={setClienteId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {listaClientes.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              )},
              { label: "Motorista", content: (
                <Select value={motoristaId} onValueChange={setMotoristaId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {listaMotoristas.map((m) => <SelectItem key={m.id} value={String(m.id)}>{m.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              )},
            ].map(({ label, content }) => (
              <div key={label}>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">{label}</p>
                {content}
              </div>
            ))}
          </div>

          {periodo === PERSONALIZADO && (
            <div className="mt-3 grid grid-cols-2 gap-3 border-t pt-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">De</p>
                <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Até</p>
                <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
              </div>
              <p className="col-span-2 text-xs text-muted-foreground">
                Deixe um dos campos em branco para deixar aquele lado em aberto.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 gap-3">
        <KpiCard title="Faturamento" value={kpis.faturamento} icon={DollarSign} sub={`${viagensAtivas.length} viagens`} />
        <KpiCard title="Pgto Motoristas" value={kpis.motoristas} icon={Truck} positive={false} />
        <KpiCard title="Outras Despesas" value={kpis.despesas} icon={TrendingDown} positive={false} sub={`${despesasFilt.length} registros`} />
        <KpiCard title="Lucro Líquido" value={kpis.lucro} icon={TrendingUp} positive={kpis.lucro >= 0} />
      </div>

      {/* ── GRÁFICOS ── */}
      {barData.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
          <Card className="sm:col-span-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Receita vs Despesas</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={barData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v, n) => [brl(v), n]} cursor={{ fill: "#f9fafb" }} />
                  <Bar dataKey="Faturamento" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Despesas" fill="#f87171" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {pieData.length > 0 && (
            <Card className="sm:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Status das viagens</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="45%" outerRadius={65} dataKey="value" labelLine={false}>
                      {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v, n) => [v, n]} />
                    <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── RANKINGS ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          {
            title: "Top Clientes",
            rows: topClientes.map((c, i) => (
              <div key={c.nome} className="flex items-center justify-between text-sm py-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-muted-foreground w-4 shrink-0">{i + 1}</span>
                  <span className="truncate">{c.nome}</span>
                </div>
                <span className="text-xs font-semibold text-green-600 shrink-0 ml-2">{brl(c.fat)}</span>
              </div>
            )),
          },
          {
            title: "Motoristas",
            rows: topMotoristas.map((m, i) => (
              <div key={m.nome} className="flex items-center justify-between text-sm py-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-muted-foreground w-4 shrink-0">{i + 1}</span>
                  <span className="truncate">{m.nome}</span>
                </div>
                <span className="text-xs text-muted-foreground shrink-0 ml-2">{m.viagens} viag.</span>
              </div>
            )),
          },
          {
            title: "Despesas por categoria",
            rows: porCategoria.map(([cat, val]) => (
              <div key={cat} className="flex items-center justify-between text-sm py-1.5">
                <span className="truncate">{cat}</span>
                <span className="text-xs font-semibold text-red-600 shrink-0 ml-2">{brl(val)}</span>
              </div>
            )),
          },
        ].map(({ title, rows }) => (
          <Card key={title}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">{title}</CardTitle>
            </CardHeader>
            <CardContent>
              {rows.length === 0
                ? <p className="text-sm text-muted-foreground">Sem dados</p>
                : <div className="divide-y">{rows}</div>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── PENDENTES ── */}
      {pendentes.length > 0 && (
        <Card className="border-l-4 border-l-amber-400">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              Aguardando valor ({pendentes.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {pendentes.map((v) => (
                <div key={v.id} className="flex items-center justify-between py-2 text-sm">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium">
                      {new Date(v.data + "T12:00:00").toLocaleDateString("pt-BR")}
                    </span>
                    <span className="text-muted-foreground">· {v.empresa} · {v.clientes?.nome || "—"}</span>
                  </div>
                  <StatusBadge status={v.status} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* ── VIAGENS DO FILTRO ── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-baseline justify-between gap-2">
            <CardTitle className="text-sm font-semibold">
              Viagens · {periodoLabel}
            </CardTitle>
            <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
              {viagensDoDiario.length} {viagensDoDiario.length === 1 ? "viagem" : "viagens"}
            </span>
          </div>
          {filtrosAtivos.length > 0 && (
            <p className="text-xs text-muted-foreground">{filtrosAtivos.join(" · ")}</p>
          )}
        </CardHeader>
        <CardContent>
          {/* O teto de altura precisa ficar no container que rola — que é o do próprio
              Table. Num div externo, o cabeçalho fixo se ancoraria no wrapper interno,
              que não rola, e não grudaria. Sem teto, "Este ano" despeja ~480 linhas. */}
          <Table containerClassName="max-h-[26rem] rounded-md border">
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Motorista</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Frete</TableHead>
                <TableHead className="w-10 px-1">
                  <span className="sr-only">Ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {viagensDoDiario.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Nenhuma viagem para os filtros selecionados
                  </TableCell>
                </TableRow>
              ) : viagensDoDiario.map((v) => {
                const cancelada = v.status === "cancelada";
                return (
                  <TableRow
                    key={v.id}
                    onClick={() => onEditarViagem?.(v)}
                    className={`cursor-pointer ${cancelada ? "text-muted-foreground" : ""}`}>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {new Date(v.data + "T12:00:00").toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{v.empresa || "—"}</TableCell>
                    <TableCell>{v.clientes?.nome || "—"}</TableCell>
                    <TableCell>{v.motoristas?.nome || "—"}</TableCell>
                    <TableCell><StatusBadge status={v.status} /></TableCell>
                    <TableCell
                      className={`text-right font-medium tabular-nums whitespace-nowrap ${
                        cancelada ? "line-through" : ""
                      }`}>
                      {v.valor_frete != null ? brl(v.valor_frete) : "—"}
                    </TableCell>
                    <TableCell className="w-10 px-1 py-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={`Editar viagem de ${new Date(v.data + "T12:00:00").toLocaleDateString("pt-BR")}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditarViagem?.(v);
                        }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            {viagensDoDiario.length > 0 && (
              <TableFooter className="sticky bottom-0 z-10 bg-muted">
                <TableRow>
                  <TableCell colSpan={6} className="text-xs">
                    Faturamento do período
                    {viagensDoDiario.length !== viagensAtivas.length &&
                      " (sem as canceladas)"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    {brl(totalDiario)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </CardContent>
      </Card>

      {/* ── DESPESAS DO FILTRO ── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-baseline justify-between gap-2">
            <CardTitle className="text-sm font-semibold">
              Despesas · {periodoLabel}
            </CardTitle>
            <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
              {despesasDoDiario.length} {despesasDoDiario.length === 1 ? "registro" : "registros"}
            </span>
          </div>
          {/* Despesa não tem cliente nem motorista — só empresa e período se aplicam. */}
          {empresa !== "todas" && (
            <p className="text-xs text-muted-foreground">{empresa}</p>
          )}
        </CardHeader>
        <CardContent>
          <Table containerClassName="max-h-[26rem] rounded-md border">
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="w-10 px-1">
                  <span className="sr-only">Ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {despesasDoDiario.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhuma despesa para os filtros selecionados
                  </TableCell>
                </TableRow>
              ) : despesasDoDiario.map((d) => (
                <TableRow
                  key={d.id}
                  onClick={() => onEditarDespesa?.(d)}
                  className="cursor-pointer">
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {new Date(d.data + "T12:00:00").toLocaleDateString("pt-BR")}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{d.empresa || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {d.categoriasdespesas?.categoria || "—"}
                  </TableCell>
                  <TableCell>{d.descricao || "—"}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums whitespace-nowrap">
                    {brl(d.valor)}
                  </TableCell>
                  <TableCell className="w-10 px-1 py-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`Editar despesa de ${new Date(d.data + "T12:00:00").toLocaleDateString("pt-BR")}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditarDespesa?.(d);
                      }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            {despesasDoDiario.length > 0 && (
              <TableFooter className="sticky bottom-0 z-10 bg-muted">
                <TableRow>
                  <TableCell colSpan={4} className="text-xs">Total do período</TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    {brl(kpis.despesas)}
                  </TableCell>
                  <TableCell className="w-10 px-1" />
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
