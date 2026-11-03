import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service.js';
import { ES_PUBLICA } from './publica.decorator.js';
import { ROLES_PERMITIDOS } from './roles.decorator.js';
import type { RequestConUsuario, Rol, UsuarioSesion } from './usuario-sesion.js';
import { VerificadorFirebase } from './verificador-firebase.js';

export const MENSAJE_SIN_ACCESO = 'Tu usuario no tiene acceso. Habla con el administrador.';

/**
 * Protege todas las rutas (salvo las marcadas con @Publica):
 * 1) verifica el token de Firebase que manda la app (Authorization: Bearer ...);
 * 2) busca al usuario por firebase_uid en la base, con su rol y sus centros;
 * 3) si no existe o está inactivo, responde "Tu usuario no tiene acceso...".
 */
@Injectable()
export class AutenticacionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verificador: VerificadorFirebase,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const esPublica = this.reflector.getAllAndOverride<boolean>(ES_PUBLICA, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (esPublica) return true;

    const req = contexto.switchToHttp().getRequest<RequestConUsuario>();
    const token = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '')?.[1];
    if (!token) {
      throw new UnauthorizedException('Necesitas iniciar sesión.');
    }

    let uid: string;
    try {
      uid = (await this.verificador.verificar(token)).uid;
    } catch {
      throw new UnauthorizedException('Tu sesión terminó o no es válida. Vuelve a iniciar sesión.');
    }

    const usuario = await this.buscarUsuario(uid);
    req.usuario = usuario;

    // Permisos por rol (@Roles en la ruta o el controlador)
    const roles = this.reflector.getAllAndOverride<Rol[] | undefined>(ROLES_PERMITIDOS, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (roles && !roles.includes(usuario.rol)) {
      throw new ForbiddenException('No tienes permiso para hacer esto.');
    }
    if (usuario.rol !== 'ADMIN') {
      const modulo = req.path.split('/')[1];
      const accion = req.method === 'GET' ? 'ver' : req.method === 'DELETE' || req.path.endsWith('/anulacion') ? 'anular' : req.method === 'PATCH' || /\/(estado|cierre|precios|lineas)$/.test(req.path) ? 'editar' : 'crear';
      if (usuario.permisos?.some(p => p.modulo === modulo && (p.accion === 'ver' || p.accion === accion) && !p.permitido)) throw new ForbiddenException('Tu administrador restringió esta acción para tu usuario.');
    }

    // Centro de venta elegido en la app: debe ser uno de los centros del usuario
    const encabezado = req.headers['x-centro-id'];
    if (encabezado !== undefined && encabezado !== '') {
      const centroId = Number(Array.isArray(encabezado) ? encabezado[0] : encabezado);
      if (!Number.isInteger(centroId) || !usuario.centros.some((c) => c.id === centroId)) {
        throw new ForbiddenException('No tienes acceso a ese centro de venta.');
      }
      req.centroId = centroId;
    }
    return true;
  }

  private async buscarUsuario(uid: string): Promise<UsuarioSesion> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { firebase_uid: uid },
      include: { usuario_centro: { include: { centro_venta: true } } },
    });
    if (!usuario || !usuario.activo) {
      throw new ForbiddenException(MENSAJE_SIN_ACCESO);
    }

    const centros =
      usuario.rol === 'ADMIN'
        ? await this.prisma.centro_venta.findMany({ where: { activo: true }, orderBy: { id: 'asc' } })
        : usuario.usuario_centro
            .map((uc) => uc.centro_venta)
            .filter((c) => c.activo)
            .sort((a, b) => a.id - b.id);

    const permisos = await this.prisma.permiso_usuario.findMany({ where: { usuario_id: usuario.id }, select: { modulo: true, accion: true, permitido: true } });
    return {
      id: usuario.id,
      firebaseUid: usuario.firebase_uid,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol as Rol,
      centros: centros.map((c) => ({ id: c.id, codigo: c.codigo, nombre: c.nombre })),
      ...(permisos.length ? { permisos } : {}),
    };
  }
}
