// Stub para uma futura implementação do MotorDeVoz sobre Pipecat.
//
// Princípio central da spec: o motor de voz é uma peça trocável e invisível
// ao cliente. Quando a migração for decidida, implemente MotorDeVoz aqui —
// painel e orquestração não precisam mudar, só o valor de MOTOR_DE_VOZ e a
// entrada correspondente na factory em ./index.ts.

// import type {
//   ChamadaNormalizada,
//   CriarAssistenteParams,
//   CriarAssistenteResultado,
//   DispararLigacaoParams,
//   DispararLigacaoResultado,
//   MotorDeVoz,
// } from './tipos';
//
// export class PipecatMotor implements MotorDeVoz {
//   async criarAssistente(params: CriarAssistenteParams): Promise<CriarAssistenteResultado> {
//     throw new Error('PipecatMotor: não implementado.');
//   }
//
//   async dispararLigacao(params: DispararLigacaoParams): Promise<DispararLigacaoResultado> {
//     throw new Error('PipecatMotor: não implementado.');
//   }
//
//   normalizarWebhook(payload: unknown): ChamadaNormalizada | null {
//     throw new Error('PipecatMotor: não implementado.');
//   }
// }
