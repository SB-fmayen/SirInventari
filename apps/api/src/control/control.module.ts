import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { Roles } from '../autenticacion/roles.decorator.js';
import {
  CentroActual,
  UsuarioActual,
  type UsuarioSesion,
} from '../autenticacion/usuario-sesion.js';
import { objeto, texto, uuid } from '../pedidos/validacion-pedido.js';
import { TiempoRealModule } from '../tiempo-real/tiempo-real.module.js';
import { TiempoRealGateway } from '../tiempo-real/tiempo-real.gateway.js';

const motivoDe = (v: unknown) => {
  const m = texto(v, 300);
  if (!m) throw new BadRequestException('Escribe el motivo.');
  return m;
};
const tipos = ['CORTESIA', 'RETROCEDER_COCINA', 'ANULAR_PAGO', 'ANULAR_LINEA'];
const modulos = [
  'pedidos',
  'cocina',
  'caja',
  'turnos',
  'catalogo',
  'reportes',
  'usuarios',
  'clientes',
  'papelera',
];
const acciones = ['ver', 'crear', 'editar', 'anular', 'autorizar'];

@Injectable()
export class ControlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tiempoReal: TiempoRealGateway,
  ) {}

  async resumen(centro: number, u: UsuarioSesion) {
    const visible = (modulo: string) =>
      u.rol === 'ADMIN' ||
      !u.permisos?.some(
        (p) => p.modulo === modulo && p.accion === 'ver' && !p.permitido,
      );
    const esCaja =
      ['ADMIN', 'GERENTE', 'CAJERO'].includes(u.rol) && visible('caja');
    const esPedidos =
      ['ADMIN', 'GERENTE', 'CAJERO', 'MESERO'].includes(u.rol) &&
      visible('pedidos');
    const esCocina =
      ['ADMIN', 'GERENTE', 'COCINA'].includes(u.rol) && visible('cocina');
    const abiertos = await this.prisma.pedido.findMany({
      where: {
        centro_venta_id: centro,
        estado: { notIn: ['PAGADO', 'ANULADO'] },
      },
      select: {
        id: true,
        total: true,
        pago: { where: { estado: 'APLICADO' }, select: { monto: true } },
      },
    });
    const pendientes = esPedidos ? abiertos.length : undefined;
    const listos = await this.prisma.pedido.count({
      where: {
        centro_venta_id: centro,
        estado: { not: 'ANULADO' },
        estado_cocina: 'LISTO',
        eliminado_en: null,
      },
    });
    const turno =
      esCaja && visible('turnos')
        ? await this.prisma.turno_caja.findFirst({
            where: { centro_venta_id: centro, estado: 'ABIERTO' },
            select: { id: true, abierto_en: true },
          })
        : undefined;
    return {
      pendientes,
      listos: esPedidos || esCocina ? listos : undefined,
      turno,
      saldo: esCaja
        ? abiertos
            .reduce(
              (s, p) =>
                s
                  .plus(p.total)
                  .minus(
                    p.pago.reduce(
                      (s, x) => s.plus(x.monto),
                      new Prisma.Decimal(0),
                    ),
                  ),
              new Prisma.Decimal(0),
            )
            .toFixed(2)
        : undefined,
    };
  }

  async solicitar(centro: number, u: UsuarioSesion, cuerpo: unknown) {
    const c = objeto(cuerpo);
    const id = uuid(c.id);
    const pedidoId = uuid(c.pedido_id);
    if (typeof c.tipo !== 'string' || !tipos.includes(c.tipo))
      throw new BadRequestException('La acción solicitada no es válida.');
    const permitidos =
      c.tipo === 'RETROCEDER_COCINA'
        ? ['ADMIN', 'GERENTE', 'COCINA']
        : c.tipo === 'ANULAR_LINEA'
          ? ['ADMIN', 'GERENTE', 'CAJERO', 'MESERO']
          : ['ADMIN', 'GERENTE', 'CAJERO'];
    if (!permitidos.includes(u.rol))
      throw new ForbiddenException(
        'No tienes permiso para solicitar esta acción.',
      );
    const modulo =
      c.tipo === 'RETROCEDER_COCINA'
        ? 'cocina'
        : c.tipo === 'ANULAR_LINEA'
          ? 'pedidos'
          : 'caja';
    if (
      u.rol !== 'ADMIN' &&
      (await this.prisma.permiso_usuario.findFirst({
        where: {
          usuario_id: u.id,
          modulo,
          accion: { in: ['ver', 'anular'] },
          permitido: false,
        },
      }))
    )
      throw new ForbiddenException(
        'No tienes permiso para solicitar esta acción.',
      );
    const motivo = motivoDe(c.motivo);
    const referencia = texto(c.referencia, 50);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))::text`;
      const existente = await tx.solicitud_autorizacion.findUnique({
        where: { id },
      });
      if (existente) {
        if (
          existente.centro_venta_id !== centro ||
          existente.solicitado_por !== u.id ||
          existente.pedido_id !== pedidoId ||
          existente.tipo !== c.tipo ||
          existente.motivo !== motivo ||
          existente.referencia !== referencia
        )
          throw new ConflictException(
            'La solicitud ya existe con otros datos.',
          );
        return existente;
      }
      const p = await tx.pedido.findFirst({
        where: { id: pedidoId, centro_venta_id: centro },
      });
      if (!p)
        throw new NotFoundException('No se encontró el pedido en este centro.');
      return tx.solicitud_autorizacion.create({
        data: {
          id,
          centro_venta_id: centro,
          pedido_id: p.id,
          tipo: c.tipo as string,
          referencia,
          version_pedido: p.version,
          motivo,
          solicitado_por: u.id,
        },
      });
    });
  }

  listar(centro: number, u: UsuarioSesion) {
    const visibles = tipos.filter(
      (t) =>
        u.rol === 'ADMIN' ||
        !u.permisos?.some(
          (p) =>
            p.modulo ===
              (t === 'RETROCEDER_COCINA'
                ? 'cocina'
                : t === 'ANULAR_LINEA'
                  ? 'pedidos'
                  : 'caja') &&
            p.accion === 'ver' &&
            !p.permitido,
        ),
    );
    return this.prisma.solicitud_autorizacion.findMany({
      where: {
        centro_venta_id: centro,
        tipo: { in: visibles },
        ...(['ADMIN', 'GERENTE'].includes(u.rol)
          ? {}
          : { solicitado_por: u.id }),
      },
      include: {
        pedido: { select: { folio: true, fecha_operacion: true } },
        usuario_solicitud_autorizacion_solicitado_porTousuario: {
          select: { nombre: true },
        },
      },
      orderBy: { solicitado_en: 'desc' },
      take: 100,
    });
  }

  async resolver(
    centro: number,
    u: UsuarioSesion,
    id: string,
    cuerpo: unknown,
  ) {
    const c = objeto(cuerpo);
    if (typeof c.aprobar !== 'boolean')
      throw new BadRequestException(
        'Indica si apruebas o rechazas la solicitud.',
      );
    const nota = texto(c.nota, 300);
    const resultado = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM ventas.solicitud_autorizacion WHERE id=${id}::uuid AND centro_venta_id=${centro} FOR UPDATE`;
      const s = await tx.solicitud_autorizacion.findFirst({
        where: { id, centro_venta_id: centro },
      });
      if (!s) throw new NotFoundException('No se encontró la solicitud.');
      const modulo =
        s.tipo === 'RETROCEDER_COCINA'
          ? 'cocina'
          : s.tipo === 'ANULAR_LINEA'
            ? 'pedidos'
            : 'caja';
      if (
        u.rol !== 'ADMIN' &&
        (await tx.permiso_usuario.findFirst({
          where: {
            usuario_id: u.id,
            modulo,
            accion: { in: ['ver', 'autorizar'] },
            permitido: false,
          },
        }))
      )
        throw new ForbiddenException(
          'No tienes permiso para autorizar esta operación.',
        );
      if (s.estado !== 'PENDIENTE') {
        if ((s.estado === 'APROBADA') !== c.aprobar)
          throw new ConflictException('La solicitud ya fue resuelta.');
        return s;
      }
      if (c.aprobar) {
        if (s.tipo === 'ANULAR_PAGO') {
          const pago = await tx.pago.findFirst({
            where: { id: uuid(s.referencia), pedido_id: s.pedido_id },
            select: { turno_id: true },
          });
          if (!pago)
            throw new NotFoundException('No se encontró el pago en el pedido.');
          // Orden de bloqueo igual que cobrar/cerrar: turno primero, pedido después.
          await tx.$queryRaw`SELECT id FROM ventas.turno_caja WHERE id=${pago.turno_id} FOR UPDATE`;
        }
        await tx.$queryRaw`SELECT id FROM ventas.pedido WHERE id=${s.pedido_id}::uuid FOR UPDATE`;
        const p = await tx.pedido.findUniqueOrThrow({
          where: { id: s.pedido_id },
        });
        if (p.version !== s.version_pedido)
          throw new ConflictException(
            'El pedido cambió. Rechaza esta solicitud y crea una nueva después de revisarlo.',
          );
        if (p.eliminado_en) throw new ConflictException('El pedido está en la papelera. Restaura su visibilidad antes de realizar otras acciones.');
        if (p.estado === 'ANULADO')
          throw new ConflictException('El pedido ya está anulado.');
        await tx.$queryRaw`SELECT set_config('app.usuario_id',${String(u.id)},true)`;
        if (s.tipo === 'CORTESIA') {
          if (
            p.estado === 'PAGADO' ||
            (await tx.pago.count({
              where: { pedido_id: p.id, estado: 'APLICADO' },
            }))
          )
            throw new ConflictException(
              'Primero anula los pagos aplicados. Un pedido pagado no se convierte en cortesía.',
            );
          if (
            !(await tx.pedido_detalle.count({
              where: { pedido_id: p.id, estado: 'ACTIVA' },
            }))
          )
            throw new ConflictException(
              'La cortesía debe tener productos activos.',
            );
          await tx.pedido.update({
            where: { id: p.id },
            data: {
              descuento: p.subtotal,
              estado: 'PAGADO',
              motivo_cortesia: s.motivo,
              cortesia_por: u.id,
              cortesia_en: new Date(),
              version: { increment: 1 },
              actualizado_en: new Date(),
            },
          });
        } else if (s.tipo === 'ANULAR_PAGO') {
          const pago = await tx.pago.findFirst({
            where: { id: uuid(s.referencia), pedido_id: p.id },
          });
          if (!pago || pago.estado !== 'APLICADO')
            throw new ConflictException(
              'No se encontró un pago aplicado para anular.',
            );
          const turno = await tx.turno_caja.findUniqueOrThrow({
            where: { id: pago.turno_id },
          });
          if (turno.estado !== 'ABIERTO')
            throw new ConflictException(
              'El turno de ese pago está cerrado. Requiere revisión contable antes de corregirlo.',
            );
          await tx.pago.update({
            where: { id: pago.id },
            data: {
              estado: 'ANULADO',
              motivo_anulacion: s.motivo.slice(0, 200),
              anulado_por: u.id,
              anulado_en: new Date(),
            },
          });
        } else if (s.tipo === 'RETROCEDER_COCINA') {
          const anterior: Record<string, string> = {
            ENTREGADO: 'LISTO',
            LISTO: 'EN_PREPARACION',
            EN_PREPARACION: 'PENDIENTE',
          };
          if (!anterior[p.estado_cocina])
            throw new ConflictException('El pedido ya está en pendientes.');
          await tx.pedido.update({
            where: { id: p.id },
            data: {
              estado_cocina: anterior[p.estado_cocina],
              version: { increment: 1 },
              actualizado_en: new Date(),
            },
          });
        } else {
          if (p.estado === 'PAGADO')
            throw new ConflictException(
              'Un pedido pagado no permite anular productos.',
            );
          const linea = await tx.pedido_detalle.findFirst({
            where: {
              id: uuid(s.referencia),
              pedido_id: p.id,
              estado: 'ACTIVA',
            },
          });
          if (!linea)
            throw new ConflictException('La línea ya no está activa.');
          await tx.pedido_detalle.update({
            where: { id: linea.id },
            data: {
              estado: 'ANULADA',
              anulado_por: u.id,
              anulado_en: new Date(),
              motivo_anulacion: s.motivo.slice(0, 200),
            },
          });
        }
      }
      return tx.solicitud_autorizacion.update({
        where: { id },
        data: {
          estado: c.aprobar ? 'APROBADA' : 'RECHAZADA',
          resuelto_por: u.id,
          resuelto_en: new Date(),
          nota,
        },
      });
    });
    await this.tiempoReal.publicar(centro, resultado.pedido_id);
    return resultado;
  }

  async eliminar(u: UsuarioSesion, recurso: string, numero: string) {
    const id = Number(numero);
    if (!Number.isSafeInteger(id) || id < 1)
      throw new BadRequestException('El identificador no es válido.');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(784210)::text`;
      if (recurso === 'usuarios') {
        if (u.id === id)
          throw new ConflictException('No puedes eliminar tu propio usuario.');
        const usuario = await tx.usuario.findUnique({ where: { id } });
        if (!usuario) throw new NotFoundException('No se encontró el usuario.');
        if (usuario.activo)
          throw new ConflictException(
            'Desactiva el usuario antes de eliminarlo.',
          );
        if (await tx.auditoria.count({ where: { usuario_id: id } }))
          throw new ConflictException(
            'El usuario tiene historial. Consérvalo desactivado.',
          );
        await tx.usuario_centro.deleteMany({ where: { usuario_id: id } });
        await tx.permiso_usuario.deleteMany({ where: { usuario_id: id } });
        await tx.usuario.delete({ where: { id } });
      } else if (recurso === 'productos') {
        if (await tx.pedido_detalle.count({ where: { producto_id: id } }))
          throw new ConflictException(
            'El producto tiene ventas. Desactívalo para conservar el historial.',
          );
        await tx.producto_centro.deleteMany({ where: { producto_id: id } });
        await tx.producto.delete({ where: { id } });
      } else if (recurso === 'categorias') {
        if (await tx.producto.count({ where: { categoria_id: id } }))
          throw new ConflictException(
            'La categoría tiene productos. Reasígnalos o desactiva la categoría.',
          );
        await tx.categoria.delete({ where: { id } });
      } else
        throw new BadRequestException(
          'Solo se eliminan usuarios, productos o categorías sin historial.',
        );
      await tx.auditoria.create({
        data: {
          tabla: recurso,
          registro_id: String(id),
          accion: 'DELETE',
          usuario_id: u.id,
          antes: {
            motivo: 'Eliminación administrativa de registro sin historial',
          },
        },
      });
      return {
        mensaje:
          'Registro eliminado de SirInventari. La cuenta de Firebase, si existe, se conserva.',
      };
    });
  }

  permisos(id: string) {
    return this.prisma.permiso_usuario.findMany({
      where: { usuario_id: Number(id) },
    });
  }
  async guardarPermisos(u: UsuarioSesion, numero: string, cuerpo: unknown) {
    const id = Number(numero);
    const c = objeto(cuerpo);
    if (
      !Number.isSafeInteger(id) ||
      id < 1 ||
      !Array.isArray(c.permisos) ||
      c.permisos.length > 35
    )
      throw new BadRequestException('La lista de permisos no es válida.');
    const permisos = c.permisos.map((v) => {
      const p = objeto(v);
      if (
        typeof p.modulo !== 'string' ||
        !modulos.includes(p.modulo) ||
        typeof p.accion !== 'string' ||
        !acciones.includes(p.accion) ||
        typeof p.permitido !== 'boolean'
      )
        throw new BadRequestException('Un permiso no es válido.');
      return {
        usuario_id: id,
        modulo: p.modulo,
        accion: p.accion,
        permitido: p.permitido,
      };
    });
    if (
      new Set(permisos.map((p) => `${p.modulo}.${p.accion}`)).size !==
      permisos.length
    )
      throw new BadRequestException('Hay permisos repetidos.');
    return this.prisma.$transaction(async (tx) => {
      const destino = await tx.usuario.findUniqueOrThrow({ where: { id } });
      if (destino.rol === 'ADMIN')
        throw new ConflictException(
          'Los administradores conservan sus permisos completos.',
        );
      await tx.permiso_usuario.deleteMany({ where: { usuario_id: id } });
      if (permisos.length)
        await tx.permiso_usuario.createMany({ data: permisos });
      await tx.auditoria.create({
        data: {
          tabla: 'permiso_usuario',
          registro_id: numero,
          accion: 'UPDATE',
          usuario_id: u.id,
          despues: permisos,
        },
      });
      return permisos;
    });
  }
}

@Controller('control')
@Roles('ADMIN', 'GERENTE', 'CAJERO', 'MESERO', 'COCINA')
export class ControlController {
  constructor(private readonly control: ControlService) {}
  @Get('resumen') resumen(
    @CentroActual() centro: number,
    @UsuarioActual() u: UsuarioSesion,
  ) {
    return this.control.resumen(centro, u);
  }
  @Get('solicitudes') listar(
    @CentroActual() centro: number,
    @UsuarioActual() u: UsuarioSesion,
  ) {
    return this.control.listar(centro, u);
  }
  @Post('solicitudes') solicitar(
    @CentroActual() centro: number,
    @UsuarioActual() u: UsuarioSesion,
    @Body() c: unknown,
  ) {
    return this.control.solicitar(centro, u, c);
  }
  @Roles('ADMIN', 'GERENTE')
  @Post('solicitudes/:id/resolver')
  resolver(
    @CentroActual() centro: number,
    @UsuarioActual() u: UsuarioSesion,
    @Param('id') id: string,
    @Body() c: unknown,
  ) {
    return this.control.resolver(centro, u, uuid(id), c);
  }
  @Roles('ADMIN')
  @Delete(':recurso/:id')
  eliminar(
    @UsuarioActual() u: UsuarioSesion,
    @Param('recurso') r: string,
    @Param('id') id: string,
  ) {
    return this.control.eliminar(u, r, id);
  }
  @Roles('ADMIN')
  @Get('permisos/:id')
  permisos(@Param('id') id: string) {
    return this.control.permisos(id);
  }
  @Roles('ADMIN')
  @Patch('permisos/:id')
  guardar(
    @UsuarioActual() u: UsuarioSesion,
    @Param('id') id: string,
    @Body() c: unknown,
  ) {
    return this.control.guardarPermisos(u, id, c);
  }
}

@Module({
  imports: [TiempoRealModule],
  controllers: [ControlController],
  providers: [ControlService],
})
export class ControlModule {}
