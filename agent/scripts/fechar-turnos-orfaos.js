// Fecha no histórico os turnos que abortaram antes do FIX #11 existir.
//
// Quando a chamada à Anthropic falhava (crédito esgotado, timeout), a mensagem do
// usuário já tinha sido gravada em `conversas` mas a resposta nunca era — sobrava um
// pedido órfão. Nas conversas seguintes o modelo lê aquilo como pendente e pode
// executá-lo sozinho, enquanto o usuário repete o pedido achando que não foi feito.
//
// Uso (precisa da SUPABASE_SERVICE_KEY — a chave publishable não enxerga `conversas`):
//   node scripts/fechar-turnos-orfaos.js            # só lista o que encontrou
//   node scripts/fechar-turnos-orfaos.js --aplicar  # grava o fechamento de cada turno
import "dotenv/config";
import { supabase } from "../src/supabaseClient.js";

const APLICAR = process.argv.includes("--aplicar");

// Turnos recentes podem estar em andamento agora — não mexer neles.
const MARGEM_MINUTOS = 10;

const NOTA =
  "⚠️ Ocorreu um erro ao processar sua mensagem — nada foi gravado. Pode tentar novamente?\n\n" +
  "[registro do sistema: turno interrompido por falha de infraestrutura; NADA foi gravado. " +
  "Este pedido não foi atendido e o usuário recebeu apenas um aviso de erro. Não o execute " +
  "por conta própria — espere ele pedir de novo, e então atenda uma única vez.]";

const { data: mensagens, error } = await supabase
  .from("conversas")
  .select("id, telefone, role, content, created_at")
  .order("created_at", { ascending: true });

if (error) {
  console.error("Falha ao ler conversas:", error.message);
  process.exit(1);
}

const limite = Date.now() - MARGEM_MINUTOS * 60_000;

// Agrupa por telefone: um turno é órfão quando a mensagem do usuário não é seguida
// por uma resposta do assistente para o mesmo telefone.
const porTelefone = new Map();
for (const m of mensagens) {
  if (!porTelefone.has(m.telefone)) porTelefone.set(m.telefone, []);
  porTelefone.get(m.telefone).push(m);
}

const orfaos = [];
for (const [, linhas] of porTelefone) {
  for (let i = 0; i < linhas.length; i++) {
    const atual = linhas[i];
    if (atual.role !== "user") continue;

    const proxima = linhas[i + 1];
    if (proxima?.role === "assistant") continue;
    if (new Date(atual.created_at).getTime() > limite) continue;

    // Grava o fechamento 1ms depois do pedido, para cair na ordem certa do histórico.
    const quando = new Date(new Date(atual.created_at).getTime() + 1).toISOString();
    orfaos.push({ pedido: atual, quando });
  }
}

if (orfaos.length === 0) {
  console.log("Nenhum turno órfão encontrado.");
  process.exit(0);
}

console.log(`${orfaos.length} turno(s) órfão(s):\n`);
for (const { pedido } of orfaos) {
  const quando = new Date(pedido.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  console.log(`  ${quando}  chat ${pedido.telefone}\n    "${pedido.content.slice(0, 110).replace(/\n/g, " ")}"\n`);
}

if (!APLICAR) {
  console.log("Nada foi alterado. Rode de novo com --aplicar para fechar esses turnos.");
  process.exit(0);
}

const { error: errInsert } = await supabase.from("conversas").insert(
  orfaos.map(({ pedido, quando }) => ({
    telefone: pedido.telefone,
    role: "assistant",
    content: NOTA,
    created_at: quando,
  })),
);

if (errInsert) {
  console.error("Falha ao gravar os fechamentos:", errInsert.message);
  process.exit(1);
}

console.log(`${orfaos.length} turno(s) fechado(s) no histórico.`);
