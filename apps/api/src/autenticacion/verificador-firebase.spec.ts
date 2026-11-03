import { ServiceUnavailableException } from '@nestjs/common';
import { GestorUsuariosFirebase, hayCuentaDeServicio, MENSAJE_SIN_CUENTA_SERVICIO } from './verificador-firebase.js';

describe('GestorUsuariosFirebase sin cuenta de servicio', () => {
  const anterior = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const adcAnterior = process.env.FIREBASE_USAR_ADC;
  beforeEach(() => {
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    delete process.env.FIREBASE_USAR_ADC;
  });
  afterEach(() => {
    if (anterior !== undefined) process.env.GOOGLE_APPLICATION_CREDENTIALS = anterior;
    if (adcAnterior !== undefined) process.env.FIREBASE_USAR_ADC = adcAnterior;
    else delete process.env.FIREBASE_USAR_ADC;
  });

  it('crear usuarios explica en español qué falta configurar', async () => {
    const gestor = new GestorUsuariosFirebase();
    await expect(gestor.crearOObtener('a@b.test', 'secreta1', 'A')).rejects.toThrow(ServiceUnavailableException);
    await expect(gestor.crearOObtener('a@b.test', 'secreta1', 'A')).rejects.toThrow(MENSAJE_SIN_CUENTA_SERVICIO);
  });

  it('desactivar no falla: la base es la que quita el acceso', async () => {
    await expect(new GestorUsuariosFirebase().cambiarActivo('uid', false)).resolves.toMatchObject({ sincronizado: false, aviso: expect.stringContaining('cuenta de servicio') });
  });

  it('admite la identidad de Cloud Run sin guardar un archivo de clave privada', () => {
    expect(hayCuentaDeServicio()).toBe(false);
    process.env.FIREBASE_USAR_ADC = 'true';
    expect(hayCuentaDeServicio()).toBe(true);
  });
});
