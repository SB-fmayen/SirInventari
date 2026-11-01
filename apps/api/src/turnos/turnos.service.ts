import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export function montoCaja(cuerpo: unknown, campo: 'fondo_inicial' | 'efectivo_contado'): string {
  const valor = cuerpo && typeof cuerpo === 'object' && !Array.isArray(cuerpo) ? (cuerpo as Record<string, unknown>)[campo] : undefined;
  if ((typeof valor !== 'number' && typeof valor !== 'string') || !/^\d{1,8}(\.\d{1,2})?$/.test(String(valor))) {
    throw new BadRequestException('El efectivo debe ser de 0 a 99999999.99, con hasta dos decimales.');
  }
  return String(valor);
}

const incluir = {
  usuario_turno_caja_abierto_porTousuario: { select: { nombre: true } },
  usuario_turno_caja_cerrado_porTousuario: { select: { nombre: true } },
} as const;

@Injectable()
export class TurnosService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(centroId: number) {
    // No usar la relación uno-a-uno desde centro_venta: el índice es parcial.
    const filas = await this.prisma.turno_caja.findMany({ where: { centro_venta_id: centroId }, include: incluir, orderBy: [{ abierto_en: 'desc' }, { id: 'desc' }] });
    const pagos = await this.prisma.pago.groupBy({
      by: ['turno_id'], where: { turno_caja: { centro_venta_id: centroId }, estado: 'APLICADO', metodo_pago: { codigo: 'EFECTIVO' } }, _sum: { monto: true },
    });
    const efectivo = new Map(pagos.map((p) => [p.turno_id, p._sum.monto ?? new Prisma.Decimal(0)]));
    return filas.map((t) => this.respuesta(t, efectivo.get(t.id) ?? new Prisma.Decimal(0)));
  }

  private respuesta(t: Prisma.turno_cajaGetPayload<{ include: typeof incluir }>, efectivo: Prisma.Decimal) {
    const esperado = t.fondo_inicial.plus(efectivo);
    const { usuario_turno_caja_abierto_porTousuario: abierto, usuario_turno_caja_cerrado_porTousuario: cerrado, ...turno } = t;
    return { ...turno, fecha_operacion: t.fecha_operacion.toISOString().slice(0, 10), nombre_apertura: abierto.nombre,
      nombre_cierre: cerrado?.nombre ?? null, efectivo_ventas: efectivo.toFixed(2), efectivo_esperado: esperado.toFixed(2),
      diferencia: t.efectivo_contado === null ? null : t.efectivo_contado.minus(esperado).toFixed(2) };
  }

  private async rechazarSiAbierto(centroId: number) {
    const abierto = await this.prisma.turno_caja.findFirst({ where: { centro_venta_id: centroId, estado: 'ABIERTO' }, include: incluir });
    if (abierto) {
      const hora = abierto.abierto_en.toLocaleString('es-GT', { timeZone: 'America/Guatemala' });
      throw new ConflictException(`Ya hay un turno abierto por ${abierto.usuario_turno_caja_abierto_porTousuario.nombre} desde ${hora}.`);
    }
  }

  async abrir(centroId: number, usuarioId: number, fondo: string) {
    await this.rechazarSiAbierto(centroId);
    try {
      const t = await this.prisma.turno_caja.create({ data: { centro_venta_id: centroId, abierto_por: usuarioId, fondo_inicial: fondo }, include: incluir });
      return this.respuesta(t, new Prisma.Decimal(0));
    } catch (error) {
      // Cubre dos aperturas simultáneas; la base impone un único turno abierto.
      await this.rechazarSiAbierto(centroId);
      throw error;
    }
  }

  async cerrar(centroId: number, usuarioId: number, id: number, contado: string) {
    return this.prisma.$transaction(async (tx) => {
      const filas = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM ventas.turno_caja WHERE id = ${id} AND centro_venta_id = ${centroId} FOR UPDATE`;
      if (!filas.length) throw new NotFoundException('No se encontró el turno en este centro de venta.');
      const actual = await tx.turno_caja.findUniqueOrThrow({ where: { id } });
      if (actual.estado !== 'ABIERTO') throw new ConflictException('Este turno de caja ya está cerrado.');
      const suma = await tx.pago.aggregate({ where: { turno_id: id, estado: 'APLICADO', metodo_pago: { codigo: 'EFECTIVO' } }, _sum: { monto: true } });
      const t = await tx.turno_caja.update({ where: { id }, data: { estado: 'CERRADO', cerrado_por: usuarioId, cerrado_en: new Date(), efectivo_contado: contado }, include: incluir });
      return this.respuesta(t, suma._sum.monto ?? new Prisma.Decimal(0));
    });
  }
}
