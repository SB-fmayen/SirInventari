import { ClientesService } from '../clientes/clientes.service.js';
import type { UsuarioSesion } from '../autenticacion/usuario-sesion.js';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { lineas, nuevoPedido } from './validacion-pedido.js';
import { TiempoRealGateway } from '../tiempo-real/tiempo-real.gateway.js';

const incluir = {
  tipo_venta: { select: { codigo: true, nombre: true } },
  usuario: { select: { nombre: true } },
  pedido_detalle: { include: {
    producto: { select: { sku: true, nombre: true } },
    usuario_pedido_detalle_agregado_porTousuario: { select: { nombre: true } },
    usuario_pedido_detalle_anulado_porTousuario: { select: { nombre: true } },
  }, orderBy: [{ agregado_en: 'asc' as const }, { id: 'asc' as const }] },
  pago: { where: { estado: 'APLICADO' as const }, select: { monto: true } },
} satisfies Prisma.pedidoInclude;
type Conexion = Prisma.TransactionClient;
type DatosLineas = ReturnType<typeof lineas>;
const incluirCocina = {
  tipo_venta: { select: { nombre: true } },
  pedido_detalle: { where: { estado: 'ACTIVA' as const }, select: {
    id: true, cantidad: true, notas: true, agregado_en: true, producto: { select: { nombre: true } },
  }, orderBy: [{ agregado_en: 'asc' as const }, { id: 'asc' as const }] },
} satisfies Prisma.pedidoInclude;
const seleccionarCocina = {
  id: true, folio: true, fecha_operacion: true, creado_en: true, estado_cocina: true, version: true,
  mesa_referencia: true, cliente_nombre: true, ...incluirCocina,
} satisfies Prisma.pedidoSelect;

@Injectable()
export class PedidosService {
  constructor(private readonly prisma: PrismaService, private readonly tiempoReal: TiempoRealGateway, private readonly clientes: ClientesService) {}

  private async avisar<T extends { id: string }>(centroId: number, operacion: Promise<T>): Promise<T> {
    const resultado = await operacion;
    await this.tiempoReal.publicar(centroId, resultado.id);
    return resultado;
  }

  tipos() { return this.prisma.tipo_venta.findMany({ orderBy: { id: 'asc' } }); }

  private respuesta(p: Prisma.pedidoGetPayload<{ include: typeof incluir }>) {
    const { pago, ...pedido } = p;
    const pagado = pago.reduce((suma, actual) => suma.plus(actual.monto), new Prisma.Decimal(0));
    return { ...pedido, fecha_operacion: p.fecha_operacion.toISOString().slice(0, 10), pagado: pagado.toFixed(2), saldo: p.total.minus(pagado).toFixed(2) };
  }

  private async detalleEn(tx: Conexion, centroId: number, id: string) {
    const p = await tx.pedido.findFirst({ where: { id, centro_venta_id: centroId }, include: incluir });
    if (!p) throw new NotFoundException('No se encontró el pedido en este centro de venta.');
    return this.respuesta(p);
  }

  detalle(centroId: number, id: string) { return this.detalleEn(this.prisma, centroId, id); }

  private respuestaCocina(p: Prisma.pedidoGetPayload<{ select: typeof seleccionarCocina }>) {
    return { ...p, fecha_operacion: p.fecha_operacion.toISOString().slice(0, 10),
      pedido_detalle: p.pedido_detalle.map(l => ({ ...l, nuevo: l.agregado_en.getTime() > p.creado_en.getTime() })) };
  }

  async cocina(centroId: number) {
    const [hoy] = await this.prisma.$queryRaw<{ fecha: Date }[]>`SELECT ventas.fecha_guatemala() AS fecha`;
    const filas = await this.prisma.pedido.findMany({ where: {
      centro_venta_id: centroId, eliminado_en: null, estado: { not: 'ANULADO' }, pedido_detalle: { some: { estado: 'ACTIVA' } },
      OR: [{ estado_cocina: { not: 'ENTREGADO' } }, { fecha_operacion: hoy.fecha }],
    }, select: seleccionarCocina, orderBy: [{ creado_en: 'asc' }, { folio: 'asc' }] });
    return filas.map(p => this.respuestaCocina(p));
  }

