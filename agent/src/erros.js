// Erro de referência inválida (ID que não existe no banco) é recuperável: o loop do
// agente pode devolver a lista de opções válidas ao modelo e deixá-lo tentar de novo
// na mesma conversa, em vez de interromper e obrigar o usuário a reenviar tudo.
export class ReferenciaInvalidaError extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = "ReferenciaInvalidaError";
    this.recuperavel = true;
  }
}

// SQLSTATE que o banco usa para erro de regra de negócio (migration 005 em diante). A
// mensagem que vem com ele é escrita para ser mostrada ao usuário exatamente como está.
export const SQLSTATE_TRAVA = "TRV01";

export function ehTravaDoBanco(err) {
  return err?.code === SQLSTATE_TRAVA;
}

// Trava do banco: uma viagem que já está numa ordem fechada não muda de valor, empresa
// ou cliente. O OPOSTO de recuperável — tentar de novo dá o mesmo erro, e o risco real é
// o modelo tentar contornar o bloqueio criando uma viagem nova com o valor corrigido, o
// que duplicaria o faturamento. Por isso o turno termina aqui, e a mensagem do banco vai
// ao usuário inteira: ela já diz o que fazer (reabrir a ordem na web).
export class TravaDoBancoError extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = "TravaDoBancoError";
    this.recuperavel = false;
    this.mensagemParaUsuario = true;
  }
}
