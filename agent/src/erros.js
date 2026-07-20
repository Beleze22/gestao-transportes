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
