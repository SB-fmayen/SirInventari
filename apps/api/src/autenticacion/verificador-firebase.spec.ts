import { ServiceUnavailableException } from '@nestjs/common';
import { GestorUsuariosFirebase, MENSAJE_SIN_CUENTA_SERVICIO } from './verificador-firebase.js';

describe('GestorUsuariosFirebase sin cuenta de servicio', () => {
  const anterior = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  beforeEach(() => {
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  });
  afterEach(() => {
    if (anterior !== undefined) process.env.GOOGLE_APPLICATION_CREDENTIALS = anterior;
  });

  it('crear usuarios explica en español qué falta configurar', async () => {
    const gestor = new GestorUsuariosFirebase();
    await expect(gestor.crearOObtener('a@b.test', 'secreta1', 'A')).rejects.toThrow(ServiceUnavailableException);
    await expect(gestor.crearOObtener('a@b.test', 'secreta1', 'A')).rejects.toThrow(MENSAJE_SIN_CUENTA_SERVICIO);
  });

  it('desactivar no falla: la base es la que quita el acceso', async () => {
    await expect(new GestorUsuariosFirebase().cambiarActivo('uid', false)).resolves.toBeUndefined();
  });
});
