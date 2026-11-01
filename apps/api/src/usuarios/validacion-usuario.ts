import { BadRequestException } from '@nestjs/common';
import { ROLES, type Rol } from '../autenticacion/usuario-sesion.js';

export interface DatosNuevoUsuario {
  nombre: string;
  email: string;
  rol: Rol;
  centros: number[];
  /** Contraseña inicial: se usa para crear el usuario en Firebase. */
  contrasena?: string;
  /** UID de un usuario que ya existe en Firebase (creado en la consola). */
  firebaseUid?: string;
}

export interface CambiosUsuario {
  nombre?: string;
  rol?: Rol;
  centros?: number[];
}

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function objeto(cuerpo: unknown): Record<string, unknown> {
  if (typeof cuerpo !== 'object' || cuerpo === null || Array.isArray(cuerpo)) {
    throw new BadRequestException('Faltan los datos del usuario.');
  }
  return cuerpo as Record<string, unknown>;
}

function leerNombre(valor: unknown): string {
  const nombre = typeof valor === 'string' ? valor.trim() : '';
  if (!nombre) throw new BadRequestException('Escribe el nombre del usuario.');
  if (nombre.length > 100) throw new BadRequestException('El nombre no puede tener más de 100 letras.');
  return nombre;
}

function leerRol(valor: unknown): Rol {
  if (typeof valor !== 'string' || !ROLES.includes(valor as Rol)) {
    throw new BadRequestException('Elige un rol válido: ADMIN, GERENTE, CAJERO, MESERO o COCINA.');
  }
  return valor as Rol;
}

function leerCentros(valor: unknown): number[] {
  if (!Array.isArray(valor) || !valor.every((c) => Number.isInteger(c) && (c as number) > 0)) {
    throw new BadRequestException('La lista de centros de venta no es válida.');
  }
  return [...new Set(valor as number[])];
}

/** Revisa los datos para crear un usuario. Lanza un error en español si algo falta. */
export function validarNuevoUsuario(cuerpo: unknown): DatosNuevoUsuario {
  const c = objeto(cuerpo);
  const nombre = leerNombre(c.nombre);
  const email = typeof c.email === 'string' ? c.email.trim().toLowerCase() : '';
  if (!CORREO.test(email) || email.length > 150) {
    throw new BadRequestException('Escribe un correo válido.');
  }
  const rol = leerRol(c.rol);
  const centros = leerCentros(c.centros ?? []);
  if (rol !== 'ADMIN' && centros.length === 0) {
    throw new BadRequestException('Asigna al menos un centro de venta.');
  }

  const firebaseUid = typeof c.firebaseUid === 'string' ? c.firebaseUid.trim() : '';
  const contrasena = typeof c.contrasena === 'string' ? c.contrasena : '';
  if (!firebaseUid && !contrasena) {
    throw new BadRequestException('Escribe una contraseña inicial o el UID del usuario en Firebase.');
  }
  if (!firebaseUid && contrasena.length < 6) {
    throw new BadRequestException('La contraseña debe tener al menos 6 caracteres.');
  }
  if (firebaseUid.length > 128) {
    throw new BadRequestException('El UID de Firebase no es válido.');
  }

  return {
    nombre,
    email,
    rol,
    centros,
    ...(firebaseUid ? { firebaseUid } : { contrasena }),
  };
}

/** Revisa los cambios de un usuario (nombre, rol y centros). */
export function validarCambiosUsuario(cuerpo: unknown): CambiosUsuario {
  const c = objeto(cuerpo);
  const cambios: CambiosUsuario = {};
  if (c.nombre !== undefined) cambios.nombre = leerNombre(c.nombre);
  if (c.rol !== undefined) cambios.rol = leerRol(c.rol);
  if (c.centros !== undefined) cambios.centros = leerCentros(c.centros);
  if (Object.keys(cambios).length === 0) {
    throw new BadRequestException('No hay cambios para guardar.');
  }
  return cambios;
}
