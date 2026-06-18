import { enviarMensagem } from "../telegram.js";

function formatarData(iso) {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
}

function linhaViagem(v) {
  const cliente = v.clientes?.nome || "cliente não definido";
  const motorista = v.motoristas?.nome || "motorista não definido";
  const placa = v.caminhoes?.placa || "veículo não definido";

  let linha = `• ${v.empresa} | ${cliente} | ${motorista} | ${placa}`;

  const horaCarreg = v.horario_carregamento ? v.horario_carregamento.slice(0, 5) : "";
  const horaDescarg = v.horario_descarregamento ? v.horario_descarregamento.slice(0, 5) : "";

  const campoCarreg = [v.local_carregamento, horaCarreg].filter(Boolean).join(" ");
  const campoDescarg = [v.local_descarregamento, horaDescarg].filter(Boolean).join(" ");

  if (campoCarreg) linha += ` | ${campoCarreg}`;
  if (campoDescarg) linha += ` | ${campoDescarg}`;

  return linha;
}

function linhaRascunho(v) {
  const empresa = v.empresa || "empresa a definir";
  const cliente = v.clientes?.nome || "cliente a definir";
  const faltando = [];
  if (!v.empresa) faltando.push("empresa");
  if (!v.motoristas) faltando.push("motorista");
  if (!v.caminhoes) faltando.push("caminhão");
  if (v.valor_frete == null) faltando.push("valor");
  const faltaTxt = faltando.length ? ` — falta ${faltando.join(", ")}` : "";
  return `• ${formatarData(v.data)} — ${empresa} | Possível frete para ${cliente}${faltaTxt}`;
}

function linhaPendenteValor(v) {
  const cliente = v.clientes?.nome || "cliente não definido";
  const motorista = v.motoristas?.nome || "motorista não definido";
  return `• ${formatarData(v.data)} — ${v.empresa} | Cliente: ${cliente} | ${motorista} — valor não definido`;
}

export async function enviarDigestManha(telefone, viagens) {
  const hoje = new Date().toLocaleDateString("pt-BR");
  if (viagens.length === 0) {
    await enviarMensagem(telefone, `Bom dia! 🚛 Nenhuma viagem cadastrada para hoje (${hoje}).`);
    return;
  }

  const confirmadas = viagens.filter((v) => v.status !== "rascunho");
  const rascunhos = viagens.filter((v) => v.status === "rascunho");

  let texto = `Bom dia! 🚛 Agenda de hoje (${hoje}):\n`;
  if (confirmadas.length) {
    texto += `\n✅ CONFIRMADAS:\n${confirmadas.map(linhaViagem).join("\n")}`;
  }
  if (rascunhos.length) {
    texto += `\n\n⚠️ RASCUNHOS (faltam dados):\n${rascunhos.map(linhaRascunho).join("\n")}`;
  }

  await enviarMensagem(telefone, texto);
}

export async function enviarDigestNoite(telefone, { rascunhos, pendentesValor }, diasAntecedencia) {
  if (rascunhos.length === 0 && pendentesValor.length === 0) {
    await enviarMensagem(telefone, "Boa noite! Sem pendências de agenda no momento. 👍");
    return;
  }

  let texto = `Boa noite! Lembretes 📋\n`;
  if (rascunhos.length) {
    texto += `\n📅 RASCUNHOS (próximos ${diasAntecedencia} dias):\n${rascunhos.map(linhaRascunho).join("\n")}`;
  }
  if (pendentesValor.length) {
    texto += `\n\n💰 VIAGENS COM VALOR PENDENTE:\n${pendentesValor.map(linhaPendenteValor).join("\n")}`;
  }

  await enviarMensagem(telefone, texto);
}