  cambiarCocina(centroId: number, usuarioId: number, id: string, actual: string, destino: string, version: number) {
    return this.avisar(centroId, this.prisma.$transaction(async tx => {
      const estado = await this.bloquear(tx, centroId, id);
      if (estado === 'ANULADO') throw new ConflictException('Un pedido anulado no se puede preparar.');
      const p = await tx.pedido.findUniqueOrThrow({ where: { id }, select: seleccionarCocina });
      if (!p.pedido_detalle.length) throw new ConflictException('El pedido no tiene productos activos para preparar.');
      const siguiente: Record<string, string> = { PENDIENTE: 'EN_PREPARACION', EN_PREPARACION: 'LISTO', LISTO: 'ENTREGADO' };
      if (siguiente[actual] !== destino) throw new BadRequestException('Sigue el orden: En preparación, Listo y Entregado.');
      if (p.estado_cocina === destino) return this.respuestaCocina(p); // Reintento, sin avanzar dos veces.
      if (p.version !== version) throw new ConflictException('El pedido tiene cambios nuevos. Revísalos antes de continuar.');
      if (p.estado_cocina !== actual) throw new ConflictException('El estado de cocina cambió. Actualiza el pedido antes de continuar.');
      await tx.$queryRaw`SELECT set_config('app.usuario_id', ${String(usuarioId)}, true)`;
      const actualizado = await tx.pedido.update({ where: { id }, data: {
        estado_cocina: destino, actualizado_en: new Date(), version: { increment: 1 },
      }, select: seleccionarCocina });
      return this.respuestaCocina(actualizado);
    }));
  }

  async pendientes(centroId: number) {
    const filas = await this.prisma.pedido.findMany({ where: { centro_venta_id: centroId, eliminado_en: null, estado: { notIn: ['PAGADO', 'ANULADO'] } }, include: incluir, orderBy: [{ creado_en: 'asc' }, { folio: 'asc' }] });
    return filas.map((p) => this.respuesta(p)).filter((p) => Number(p.saldo) >= 0);
  }

  async listar(centroId: number, buscar: string, anteriores = false, fecha?: string) {
    if (fecha && (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !Number.isFinite(new Date(`${fecha}T00:00:00Z`).getTime()) || new Date(`${fecha}T00:00:00Z`).toISOString().slice(0,10) !== fecha)) throw new BadRequestException('La fecha no es válida.');
    const [dia] = await this.prisma.$queryRaw<{ fecha: Date }[]>`SELECT ventas.fecha_guatemala() AS fecha`;
    const filas = await this.prisma.pedido.findMany({
      where: { centro_venta_id: centroId, eliminado_en: null,
        AND: [anteriores ? { OR: [{fecha_operacion:dia.fecha},{estado:{notIn:['PAGADO','ANULADO']}}] } : {fecha_operacion:fecha ? new Date(`${fecha}T00:00:00Z`) : dia.fecha}],
        ...(buscar ? { OR: [
          { mesa_referencia: { contains: buscar, mode: 'insensitive' as const } },
          { cliente_nombre: { contains: buscar, mode: 'insensitive' as const } },
          { cliente_telefono: { contains: buscar } },
          ...(/^\d{1,9}$/.test(buscar) ? [{ folio: Number(buscar) }] : []),
        ] } : {}),
      }, include: incluir, orderBy: [{ creado_en: 'desc' }, { folio: 'desc' }],
    });
    return filas.map((p) => this.respuesta(p));
  }

