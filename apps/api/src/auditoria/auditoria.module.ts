import { BadRequestException, Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { Roles } from '../autenticacion/roles.decorator.js';
import { CentroActual } from '../autenticacion/usuario-sesion.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { uuid } from '../pedidos/validacion-pedido.js';

type Json = Record<string, unknown> | null;
interface FilaAuditoria {
  id: string; tabla: string; accion: string; antes: Json; despues: Json; fecha: Date
  usuario_id: number | null; usuario: string | null; folio: number; fecha_operacion: string; pedido_id: string
}
const txt = (v: unknown): string => v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v as string | number | boolean);
const q = (v: unknown) => `Q ${Number(v ?? 0).toFixed(2)}`;
const nombresEstado: Record<string, string> = { ABIERTO: 'Abierto', EN_PREPARACION: 'En preparación', LISTO: 'Listo', ENTREGADO: 'Entregado', PAGADO: 'Pagado', ANULADO: 'Anulado', PENDIENTE: 'Pendiente' };
const estado = (v: unknown) => nombresEstado[txt(v)] ?? txt(v);
// Campos técnicos que no se explican al usuario.
const ignorar = new Set(['version', 'actualizado_en', 'sincronizado_en', 'subtotal', 'pagado', 'saldo']);
const nombresCampo: Record<string, string> = {
  cliente_nombre: 'el nombre del cliente', cliente_telefono: 'el teléfono del cliente', cliente_direccion: 'la dirección del cliente',
  descuento: 'el descuento', tipo_venta_id: 'el tipo de venta', mesa_referencia: 'la referencia', notas: 'las notas', cantidad: 'la cantidad',
};

/** Explica en palabras sencillas qué cambió en un registro de auditoría. */
export function explicar(f: Pick<FilaAuditoria, 'tabla' | 'accion' | 'antes' | 'despues'>, productos: Map<number, string>, metodos: Map<number, string>): string {
  const a = f.antes ?? {}, d = f.despues ?? {};
  if (f.tabla === 'pedido') {
    if (f.accion === 'INSERT') return `Creó el pedido${d.cliente_nombre ? ` para ${txt(d.cliente_nombre)}` : ''}.`;
    const partes: string[] = [];
    if (d.motivo_anulacion && d.estado === 'ANULADO') partes.push(`Anuló el pedido. Motivo: ${txt(d.motivo_anulacion)}`);
    else if (a.estado !== d.estado && d.estado !== undefined) partes.push(`Cambió el estado de «${estado(a.estado)}» a «${estado(d.estado)}»`);
    if (a.estado_cocina !== d.estado_cocina && d.estado_cocina !== undefined) partes.push(`Cocina pasó de «${estado(a.estado_cocina)}» a «${estado(d.estado_cocina)}»`);
    if (a.total !== d.total && d.total !== undefined) partes.push(`El total pasó de ${q(a.total)} a ${q(d.total)}`);
    if (!a.eliminado_en && d.eliminado_en) partes.push(`Lo envió a la papelera. Motivo: ${txt(d.motivo_eliminacion)}`);
    if (a.eliminado_en && !d.eliminado_en && 'eliminado_en' in d) partes.push('Lo restauró de la papelera');
    if (!a.cortesia_en && d.cortesia_en) partes.push(`Lo marcó como cortesía. Motivo: ${txt(d.motivo_cortesia)}`);
    for (const campo of Object.keys(nombresCampo)) if (campo in d && a[campo] !== d[campo]) partes.push(`Cambió ${nombresCampo[campo]} de «${txt(a[campo])}» a «${txt(d[campo])}»`);
    return partes.length ? `${partes.join('. ')}.` : 'Actualizó datos internos del pedido.';
  }
  if (f.tabla === 'pedido_detalle') {
    const producto = productos.get(Number(d.producto_id ?? a.producto_id)) ?? 'un producto';
    if (f.accion === 'INSERT') return `Agregó ${Number(d.cantidad)} × ${producto} a ${q(d.precio_unitario)} c/u${d.notas ? ` (notas: ${txt(d.notas)})` : ''}.`;
    if (a.estado !== 'ANULADA' && d.estado === 'ANULADA') return `Quitó ${producto}. Motivo: ${txt(d.motivo_anulacion)}.`;
    const cambios = Object.keys(d).filter((k) => !ignorar.has(k) && JSON.stringify(a[k]) !== JSON.stringify(d[k]));
    return cambios.length ? `Cambió ${producto}: ${cambios.map((k) => `${nombresCampo[k] ?? k} de «${txt(a[k])}» a «${txt(d[k])}»`).join(', ')}.` : `Actualizó ${producto}.`;
  }
  if (f.tabla === 'pago') {
    const metodo = metodos.get(Number(d.metodo_pago_id ?? a.metodo_pago_id)) ?? 'otro método';
    if (f.accion === 'INSERT') return `Cobró ${q(d.monto)} con ${metodo}${d.referencia_pos ? ` (autorización ${txt(d.referencia_pos)}${d.terminal_pos ? `, terminal ${txt(d.terminal_pos)}` : ''})` : ''}.`;
    if (a.estado !== 'ANULADO' && d.estado === 'ANULADO') return `Anuló el pago de ${q(d.monto)} con ${metodo}. Motivo: ${txt(d.motivo_anulacion)}.`;
    return `Actualizó el pago de ${q(d.monto ?? a.monto)}.`;
  }
  return 'Cambio registrado.';
}

