// Conversões de campo compartilhadas entre os formulários de viagem e despesa.

// Tudo que vai para um input controlado precisa sair como string: um null faz o React
// trocar o campo para não-controlado no meio da vida dele.
export const texto = (v) => (v == null ? "" : String(v));

// Número a partir de um campo de texto. O teste explícito contra "" existe porque há
// registros com valor 0 no banco (ex: viagem #75, com frete e pagamento zerados) e um
// teste de veracidade transformaria esse 0 legítimo em null.
export function numero(v) {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// O Postgres devolve colunas `time` como "09:00:00". Um <input type="time"> com o step
// padrão recusa o componente de segundos e renderiza VAZIO — o horário salvo sumiria da
// tela e seria apagado na primeira gravação.
export const horaCurta = (t) => (t ? String(t).slice(0, 5) : "");

// Hoje em YYYY-MM-DD, no fuso local. Não dá para usar toISOString(): ele converte para
// UTC e, à noite em Brasília, já devolve o dia seguinte.
export function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
