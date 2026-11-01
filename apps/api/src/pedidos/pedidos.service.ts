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

@Injectable()
export class PedidosService {
  constructor(private readonly prisma: PrismaService, private readonly tiempoReal: TiempoRealGateway) {}

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

  async listar(centroId: number, buscar: string) {
    const [dia] = await this.prisma.$queryRaw<{ fecha: Date }[]>`SELECT ventas.fecha_guatemala() AS fecha`;
    const filas = await this.prisma.pedido.findMany({
      where: { centro_venta_id: centroId, fecha_operacion: dia.fecha,
        ...(buscar ? { OR: [
          { mesa_referencia: { contains: buscar, mode: 'insensitive' as const } },
          { cliente_nombre: { contains: buscar, mode: 'insensitive' as const } },
          ...(/^\d{1,9}$/.test(buscar) ? [{ folio: Number(buscar) }] : []),
        ] } : {}),
      }, include: incluir, orderBy: [{ creado_en: 'desc' }, { folio: 'desc' }],
    });
    return filas.map((p) => this.respuesta(p));
  }

  private async bloquear(tx: Conexion, centroId: number, id: string) {
    const filas = await tx.$queryRaw<{ estado: string }[]>`SELECT estado FROM ventas.pedido WHERE id = ${id}::uuid AND centro_venta_id = ${centroId} FOR UPDATE`;
    if (!filas.length) throw new NotFoundException('No se encontró el pedido en este centro de venta.');
    return filas[0].estado;
  }

  private async agregarEn(tx: Conexion, centroId: number, usuarioId: number, pedidoId: string, nuevas: DatosLineas, estado: string) {
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
      await tx.pedido_detalle.create({ data: { ...l, pedido_id: pedidoId, agregado_por: usuarioId, precio_unitario: producto.producto_centro[0]?.precio ?? producto.precio_base } });
    }
  }

  async crear(centroId: number, usuarioId: number, datos: ReturnType<typeof nuevoPedido>) {
    return this.avisar(centroId, this.prisma.$transaction(async (tx) => {
      // Coordina reenvíos simultáneos del mismo UUID incluso antes de que exista la fila.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${datos.id}))::text`;
      const existente = await tx.pedido.findUnique({ where: { id: datos.id } });
      if (existente) {
        if (existente.centro_venta_id !== centroId || existente.creado_por !== usuarioId || existente.tipo_venta_id !== datos.tipo_venta_id || existente.mesa_referencia !== datos.mesa_referencia || existente.cliente_nombre !== datos.cliente_nombre) {
          throw new ConflictException('Ese identificador de pedido ya se usó con otros datos.');
        }
        const estado = await this.bloquear(tx, centroId, datos.id);
        await this.agregarEn(tx, centroId, usuarioId, datos.id, datos.lineas, estado);
      } else {
        const tipo = await tx.tipo_venta.findUnique({ where: { id: datos.tipo_venta_id } });
        if (!tipo) throw new BadRequestException('El tipo de venta no existe.');
        if (tipo.codigo === 'MESA' && !datos.mesa_referencia) throw new BadRequestException('Indica la mesa del pedido.');
        if (tipo.codigo !== 'MESA' && !datos.cliente_nombre) throw new BadRequestException('Indica el nombre del cliente.');
        const [folio] = await tx.$queryRaw<{ numero: number }[]>`SELECT ventas.siguiente_folio(${centroId}::smallint, ventas.fecha_guatemala()) AS numero`;
        await tx.pedido.create({ data: { id: datos.id, centro_venta_id: centroId, creado_por: usuarioId, tipo_venta_id: datos.tipo_venta_id,
          mesa_referencia: datos.mesa_referencia, cliente_nombre: datos.cliente_nombre, folio: folio.numero } });
        await this.agregarEn(tx, centroId, usuarioId, datos.id, datos.lineas, 'ABIERTO');
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

}