function fechaValida(v: unknown): string | null {
  if (v === undefined || v === '') return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v)
    throw new BadRequestException('Escribe la fecha con el formato año-mes-día.');
  return v;
}
function enteroOpcional(v: unknown, mensaje: string): number | null {
  if (v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < 1) throw new BadRequestException(mensaje);
  return n;
}

@Injectable()
export class AuditoriaService {
  constructor(private readonly prisma: PrismaService) {}

  async buscar(centro: number, filtros: { pedido?: unknown; folio?: unknown; fecha?: unknown; usuario?: unknown }) {
    const pedidoId = filtros.pedido === undefined || filtros.pedido === '' ? null : uuid(filtros.pedido);
    const folio = enteroOpcional(filtros.folio, 'El folio debe ser un número.');
    const fecha = fechaValida(filtros.fecha);
    const usuario = enteroOpcional(filtros.usuario, 'Elige un usuario válido.');
    if (!pedidoId && !folio && !fecha && !usuario) throw new BadRequestException('Elige un pedido, un folio, una fecha o un usuario.');
    const filas = await this.prisma.$queryRaw<FilaAuditoria[]>`
      SELECT a.id::text, a.tabla::text, a.accion::text, a.antes, a.despues, a.fecha, a.usuario_id, u.nombre::text AS usuario,
             p.folio, p.fecha_operacion::text AS fecha_operacion, p.id::text AS pedido_id
      FROM ventas.auditoria a
      JOIN ventas.pedido p ON p.id::text = CASE WHEN a.tabla = 'pedido' THEN a.registro_id ELSE COALESCE(a.despues->>'pedido_id', a.antes->>'pedido_id') END
      LEFT JOIN ventas.usuario u ON u.id = a.usuario_id
      WHERE a.tabla IN ('pedido', 'pedido_detalle', 'pago') AND p.centro_venta_id = ${centro}
        AND (${pedidoId}::uuid IS NULL OR p.id = ${pedidoId}::uuid)
        AND (${folio}::int IS NULL OR p.folio = ${folio}::int)
        AND (${fecha}::date IS NULL OR (a.fecha AT TIME ZONE 'America/Guatemala')::date = ${fecha}::date OR (${folio}::int IS NOT NULL AND p.fecha_operacion = ${fecha}::date))
        AND (${usuario}::int IS NULL OR a.usuario_id = ${usuario}::int)
      ORDER BY a.fecha DESC, a.id DESC
      LIMIT 300`;
    const [productos, metodos] = await Promise.all([
      this.prisma.producto.findMany({ select: { id: true, nombre: true } }),
      this.prisma.metodo_pago.findMany({ select: { id: true, nombre: true } }),
    ]);
    const mp = new Map(productos.map((p) => [p.id, p.nombre])), mm = new Map(metodos.map((m) => [m.id, m.nombre]));
    return filas.map((f) => ({
      id: f.id, fecha: f.fecha.toISOString(), usuario: f.usuario ?? 'Sistema (sin usuario registrado)', usuario_id: f.usuario_id,
      pedido_id: f.pedido_id, folio: f.folio, fecha_operacion: f.fecha_operacion,
      que: f.tabla === 'pedido' ? 'Pedido' : f.tabla === 'pago' ? 'Pago' : 'Producto del pedido',
      explicacion: explicar(f, mp, mm), antes: f.antes, despues: f.despues,
    }));
  }

  usuarios(centro: number) {
    return this.prisma.usuario.findMany({
      where: { OR: [{ rol: 'ADMIN' }, { usuario_centro: { some: { centro_venta_id: centro } } }] },
      select: { id: true, nombre: true, rol: true }, orderBy: { nombre: 'asc' },
    });
  }
}

@Controller('auditoria')
@Roles('ADMIN', 'GERENTE')
export class AuditoriaController {
  constructor(private readonly auditoria: AuditoriaService) {}
  @Get() buscar(@CentroActual() centro: number, @Query('pedido') pedido?: unknown, @Query('folio') folio?: unknown, @Query('fecha') fecha?: unknown, @Query('usuario') usuario?: unknown) {
    return this.auditoria.buscar(centro, { pedido, folio, fecha, usuario });
  }
  @Get('usuarios') usuarios(@CentroActual() centro: number) { return this.auditoria.usuarios(centro); }
}

@Module({ controllers: [AuditoriaController], providers: [AuditoriaService] })
export class AuditoriaModule {}