  private async bloquear(tx: Conexion, centroId: number, id: string) {
    const filas = await tx.$queryRaw<{ estado: string; eliminado_en: Date | null }[]>`SELECT estado, eliminado_en FROM ventas.pedido WHERE id = ${id}::uuid AND centro_venta_id = ${centroId} FOR UPDATE`;
    if (!filas.length) throw new NotFoundException('No se encontró el pedido en este centro de venta.');
    if (filas[0].eliminado_en) throw new ConflictException('El pedido está en la papelera. Restaura su visibilidad antes de realizar otras acciones.');
    return filas[0].estado;
  }

  private async agregarEn(tx: Conexion, centroId: number, usuarioId: number, pedidoId: string, nuevas: DatosLineas, estado: string, inicialEn?: Date) {
    let agregadas = false;
    for (const l of nuevas) {
      const existente = await tx.pedido_detalle.findUnique({ where: { id: l.id } });
      if (existente) {
        if (existente.pedido_id !== pedidoId || existente.producto_id !== l.producto_id || !existente.cantidad.equals(l.cantidad) || existente.notas !== l.notas || existente.agregado_por !== usuarioId) {
          throw new ConflictException('Ese identificador de producto ya se usó con otros datos.');
        }
        continue; // Reenvío de la misma línea: no cambia ni duplica lo guardado.
      }
      if (estado === 'PAGADO' || estado === 'ANULADO') throw new ConflictException('Un pedido pagado o anulado no admite más productos.');
      const producto = await tx.producto.findUnique({ where: { id: l.producto_id }, include: { categoria: true, producto_centro: { where: { centro_venta_id: centroId } } } });
      if (!producto || !producto.activo || !producto.categoria.activo || producto.producto_centro[0]?.disponible === false) {
        throw new BadRequestException('Uno de los productos ya no está disponible en este centro. Actualiza el catálogo.');
      }
      await tx.pedido_detalle.create({ data: { ...l, ...(inicialEn ? { agregado_en: inicialEn } : {}), pedido_id: pedidoId, agregado_por: usuarioId, precio_unitario: producto.producto_centro[0]?.precio ?? producto.precio_base } });
      agregadas = true;
    }
    // Si llegan productos después de estar listo/entregado, la comanda vuelve a pendientes.
    // Un reenvío idéntico no reinicia el estado; un pedido pagado sigue bloqueado arriba.
    if (agregadas) await tx.pedido.updateMany({ where: { id: pedidoId, estado_cocina: { in: ['LISTO', 'ENTREGADO'] } },
      data: { estado_cocina: 'PENDIENTE', actualizado_en: new Date(), version: { increment: 1 } } });
  }

