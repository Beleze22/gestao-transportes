// Moeda e data, como o docs/design.md define.
//
// Existem duas cópias antigas deste `brl` em App.jsx e em Dashboard.jsx. Não foram
// trocadas aqui para o diff da spec 02 não misturar faxina com funcionalidade — virou
// linha no MELHORIAS.md. Código novo usa este.

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export const brl = (v) => MOEDA.format(v || 0);

// O "T12:00:00" não é decoração: `new Date("2026-10-01")` é interpretado como meia-noite
// UTC e, no fuso de São Paulo, volta como 30/09. Meio-dia sobrevive a qualquer fuso.
const comHora = (iso) => new Date(`${iso}T12:00:00`);

// Em tabela, dd/mm — a coluna fica estreita e o ano é quase sempre o corrente.
export const dataCurta = (iso) =>
  iso ? comHora(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—";

// Em campo, cabeçalho e detalhe, dd/mm/aaaa.
export const dataBR = (iso) => (iso ? comHora(iso).toLocaleDateString("pt-BR") : "—");

// "Galpão → São Paulo Expo". Logística é opcional na viagem, então isto pode sair vazio.
// Há uma cópia desta função dentro do Dashboard.jsx (`rotaDaViagem`), anterior a este
// arquivo — também no MELHORIAS.md.
export const rota = (viagem) =>
  [viagem.local_carregamento, viagem.local_descarregamento].filter(Boolean).join(" → ");
