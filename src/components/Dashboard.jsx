import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import { AlertCircle, DollarSign, TrendingDown, TrendingUp, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";

// ── CONSTANTS ──────────────────────────────────────────────

const PERIODO_OPTIONS = [
  { label: "Este mês", value: "mes_atual" },
  { label: "Mês anterior", value: "mes_anterior" },
  { label: "Últimos 3 meses", value: "3_meses" },
  { label: "Este ano", value: "ano_atual" },
];

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

function getRange(periodo) {
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
  return { inicio: ini.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10) };
}

function brl(v) {
  return (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function mesLabel(yyyymm) {
  const [, m] = yyyymm.split("-");
  return MESES[parseInt(m) - 1];
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

export default function Dashboard({ listaViagens, listaDespesas, listaClientes, listaMotoristas }) {
  const [periodo, setPeriodo]       = useState("mes_atual");
  const [empresa, setEmpresa]       = useState("todas");
  const [clienteId, setClienteId]   = useState("todos");
  const [motoristaId, setMotoristaId] = useState("todos");

  const { inicio, fim } = useMemo(() => getRange(periodo), [periodo]);

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

  const kpis = useMemo(() => {
    const fat  = viagensFilt.reduce((s, v) => s + (v.valor_frete || 0), 0);
    const mot  = viagensFilt.reduce((s, v) => s + (v.valor_motorista || 0), 0);
    const desp = despesasFilt.reduce((s, d) => s + (d.valor || 0), 0);
    return { faturamento: fat, motoristas: mot, despesas: desp, lucro: fat - mot - desp };
  }, [viagensFilt, despesasFilt]);

  const barData = useMemo(() => {
    const g = {};
    viagensFilt.forEach((v) => {
      const k = v.data.slice(0, 7);
      g[k] = { fat: (g[k]?.fat || 0) + (v.valor_frete || 0), desp: g[k]?.desp || 0 };
    });
    despesasFilt.forEach((d) => {
      const k = d.data.slice(0, 7);
      g[k] = { fat: g[k]?.fat || 0, desp: (g[k]?.desp || 0) + (d.valor || 0) };
    });
    return Object.entries(g).sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => ({ mes: mesLabel(k), Faturamento: v.fat, Despesas: v.desp }));
  }, [viagensFilt, despesasFilt]);

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
    viagensFilt.forEach((v) => {
      const n = v.clientes?.nome || "Não definido";
      if (!m[n]) m[n] = { nome: n, fat: 0, viagens: 0 };
      m[n].fat += v.valor_frete || 0;
      m[n].viagens++;
    });
    return Object.values(m).sort((a, b) => b.fat - a.fat).slice(0, 5);
  }, [viagensFilt]);

  const topMotoristas = useMemo(() => {
    const m = {};
    viagensFilt.forEach((v) => {
      const n = v.motoristas?.nome || "Não definido";
      if (!m[n]) m[n] = { nome: n, pago: 0, viagens: 0 };
      m[n].pago += v.valor_motorista || 0;
      m[n].viagens++;
    });
    return Object.values(m).sort((a, b) => b.viagens - a.viagens).slice(0, 5);
  }, [viagensFilt]);

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

  const hoje = new Date();
  const viagensDoMes = useMemo(() =>
    listaViagens
      .filter((v) => {
        const d = new Date(v.data + "T12:00:00");
        return d.getMonth() === hoje.getMonth() && d.getFullYear() === hoje.getFullYear();
      })
      .sort((a, b) => a.data.localeCompare(b.data)),
    [listaViagens]);

  return (
    <div className="space-y-5">

      {/* ── FILTROS ── */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Período", content: (
                <Select value={periodo} onValueChange={setPeriodo}>
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
        </CardContent>
      </Card>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 gap-3">
        <KpiCard title="Faturamento" value={kpis.faturamento} icon={DollarSign} sub={`${viagensFilt.length} viagens`} />
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

      {/* ── DIÁRIO DO MÊS ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            📅 Diário — {MESES[hoje.getMonth()]}/{hoje.getFullYear()}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Frete</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {viagensDoMes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Nenhuma viagem este mês
                    </TableCell>
                  </TableRow>
                ) : viagensDoMes.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="whitespace-nowrap">
                      {new Date(v.data + "T12:00:00").toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell>{v.empresa}</TableCell>
                    <TableCell>{v.clientes?.nome || "—"}</TableCell>
                    <TableCell><StatusBadge status={v.status} /></TableCell>
                    <TableCell className="text-right font-medium">
                      {v.valor_frete != null ? brl(v.valor_frete) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
