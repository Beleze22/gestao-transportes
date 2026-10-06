import { brl } from "@/lib/formato";

// ESPELHO da view `devidos_entre_empresas` (migration 007). Esta é a única regra de
// dinheiro duplicada no projeto, e a duplicação é deliberada: a prévia precisa do valor
// ANTES de a ordem ser recebida, quando ainda não existe linha para a view calcular.
//
// A view é a fonte de verdade — é ela que alimenta o extrato e o saldo. Isto aqui serve
// só para a tela mostrar o número antes de confirmar. Se as duas divergirem, a prévia
// promete um repasse e o extrato cobra outro.
//
// Os quatro casos abaixo são os exemplos da spec e estão testados nos DOIS lados: aqui
// pelos comentários e pelo olho, e no banco por docs/specs/03-repasses-testes.sql,
// critério 1. Mudou a regra? Mude os dois e rode o script.
//
// T = 1500 (Rohan 1000, TransBeleze 500), a = 9%:
//   sem nota, caiu na Rohan ......... Rohan deve    500,00 à TransBeleze
//   nota Rohan, caiu na Rohan ....... Rohan deve    455,00 à TransBeleze
//   nota Rohan, caiu na TransBeleze . TransBeleze deve 1.045,00 à Rohan
//   nota TransBeleze, caiu na Rohan . Rohan deve    590,00 à TransBeleze

export const DIAS_ATE_ALIQUOTA_VENCER = 35;

export const outraEmpresa = (empresa) =>
  empresa === "Rohan" ? "TransBeleze" : "Rohan";

// Centavos. O `round` do Postgres arredonda meio para cima, longe do zero; o Math.round
// faz o mesmo para valor positivo, que é o único caso aqui (o devido é sempre > 0).
const emCentavos = (v) => Math.round(v * 100) / 100;

// `totais` é { Rohan, TransBeleze } — a soma de frete das viagens da ordem por empresa.
export function calcularDevido({ totais, comNota, empresaNota, empresaRecebedora, aliquota }) {
  if (!empresaRecebedora) return null;

  const a = Number(aliquota ?? 0);
  const T = (totais.Rohan ?? 0) + (totais.TransBeleze ?? 0);
  // A parte da OUTRA empresa, não a de quem recebeu: é ela que precisa ser repassada.
  const V = totais[outraEmpresa(empresaRecebedora)] ?? 0;

  let valor;
  if (!comNota) {
    // Sem nota não há imposto no meio: vai a parte da outra, inteira.
    valor = V;
  } else if (empresaNota === empresaRecebedora) {
    // Nota de quem recebeu: desconta o imposto que ele vai pagar sobre essa parte.
    valor = V * (1 - a);
  } else {
    // Nota da outra: repassa a parte dela inteira e devolve o imposto das próprias
    // viagens, porque quem vai pagar o imposto da nota toda é a outra empresa.
    valor = V + a * (T - V);
  }

  const devido = emCentavos(valor);
  if (devido <= 0) return null;

  return {
    valor: devido,
    devedora: empresaRecebedora,
    credora: outraEmpresa(empresaRecebedora),
    aliquota: comNota ? a : 0,
    parteDaOutra: V,
    total: T,
  };
}

// Como o devido é explicado na tela. Sempre por extenso: "menos 9% de imposto" é o que
// permite ao gerente conferir a conta de cabeça.
export function explicarDevido(devido, { comNota, empresaNota, empresaRecebedora }) {
  if (!devido) return null;

  const pct = `${(devido.aliquota * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

  if (!comNota) {
    return `A parte da ${devido.credora} (${brl(devido.parteDaOutra)}), sem desconto, porque esta ordem não tem nota.`;
  }
  if (empresaNota === empresaRecebedora) {
    return `A parte da ${devido.credora} (${brl(devido.parteDaOutra)}) menos ${pct} de imposto, porque a nota é da ${empresaNota}.`;
  }
  return `A parte da ${devido.credora} (${brl(devido.parteDaOutra)}) mais ${pct} de imposto sobre as viagens da ${devido.devedora}, porque a nota é da ${empresaNota} e é ela que vai pagar o imposto.`;
}

// O saldo vem da view no sentido TransBeleze -> Rohan. Positivo, a TransBeleze deve.
// Escrito por extenso, nunca só com sinal (docs/design.md).
export function fraseDoSaldo(saldo) {
  const valor = Number(saldo ?? 0);
  if (Math.abs(valor) < 0.005) return "Sem saldo entre as empresas.";
  return valor > 0
    ? `TransBeleze deve ${brl(valor)} à Rohan`
    : `Rohan deve ${brl(-valor)} à TransBeleze`;
}

// A alíquota é uma estimativa do imposto do mês anterior e deve mudar todo mês. Passando
// de 35 dias, ela provavelmente está velha — e um repasse calculado com a faixa errada
// transfere dinheiro a menos ou a mais.
export function aliquotaVencida(atualizadaEm) {
  if (!atualizadaEm) return true;
  const dias = (Date.now() - new Date(atualizadaEm).getTime()) / 86400000;
  return dias > DIAS_ATE_ALIQUOTA_VENCER;
}

export const diasDesdeAtualizacao = (atualizadaEm) =>
  atualizadaEm
    ? Math.floor((Date.now() - new Date(atualizadaEm).getTime()) / 86400000)
    : null;

export const comoPercentual = (aliquota) =>
  `${(Number(aliquota ?? 0) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
