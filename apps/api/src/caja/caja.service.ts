import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PedidosService } from '../pedidos/pedidos.service.js';
import { TiempoRealGateway } from '../tiempo-real/tiempo-real.gateway.js';
import type { nuevoPago } from './validacion-pago.js';

@Injectable()
export class CajaService {
  constructor(private readonly prisma: PrismaService, private readonly pedidos: PedidosService, private readonly tiempoReal: TiempoRealGateway) {}
  metodos() { return this.prisma.metodo_pago.findMany({ orderBy: { id: 'asc' } }); }
  pendientes(centroId: number) { return this.pedidos.pendientes(centroId); }

  async comprobante(centroId: number, id: string) {
    const pedido = await this.pedidos.detalle(centroId, id);
    const [centro, pagos] = await Promise.all([
      this.prisma.centro_venta.findUniqueOrThrow({ where: { id: centroId }, select: { nombre: true } }),
      this.prisma.pago.findMany({ where: { pedido_id: id }, include: { metodo_pago: { select: { nombre: true, codigo: true } } }, orderBy: [{ registrado_en: 'asc' }, { id: 'asc' }] }),
    ]);
    return { centro, pedido, pagos };
  }

  async cobrar(centroId: number, usuarioId: number, datos: ReturnType<typeof nuevoPago>) {
    const resultado = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${datos.id}))::text`;
      const existente = await tx.pago.findUnique({ where: { id: datos.id }, include: { pedido: { select: { centro_venta_id: true } }, metodo_pago: true } });
      if (existente) {
        if (existente.pedido.centro_venta_id !== centroId || existente.pedido_id !== datos.pedido_id || existente.registrado_por !== usuarioId || existente.metodo_pago_id !== datos.metodo_pago_id || !existente.monto.equals(datos.monto) || existente.terminal_pos !== datos.terminal_pos || existente.referencia_pos !== datos.referencia_pos) {
          throw new ConflictException('Ese identificador de pago ya se usó con otros datos.');
        }
        if (existente.estado !== 'APLICADO') throw new ConflictException('Ese pago ya fue anulado. Revisa el comprobante antes de cobrar de nuevo.');
        if (existente.metodo_pago.codigo === 'EFECTIVO' && new Prisma.Decimal(datos.recibido).lessThan(datos.monto)) throw new BadRequestException('El efectivo recibido no alcanza para este pago.');
        return { pago: existente, efectivo: existente.metodo_pago.codigo === 'EFECTIVO' };
      }

      // Mismo bloqueo que el cierre de turno: no se cobra mientras se está cerrando.
      const turnos = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM ventas.turno_caja WHERE centro_venta_id = ${centroId} AND estado = 'ABIERTO' FOR UPDATE`;
      if (!turnos.length) throw new ConflictException('Abre un turno de caja en este centro antes de cobrar.');
      const filas = await tx.$queryRaw<{ total: Prisma.Decimal; estado: string }[]>`SELECT total, estado FROM ventas.pedido WHERE id = ${datos.pedido_id}::uuid AND centro_venta_id = ${centroId} FOR UPDATE`;
      if (!filas.length) throw new NotFoundException('No se encontró el pedido en este centro de venta.');
      if (['PAGADO', 'ANULADO'].includes(filas[0].estado)) throw new ConflictException('El pedido ya está pagado o anulado y no admite más cobros.');
      const metodo = await tx.metodo_pago.findUnique({ where: { id: datos.metodo_pago_id } });
      if (!metodo) throw new BadRequestException('Elige una forma de pago válida.');
      if (metodo.requiere_terminal && !datos.terminal_pos) throw new BadRequestException('Indica la terminal del POS para este pago con tarjeta.');
      if (metodo.requiere_referencia && !datos.referencia_pos) throw new BadRequestException('Escribe el número de autorización o referencia del pago.');
      if (metodo.codigo === 'EFECTIVO' && (datos.referencia_pos || datos.terminal_pos)) throw new BadRequestException('El pago en efectivo no lleva terminal ni autorización del POS.');
      if (metodo.codigo === 'EFECTIVO' && new Prisma.Decimal(datos.recibido).lessThan(datos.monto)) throw new BadRequestException('El efectivo recibido no alcanza para este pago.');
      const suma = await tx.pago.aggregate({ where: { pedido_id: datos.pedido_id, estado: 'APLICADO' }, _sum: { monto: true } });
      const saldo = new Prisma.Decimal(filas[0].total).minus(suma._sum.monto ?? 0);
      if (new Prisma.Decimal(datos.monto).greaterThan(saldo)) throw new ConflictException('El monto del pago es mayor que el saldo del pedido.');
      if (datos.referencia_pos) {
        const [hoy] = await tx.$queryRaw<{ fecha: Date }[]>`SELECT ventas.fecha_guatemala() AS fecha`;
        if (await tx.pago.findFirst({ where: { fecha_operacion: hoy.fecha, terminal_pos: datos.terminal_pos, referencia_pos: datos.referencia_pos, estado: 'APLICADO' } })) {
          throw new ConflictException('El número de autorización del voucher ya se usó en otro pago.');
        }
      }
      const { recibido: _recibido, ...pago } = datos;
      const creado = await tx.pago.create({ data: { ...pago, turno_id: turnos[0].id, registrado_por: usuarioId } });
      return { pago: creado, efectivo: metodo.codigo === 'EFECTIVO' };
    }, { timeout: 15000 });
    await this.tiempoReal.publicar(centroId, datos.pedido_id);
    return { pago: resultado.pago, vuelto: resultado.efectivo ? new Prisma.Decimal(datos.recibido).minus(datos.monto).toFixed(2) : '0.00', comprobante: await this.comprobante(centroId, datos.pedido_id) };
  }
}
