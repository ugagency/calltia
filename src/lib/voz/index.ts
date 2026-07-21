import type { MotorDeVoz } from './tipos';
import { VapiMotor } from './vapi';

// Ponto único de decisão de qual motor de voz está ativo. O resto do
// sistema chama criarMotor() e usa a interface MotorDeVoz — nunca importa
// VapiMotor (ou um futuro PipecatMotor) diretamente.
export function criarMotor(): MotorDeVoz {
  const motor = process.env.MOTOR_DE_VOZ ?? 'vapi';

  switch (motor) {
    case 'vapi':
      return new VapiMotor();
    default:
      throw new Error(`MOTOR_DE_VOZ desconhecido: "${motor}".`);
  }
}
