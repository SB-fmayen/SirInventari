import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PedidosService } from '../pedidos/pedidos.service.js';

function fecha(valor: unknown): Date {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor))
    throw new BadRequestException(
      'Escribe las fechas con el formato año-mes-día.',
    );
  const dia = new Date(`${valor}T00:00:00Z`);
  if (
    !Number.isFinite(dia.getTime()) ||
    dia.toISOString().slice(0, 10) !== valor
  )
    throw new BadRequestException('Una de las fechas no existe.');
  return dia;
}
type Fila = { nombre: string; cantidad: Prisma.Decimal; total: Prisma.Decimal };
function sumar(
  mapa: Map<string, Fila>,
  clave: string,
  nombre: string,
  cantidad: Prisma.Decimal | string | number,
  total: Prisma.Decimal | string | number,
) {
  const actual = mapa.get(clave) ?? {
    nombre,
    cantidad: new Prisma.Decimal(0),
    total: new Prisma.Decimal(0),
  };
  actual.cantidad = actual.cantidad.plus(cantidad);
  actual.total = actual.total.plus(total);
  mapa.set(clave, actual);
}
const serializar = (mapa: Map<string, Fila>) =>
  [...mapa.values()].map((f) => ({
    nombre: f.nombre,
    cantidad: f.cantidad.toString(),
    total: f.total.toFixed(2),
  }));