  async crear(centroId: number, usuario: UsuarioSesion, datos: ReturnType<typeof nuevoPedido>) {
    const usuarioId = usuario.id;
    return this.avisar(centroId, this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.usuario_id',${String(usuarioId)},true)`;
      // Coordina reenvíos simultáneos del mismo UUID incluso antes de que exista la fila.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${datos.id}))::text`;
      const existente = await tx.pedido.findUnique({ where: { id: datos.id } });
      if (existente) {
        if (existente.centro_venta_id !== centroId || existente.creado_por !== usuarioId || existente.tipo_venta_id !== datos.tipo_venta_id || existente.mesa_referencia !== datos.mesa_referencia || existente.cliente_nombre !== datos.cliente_nombre || existente.cliente_telefono !== datos.cliente_telefono || existente.cliente_direccion !== datos.cliente_direccion || (datos.cliente_id !== null && existente.cliente_id !== datos.cliente_id)) {
          throw new ConflictException('Ese identificador de pedido ya se usó con otros datos.');
        }
        const estado = await this.bloquear(tx, centroId, datos.id);
        await this.agregarEn(tx, centroId, usuarioId, datos.id, datos.lineas, estado);
      } else {
        const tipo = await tx.tipo_venta.findUnique({ where: { id: datos.tipo_venta_id } });
        if (!tipo) throw new BadRequestException('El tipo de venta no existe.');
        if (tipo.codigo !== 'MESA' && !datos.cliente_nombre) throw new BadRequestException('Indica el nombre del cliente.');
        if (tipo.codigo === 'DOMICILIO' && (!datos.cliente_telefono || !datos.cliente_direccion)) throw new BadRequestException('Para domicilio escribe el teléfono y la dirección del cliente.');
        const clienteId = await this.clientes.vincular(tx, centroId, usuario, datos);
        const [folio] = await tx.$queryRaw<{ numero: number }[]>`SELECT ventas.siguiente_folio(${centroId}::smallint, ventas.fecha_guatemala()) AS numero`;
        const creado = await tx.pedido.create({ data: { id: datos.id, centro_venta_id: centroId, creado_por: usuarioId, tipo_venta_id: datos.tipo_venta_id,
          mesa_referencia: datos.mesa_referencia, cliente_nombre: datos.cliente_nombre, cliente_id: clienteId, cliente_telefono: datos.cliente_telefono, cliente_direccion: datos.cliente_direccion, folio: folio.numero } });
        await this.agregarEn(tx, centroId, usuarioId, datos.id, datos.lineas, 'ABIERTO', creado.creado_en);
      }
      return this.detalleEn(tx, centroId, datos.id);
    }, { timeout: 15000 }));
  }

  agregar(centroId: number, usuarioId: number, id: string, nuevas: DatosLineas) {
    return this.avisar(centroId, this.prisma.$transaction(async (tx) => {
      const estado = await this.bloquear(tx, centroId, id);
      await this.agregarEn(tx, centroId, usuarioId, id, nuevas, estado);
      return this.detalleEn(tx, centroId, id);
    }, { timeout: 15000 }));
  }

  anularLinea(centroId: number, usuarioId: number, id: string, lineaId: string, motivo: string) {
    return this.avisar(centroId, this.prisma.$transaction(async (tx) => {
      const estado = await this.bloquear(tx, centroId, id);
      if (estado === 'PAGADO' || estado === 'ANULADO') throw new ConflictException('No puedes cambiar un pedido pagado o anulado.');
      const linea = await tx.pedido_detalle.findFirst({ where: { id: lineaId, pedido_id: id } });
      if (!linea) throw new NotFoundException('No se encontró ese producto en el pedido.');
      if (linea.estado === 'ACTIVA') await tx.pedido_detalle.update({ where: { id: lineaId }, data: { estado: 'ANULADA', anulado_por: usuarioId, anulado_en: new Date(), motivo_anulacion: motivo } });
      return this.detalleEn(tx, centroId, id);
    }));
  }

  anularPedido(centroId: number, usuarioId: number, id: string, motivo: string) {
    return this.avisar(centroId, this.prisma.$transaction(async tx => {
      const estado = await this.bloquear(tx, centroId, id);
      if (estado === 'ANULADO') return this.detalleEn(tx, centroId, id);
      if (estado === 'PAGADO' || await tx.pago.count({ where: { pedido_id: id, estado: 'APLICADO' } })) {
        throw new ConflictException('El pedido tiene pagos. Primero solicita su anulación y realiza la devolución correspondiente antes de anular el pedido.');
      }
      await tx.$queryRaw`SELECT set_config('app.usuario_id', ${String(usuarioId)}, true)`;
      await tx.pedido.update({ where: { id }, data: { estado: 'ANULADO', actualizado_en: new Date(), version: { increment: 1 } } });
      // Conserva productos e importes originales. El motivo completo queda en la auditoría existente.
      await tx.auditoria.create({ data: { tabla: 'pedido', registro_id: id, accion: 'UPDATE', usuario_id: usuarioId,
        antes: { estado }, despues: { estado: 'ANULADO', motivo_anulacion: motivo } } });
      return this.detalleEn(tx, centroId, id);
    }));
  }

}
