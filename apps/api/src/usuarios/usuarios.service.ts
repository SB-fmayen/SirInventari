import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Rol } from '../autenticacion/usuario-sesion.js';
import { GestorUsuariosFirebase } from '../autenticacion/verificador-firebase.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CambiosUsuario, DatosNuevoUsuario } from './validacion-usuario.js';

export interface UsuarioListado {
  id: number;
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
  firebaseUid: string;
  centros: { id: number; codigo: string; nombre: string }[];
}

const INCLUIR_CENTROS = { usuario_centro: { include: { centro_venta: true } } } as const;

type UsuarioConCentros = {
  id: number;
  nombre: string;
  email: string;
  rol: string;
  activo: boolean;
  firebase_uid: string;
  usuario_centro: { centro_venta: { id: number; codigo: string; nombre: string } }[];
};

function aListado(u: UsuarioConCentros): UsuarioListado {
  return {
    id: u.id,
    nombre: u.nombre,
    email: u.email,
    rol: u.rol as Rol,
    activo: u.activo,
    firebaseUid: u.firebase_uid,
    centros: u.usuario_centro
      .map(({ centro_venta: c }) => ({ id: c.id, codigo: c.codigo, nombre: c.nombre }))
      .sort((a, b) => a.id - b.id),
  };
}

@Injectable()
export class UsuariosService {
  private readonly logger = new Logger('Usuarios');

  constructor(
    private readonly prisma: PrismaService,
    private readonly firebase: GestorUsuariosFirebase,
  ) {}

  async listar(): Promise<UsuarioListado[]> {
    const usuarios = await this.prisma.usuario.findMany({
      include: INCLUIR_CENTROS,
      orderBy: [{ activo: 'desc' }, { nombre: 'asc' }],
    });
    return usuarios.map(aListado);
  }

  async listarCentros() {
    return this.prisma.centro_venta.findMany({
      where: { activo: true },
      select: { id: true, codigo: true, nombre: true },
      orderBy: { id: 'asc' },
    });
  }

  /** Los centros deben existir y estar activos. */
  private async revisarCentros(centros: number[]): Promise<void> {
    if (centros.length === 0) return;
    const encontrados = await this.prisma.centro_venta.count({
      where: { id: { in: centros }, activo: true },
    });
    if (encontrados !== centros.length) {
      throw new BadRequestException('Uno de los centros de venta no existe o está desactivado.');
    }
  }

  /**
   * Crea el usuario en Firebase (o usa el UID que ya existe allí) y lo registra en la base
   * con su rol y sus centros. Si la base falla, se deshace lo creado en Firebase.
   */
  async crear(datos: DatosNuevoUsuario): Promise<UsuarioListado> {
    await this.revisarCentros(datos.centros);
    // Se revisa antes de tocar Firebase para no dejar cuentas sueltas allí
    if (await this.prisma.usuario.findUnique({ where: { email: datos.email } })) {
      throw new ConflictException('Ya existe un usuario con ese correo.');
    }
    if (datos.firebaseUid && (await this.prisma.usuario.findUnique({ where: { firebase_uid: datos.firebaseUid } }))) {
      throw new ConflictException('Ese usuario de Firebase ya está registrado.');
    }

    let uid = datos.firebaseUid;
    let creadoEnFirebase = false;
    if (!uid) {
      const resultado = await this.firebase.crearOObtener(datos.email, datos.contrasena!, datos.nombre);
      uid = resultado.uid;
      creadoEnFirebase = resultado.creado;
    }

    try {
      const usuario = await this.prisma.$transaction(async (tx) => {
        const nuevo = await tx.usuario.create({
          data: { firebase_uid: uid, nombre: datos.nombre, email: datos.email, rol: datos.rol },
        });
        if (datos.centros.length > 0) {
          await tx.usuario_centro.createMany({
            data: datos.centros.map((centro_venta_id) => ({ usuario_id: nuevo.id, centro_venta_id })),
          });
        }
        return tx.usuario.findUniqueOrThrow({ where: { id: nuevo.id }, include: INCLUIR_CENTROS });
      });
      return aListado(usuario);
    } catch (error) {
      if (creadoEnFirebase) {
        await this.firebase.borrar(uid).catch((e) =>
          this.logger.warn(`No se pudo borrar ${uid} de Firebase al deshacer: ${String(e)}`),
        );
      }
      throw error;
    }
  }

  async actualizar(id: number, cambios: CambiosUsuario): Promise<UsuarioListado> {
    const actual = await this.prisma.usuario.findUnique({ where: { id }, include: INCLUIR_CENTROS });
    if (!actual) throw new NotFoundException('No se encontró el usuario.');

    const rolFinal = cambios.rol ?? (actual.rol as Rol);
    const centrosFinales = cambios.centros ?? actual.usuario_centro.map((uc) => uc.centro_venta_id);
    if (rolFinal !== 'ADMIN' && centrosFinales.length === 0) {
      throw new BadRequestException('Asigna al menos un centro de venta.');
    }
    if (cambios.centros) await this.revisarCentros(cambios.centros);

    const usuario = await this.prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id },
        data: {
          ...(cambios.nombre !== undefined ? { nombre: cambios.nombre } : {}),
          ...(cambios.rol !== undefined ? { rol: cambios.rol } : {}),
        },
      });
      if (cambios.centros) {
        await tx.usuario_centro.deleteMany({ where: { usuario_id: id } });
        if (cambios.centros.length > 0) {
          await tx.usuario_centro.createMany({
            data: cambios.centros.map((centro_venta_id) => ({ usuario_id: id, centro_venta_id })),
          });
        }
      }
      return tx.usuario.findUniqueOrThrow({ where: { id }, include: INCLUIR_CENTROS });
    });
    return aListado(usuario);
  }

  /** Activa o desactiva. Un usuario desactivado pierde el acceso de inmediato (la API revisa la base). */
  async cambiarActivo(id: number, activo: boolean, quienPide: number): Promise<UsuarioListado> {
    if (id === quienPide && !activo) {
      throw new BadRequestException('No puedes desactivar tu propio usuario.');
    }
    const existente = await this.prisma.usuario.findUnique({ where: { id } });
    if (!existente) throw new NotFoundException('No se encontró el usuario.');
    const usuario = await this.prisma.usuario.update({
      where: { id },
      data: { activo },
      include: INCLUIR_CENTROS,
    });
    await this.firebase.cambiarActivo(usuario.firebase_uid, activo);
    return aListado(usuario);
  }
}