@Injectable()
export class ReportesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pedidos: PedidosService,
  ) {}

  async ventas(centroId: number, desde?: unknown, hasta?: unknown) {
    const [hoy] = await this.prisma.$queryRaw<
      { fecha: string }[]
    >`SELECT ventas.fecha_guatemala()::text AS fecha`;
    const inicio = fecha(desde ?? hoy.fecha);
    const fin = fecha(hasta ?? hoy.fecha);
    if (inicio > fin || fin.getTime() - inicio.getTime() > 365 * 86400000)
      throw new BadRequestException('Elige un rango válido de hasta 366 días.');
    const filas = await this.prisma.$transaction(
      (tx) =>
        tx.pedido.findMany({
          where: {
            centro_venta_id: centroId,
            estado: 'PAGADO',
            fecha_operacion: { gte: inicio, lte: fin },
          },
          include: {
            tipo_venta: true,
            pedido_detalle: {
              where: { estado: 'ACTIVA' },
              include: { producto: true },
              orderBy: { id: 'asc' },
            },
            pago: {
              where: { estado: 'APLICADO' },
              include: { metodo_pago: true },
            },
          },
          orderBy: [{ fecha_operacion: 'asc' }, { folio: 'asc' }],
        }),
      { isolationLevel: 'RepeatableRead', timeout: 15000 },
    );
    const tipos = new Map<string, Fila>();
    const horas = new Map<string, Fila>();
    const productos = new Map<string, Fila>();
    const metodos = new Map<string, Fila>();
    let total = new Prisma.Decimal(0);
    let descuentos = new Prisma.Decimal(0);
    for (const p of filas) {
      total = total.plus(p.total);
      descuentos = descuentos.plus(p.descuento);
      sumar(tipos, String(p.tipo_venta_id), p.tipo_venta.nombre, 1, p.total);
      const hora = new Intl.DateTimeFormat('es-GT', {
        timeZone: 'America/Guatemala',
        hour: '2-digit',
        hourCycle: 'h23',
      }).format(p.creado_en);
      sumar(horas, hora, `${hora}:00`, 1, p.total);
      // Reparte el descuento por importe, sin perder centavos ni generar líneas negativas.
      const reparto = p.pedido_detalle.map((l) => {
        const exacto = p.subtotal.isZero()
          ? new Prisma.Decimal(0)
          : (l.importe ?? l.cantidad.times(l.precio_unitario))
              .times(p.total)
              .div(p.subtotal)
              .times(100);
        return {
          linea: l,
          centavos: exacto.floor(),
          resto: exacto.minus(exacto.floor()),
        };
      });
      const sobrantes = p.total
        .times(100)
        .minus(
          reparto.reduce(
            (suma, l) => suma.plus(l.centavos),
            new Prisma.Decimal(0),
          ),
        )
        .toNumber();
      reparto.sort(
        (a, b) =>
          b.resto.comparedTo(a.resto) || a.linea.id.localeCompare(b.linea.id),
      );
      reparto.forEach((r, indice) => {
        const l = r.linea;
        const vendido = r.centavos.plus(indice < sobrantes ? 1 : 0).div(100);
        sumar(
          productos,
          String(l.producto_id),
          `${l.producto.sku} · ${l.producto.nombre}`,
          l.cantidad,
          vendido,
        );
      });
      for (const pago of p.pago)
        sumar(
          metodos,
          String(pago.metodo_pago_id),
          pago.metodo_pago.nombre,
          1,
          pago.monto,
        );
    }
    return {
      desde: inicio.toISOString().slice(0, 10),
      hasta: fin.toISOString().slice(0, 10),
      resumen: {
        total_pedidos: filas.length,
        total_vendido: total.toFixed(2),
        ticket_promedio: filas.length
          ? total.div(filas.length).toFixed(2)
          : '0.00',
        descuentos: descuentos.toFixed(2),
      },
      por_tipo: serializar(tipos),
      por_hora: serializar(horas).sort((a, b) =>
        a.nombre.localeCompare(b.nombre),
      ),
      por_producto: serializar(productos),
      por_pago: serializar(metodos),
      pedidos: filas.map((p) => ({
        id: p.id,
        folio: p.folio,
        fecha_operacion: p.fecha_operacion.toISOString().slice(0, 10),
        total: p.total.toFixed(2),
        tipo: p.tipo_venta.nombre,
        en_papelera: p.eliminado_en !== null,
      })),
    };
  }

  async historial(centroId: number, id: string) {
    const pedido = await this.pedidos.detalle(centroId, id);
    const eventos = [
      {
        fecha: pedido.creado_en.toISOString(),
        usuario: pedido.usuario.nombre,
        descripcion: `Creó el pedido ${pedido.folio}.`,
      },
    ];
    for (const l of pedido.pedido_detalle) {
      eventos.push({
        fecha: l.agregado_en.toISOString(),
        usuario: l.usuario_pedido_detalle_agregado_porTousuario.nombre,
        descripcion: `Agregó ${l.cantidad.toString()} de ${l.producto.nombre}${l.notas ? ` (${l.notas})` : ''}.`,
      });
      if (l.anulado_en)
        eventos.push({
          fecha: l.anulado_en.toISOString(),
          usuario:
            l.usuario_pedido_detalle_anulado_porTousuario?.nombre ?? 'Sistema',
          descripcion: `Anuló ${l.producto.nombre}: ${l.motivo_anulacion ?? ''}.`,
        });
    }
    const pagos = await this.prisma.pago.findMany({
      where: { pedido_id: id },
      include: {
        metodo_pago: true,
        usuario_pago_registrado_porTousuario: { select: { nombre: true } },
        usuario_pago_anulado_porTousuario: { select: { nombre: true } },
      },
    });
    for (const pago of pagos) {
      eventos.push({
        fecha: pago.registrado_en.toISOString(),
        usuario: pago.usuario_pago_registrado_porTousuario.nombre,
        descripcion: `Registró Q ${pago.monto.toFixed(2)} en ${pago.metodo_pago.nombre}${pago.referencia_pos ? `, autorización ${pago.referencia_pos}` : ''}.`,
      });
      if (pago.anulado_en)
        eventos.push({
          fecha: pago.anulado_en.toISOString(),
          usuario: pago.usuario_pago_anulado_porTousuario?.nombre ?? 'Sistema',
          descripcion: `Anuló el pago de Q ${pago.monto.toFixed(2)}: ${pago.motivo_anulacion ?? ''}.`,
        });
    }
    return {
      folio: pedido.folio,
      estado: pedido.estado,
      eventos: eventos.sort((a, b) => a.fecha.localeCompare(b.fecha)),
    };
  }

  async control(centros: number[], desde?: unknown, hasta?: unknown) {
    const [hoy] = await this.prisma.$queryRaw<
      { fecha: string }[]
    >`SELECT ventas.fecha_guatemala()::text AS fecha`;
    const inicio = fecha(desde ?? hoy.fecha),
      fin = fecha(hasta ?? hoy.fecha);
    if (inicio > fin || fin.getTime() - inicio.getTime() > 365 * 86400000)
      throw new BadRequestException('Elige un rango válido de hasta 366 días.');
    const anteriorFin = new Date(inicio.getTime() - 86400000),
      anteriorInicio = new Date(
        inicio.getTime() - (fin.getTime() - inicio.getTime() + 86400000),
      );
    return this.prisma.$transaction(
      async (tx) => {
        const pedidos = await tx.pedido.findMany({
          where: {
            centro_venta_id: { in: centros },
            fecha_operacion: { gte: anteriorInicio, lte: fin },
          },
          include: {
            centro_venta: { select: { nombre: true } },
            usuario: { select: { nombre: true } },
            usuario_pedido_cortesia_porTousuario: { select: { nombre: true } },
            pedido_detalle: {
              where: { estado: 'ANULADA' },
              include: {
                producto: { select: { nombre: true } },
                usuario_pedido_detalle_anulado_porTousuario: {
                  select: { nombre: true },
                },
              },
            },
            pago: { where: { estado: 'APLICADO' }, select: { monto: true } },
          },
        });
        const pagos = await tx.pago.findMany({
          where: {
            pedido: { centro_venta_id: { in: centros } },
            fecha_operacion: { gte: inicio, lte: fin },
          },
          include: {
            pedido: { select: { folio: true, centro_venta_id: true } },
            usuario_pago_anulado_porTousuario: { select: { nombre: true } },
            metodo_pago: { select: { nombre: true } },
          },
        });
        const actuales = pedidos.filter((p) => p.fecha_operacion >= inicio);
        const vendidos = actuales.filter((p) => p.estado === 'PAGADO');
        const previos = pedidos.filter(
          (p) => p.fecha_operacion < inicio && p.estado === 'PAGADO',
        );
        const sumar = (ps: typeof pedidos) =>
          ps.reduce((s, p) => s.plus(p.total), new Prisma.Decimal(0));
        const total = sumar(vendidos),
          anterior = sumar(previos);
        const recibidos = pagos
          .filter((p) => p.estado === 'APLICADO')
          .reduce((s, p) => s.plus(p.monto), new Prisma.Decimal(0));
        const saldo = (ps: typeof pedidos) =>
          ps
            .filter((p) => !['PAGADO', 'ANULADO'].includes(p.estado))
            .reduce(
              (s, p) =>
                s
                  .plus(p.total)
                  .minus(
                    p.pago.reduce(
                      (s, a) => s.plus(a.monto),
                      new Prisma.Decimal(0),
                    ),
                  ),
              new Prisma.Decimal(0),
            );
        const excepciones: {
          pedido_id: string;
          folio: number;
          centro: number;
          tipo: string;
          usuario: string;
          motivo: string;
          fecha: string;
          monto: string;
        }[] = [];
        for (const p of actuales) {
          if (p.motivo_cortesia)
            excepciones.push({
              pedido_id: p.id,
              folio: p.folio,
              centro: p.centro_venta_id,
              tipo: 'Cortesía',
              usuario:
                p.usuario_pedido_cortesia_porTousuario?.nombre ?? 'Sistema',
              motivo: p.motivo_cortesia,
              fecha: (p.cortesia_en ?? p.creado_en).toISOString(),
              monto: p.descuento.toFixed(2),
            });
          else if (p.descuento.gt(0))
            excepciones.push({
              pedido_id: p.id,
              folio: p.folio,
              centro: p.centro_venta_id,
              tipo: 'Descuento',
              usuario: p.usuario.nombre,
              motivo: 'Descuento registrado en el pedido; consultar historial.',
              fecha: p.actualizado_en.toISOString(),
              monto: p.descuento.toFixed(2),
            });
          for (const l of p.pedido_detalle)
            excepciones.push({
              pedido_id: p.id,
              folio: p.folio,
              centro: p.centro_venta_id,
              tipo: 'Producto anulado',
              usuario:
                l.usuario_pedido_detalle_anulado_porTousuario?.nombre ??
                'Sistema',
              motivo: `${l.producto.nombre}: ${l.motivo_anulacion ?? ''}`,
              fecha: (l.anulado_en ?? l.agregado_en).toISOString(),
              monto: (l.importe ?? l.cantidad.times(l.precio_unitario)).toFixed(
                2,
              ),
            });
        }
        for (const p of pagos.filter((p) => p.estado === 'ANULADO'))
          excepciones.push({
            pedido_id: p.pedido_id,
            folio: p.pedido.folio,
            centro: p.pedido.centro_venta_id,
            tipo: 'Pago anulado',
            usuario: p.usuario_pago_anulado_porTousuario?.nombre ?? 'Sistema',
            motivo: p.motivo_anulacion ?? '',
            fecha: (p.anulado_en ?? p.registrado_en).toISOString(),
            monto: p.monto.toFixed(2),
          });
        const nombres = await tx.centro_venta.findMany({
          where: { id: { in: centros }, activo: true },
          select: { id: true, nombre: true },
        });
        return {
          desde: inicio.toISOString().slice(0, 10),
          hasta: fin.toISOString().slice(0, 10),
          comparacion: {
            desde: anteriorInicio.toISOString().slice(0, 10),
            hasta: anteriorFin.toISOString().slice(0, 10),
            ventas: anterior.toFixed(2),
            pedidos: previos.length,
            diferencia: total.minus(anterior).toFixed(2),
            variacion_porcentaje: anterior.isZero()
              ? null
              : total.minus(anterior).div(anterior).times(100).toFixed(2),
          },
          resumen: {
            ventas_pagadas: total.toFixed(2),
            pagos_recibidos: recibidos.toFixed(2),
            saldo_pendiente: saldo(actuales).toFixed(2),
            pedidos_pagados: vendidos.length,
          },
          por_centro: nombres.map((c) => ({
            id: c.id,
            nombre: c.nombre,
            ventas: sumar(
              vendidos.filter((p) => p.centro_venta_id === c.id),
            ).toFixed(2),
            pedidos: vendidos.filter((p) => p.centro_venta_id === c.id).length,
            pagos_recibidos: pagos
              .filter(
                (p) =>
                  p.estado === 'APLICADO' && p.pedido.centro_venta_id === c.id,
              )
              .reduce((s, p) => s.plus(p.monto), new Prisma.Decimal(0))
              .toFixed(2),
            saldo_pendiente: saldo(
              actuales.filter((p) => p.centro_venta_id === c.id),
            ).toFixed(2),
          })),
          excepciones,
        };
      },
      { isolationLevel: 'RepeatableRead', timeout: 15000 },
    );
  }
}
