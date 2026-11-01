import { SetMetadata } from '@nestjs/common';

export const ES_PUBLICA = 'esPublica';

/** Marca una ruta que no necesita iniciar sesión (por ejemplo /salud). */
export const Publica = () => SetMetadata(ES_PUBLICA, true);
