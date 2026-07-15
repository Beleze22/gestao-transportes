// Datas sempre no fuso de Brasília — new Date().toISOString() usa UTC,
// que entre 21h e meia-noite (BRT) já é o dia seguinte.
export function hojeISO(offsetDias = 0) {
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  if (!offsetDias) return hoje;
  const d = new Date(hoje + "T12:00:00"); // meio-dia evita rollover de fuso no offset
  d.setDate(d.getDate() + offsetDias);
  return d.toISOString().slice(0, 10);
}
