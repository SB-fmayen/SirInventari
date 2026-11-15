import { BadRequestException, Body, ConflictException, Controller, Get, Injectable, Module, NotFoundException, Param, Post } from '@nestjs/common';
import { Roles } from '../autenticacion/roles.decorator.js';
import { CentroActual, UsuarioActual, type UsuarioSesion } from '../autenticacion/usuario-sesion.js';
import { TiempoRealGateway } from '../tiempo-real/tiempo-real.gateway.js';
import { TiempoRealModule } from '../tiempo-real/tiempo-real.module.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { objeto, texto, uuid } from '../pedidos/validacion-pedido.js';

const TIPOS = ['CAJA', 'TABLET', 'COCINA', 'GERENCIA'] as const;

/** Fase 3 · Tarea 17: dispositivos (CAJA1, TAB01…) que pueden trabajar sin internet. */
@Injectable()
export class DispositivosService {
  constructor(private readonly prisma: PrismaService) {}

  listar(centro: number) {
    return this.prisma.dispositivo.findMany({
      where: { centro_venta_id: centro, activo: true },
      select: { id: true, codigo: true, nombre: true, tipo: true, ultima_sincronizacion: true },
      orderBy: { codigo: 'asc' },
    });
  }

  async registrar(centro: number, cuerpo: unknown) {
    const c = objeto(cuerpo);
    const codigo = texto(c.codigo, 10)?.toUpperCase();
    const nombre = texto(c.nombre, 60);
    if (!codigo || !/^[A-Z0-9]{2,10}$/.test(codigo)) throw new BadRequestException('El código debe tener de 2 a 10 letras o números, sin espacios. Ejemplo: CAJA2.');
    if (!nombre) throw new BadRequestException('Escribe un nombre para el dispositivo.');
    if (typeof c.tipo !== 'string' || !TIPOS.includes(c.tipo as (typeof TIPOS)[number])) throw new BadRequestException('Elige si es caja, tablet, cocina o gerencia.');
    try {
      return await this.prisma.dispositivo.create({
        data: { centro_venta_id: centro, codigo, nombre, tipo: c.tipo as (typeof TIPOS)[number] },
        select: { id: true, codigo: true, nombre: true, tipo: true, ultima_sincronizacion: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException(`El código ${codigo} ya está registrado. Usa otro.`);
      throw error;
    }
  }
}

@Controller('dispositivos')
export class DispositivosController {
  constructor(private readonly dispositivos: DispositivosService) {}
  @Get() @Roles('ADMIN', 'GERENTE', 'CAJERO', 'MESERO')
  listar(@CentroActual() centro: number) { return this.dispositivos.listar(centro); }
  @Post() @Roles('ADMIN', 'GERENTE')
  registrar(@CentroActual() centro: number, @Body() cuerpo: unknown) { return this.dispositivos.registrar(centro, cuerpo); }
}

// ---------------------------------------------------------------------------
// Tarea 18: la cola del dispositivo llega aquí, en el orden en que se hizo.
// Las funciones sync_pedido y sync_pago de la base deciden APLICADO, YA_EXISTIA
// o CONFLICTO (bandeja del gerente). Reenviar es seguro: los ID son UUID del dispositivo.
// ---------------------------------------------------------------------------
type Resultado = 'APLICADO' | 'YA_EXISTIA' | 'CONFLICTO' | 'YA_EN_CONFLICTO' | 'CONFLICTO_PARCIAL';
interface RespuestaOperacion { id: string; tipo: 'PEDIDO' | 'PAGO'; resultado: Resultado; folio?: number | null; motivo?: string; lineas?: Record<string, string> }

function hora(valor: unknown, campo: string): string {
  if (typeof valor !== 'string' || !Number.isFinite(Date.parse(valor))) throw new BadRequestException(`Falta la hora real del dispositivo en ${campo}.`);
  if (Date.parse(valor) > Date.now() + 10 * 60000) throw new BadRequestException('La hora del dispositivo está adelantada. Revisa la fecha y hora de la tablet.');
  return new Date(valor).toISOString();
}
const textoOpcional = (v: unknown, max: number) => (v === undefined || v === null || v === '' ? null : texto(v, max));

@Injectable()
export class SincronizacionService {
  constructor(private readonly prisma: PrismaService, private readonly tiempoReal: TiempoRealGateway) {}

  async recibir(centro: number, usuario: UsuarioSesion, cuerpo: unknown): Promise<{ resultados: RespuestaOperacion[] }> {
    const c = objeto(cuerpo);
    const dispositivoId = Number(c.dispositivo_id);
    if (!Number.isSafeInteger(dispositivoId)) throw new BadRequestException('Elige en Inicio qué equipo es este antes de enviar ventas sin internet.');
    const disp = await this.prisma.dispositivo.findFirst({ where: { id: dispositivoId, centro_venta_id: centro } });
    if (!disp) throw new BadRequestException('Este equipo no está registrado en el centro elegido.');
    if (!Array.isArray(c.operaciones) || !c.operaciones.length || c.operaciones.length > 100) throw new BadRequestException('Envía entre 1 y 100 operaciones a la vez.');
    const resultados: RespuestaOperacion[] = [];
    for (const bruto of c.operaciones as unknown[]) {
      const op = objeto(bruto);
      const tipo = op.tipo;
      const datos = objeto(op.datos);
      if (tipo === 'PEDIDO') resultados.push(await this.pedido(centro, usuario, dispositivoId, datos));
      else if (tipo === 'PAGO') resultados.push(await this.pago(usuario, dispositivoId, datos));
      else throw new BadRequestException('Tipo de operación no válido.');
    }
    return { resultados };
  }

  private async motivo(id: string): Promise<string | undefined> {
    return (await this.prisma.sync_conflicto.findUnique({ where: { operacion_id: id }, select: { motivo: true } }))?.motivo;
  }

  private async pedido(centro: number, usuario: UsuarioSesion, dispositivoId: number, d: Record<string, unknown>): Promise<RespuestaOperacion> {
    const id = uuid(d.id);
    const creadoEn = hora(d.creado_en, 'el pedido');
    if (!Array.isArray(d.lineas) || d.lineas.length > 200) throw new BadRequestException('El pedido sin internet trae productos no válidos.');
    // El usuario y el precio salen de la API, no del dispositivo.
    const lineas = [];
    for (const bruta of d.lineas as unknown[]) {
      const l = objeto(bruta);
      const productoId = Number(l.producto_id);
      const cantidad = String(l.cantidad);
      if (!/^\d{1,6}(\.\d{1,2})?$/.test(cantidad) || Number(cantidad) <= 0) throw new BadRequestException('La cantidad de un producto no es válida.');
      const producto = Number.isSafeInteger(productoId) ? await this.prisma.producto.findUnique({ where: { id: productoId }, include: { producto_centro: { where: { centro_venta_id: centro } } } }) : null;
      lineas.push({ id: uuid(l.id), producto_id: productoId, cantidad, notas: textoOpcional(l.notas, 200),
        precio_unitario: producto ? (producto.producto_centro[0]?.precio ?? producto.precio_base).toString() : null,
        agregado_por: usuario.id, agregado_en: l.agregado_en ? hora(l.agregado_en, 'un producto') : creadoEn });
    }
    const json = {
      id, dispositivo_id: dispositivoId, tipo_venta_id: Number(d.tipo_venta_id), creado_por: usuario.id, creado_en: creadoEn,
      cliente_nombre: textoOpcional(d.cliente_nombre, 100) ?? 'Cliente de mostrador', origen: 'SIN_INTERNET',
      folio_offline: textoOpcional(d.folio_offline, 20), lineas,
    };
    const [fila] = await this.prisma.$queryRaw<{ r: { pedido: Resultado; folio: number | null; lineas?: Record<string, string> } }[]>`SELECT ventas.sync_pedido(${JSON.stringify(json)}::jsonb) AS r`;
    const r = fila.r;
    if (r.pedido === 'APLICADO' || r.pedido === 'YA_EXISTIA') await this.prisma.pedido.update({ where: { id }, data: { sincronizado_en: new Date() } }).catch(() => undefined);
    const lineasConflicto = Object.entries(r.lineas ?? {}).filter(([, v]) => v === 'CONFLICTO' || v === 'YA_EN_CONFLICTO').map(([k]) => k);
    let motivo = r.pedido === 'CONFLICTO' || r.pedido === 'YA_EN_CONFLICTO' ? await this.motivo(id) : undefined;
    if (!motivo && lineasConflicto.length) motivo = await this.motivo(lineasConflicto[0]);
    if (r.folio) await this.tiempoReal.publicar(centro, id);
    return { id, tipo: 'PEDIDO', resultado: lineasConflicto.length && (r.pedido === 'APLICADO' || r.pedido === 'YA_EXISTIA') ? 'CONFLICTO_PARCIAL' : r.pedido, folio: r.folio, lineas: r.lineas, ...(motivo ? { motivo } : {}) };
  }

  private async pago(usuario: UsuarioSesion, dispositivoId: number, d: Record<string, unknown>): Promise<RespuestaOperacion> {
    const id = uuid(d.id);
    const monto = String(d.monto);
    if (!/^\d{1,8}(\.\d{1,2})?$/.test(monto) || Number(monto) <= 0) throw new BadRequestException('El monto de un cobro sin internet no es válido.');
    const json = {
      id, pedido_id: uuid(d.pedido_id), dispositivo_id: dispositivoId, metodo_pago_id: Number(d.metodo_pago_id), monto,
      terminal_pos: textoOpcional(d.terminal_pos, 30), referencia_pos: textoOpcional(d.referencia_pos, 40),
      registrado_por: usuario.id, registrado_en: hora(d.registrado_en, 'el cobro'), origen: 'SIN_INTERNET',
    };
    const [fila] = await this.prisma.$queryRaw<{ r: Resultado }[]>`SELECT ventas.sync_pago(${JSON.stringify(json)}::jsonb) AS r`;
    const motivo = fila.r === 'CONFLICTO' || fila.r === 'YA_EN_CONFLICTO' ? await this.motivo(id) : undefined;
    return { id, tipo: 'PAGO', resultado: fila.r, ...(motivo ? { motivo } : {}) };
  }

  /** Bandeja de conflictos del gerente y equipos que no sincronizan hace más de 15 minutos. */
  async bandeja(centro: number) {
    const [conflictos, atrasados] = await Promise.all([
      this.prisma.sync_conflicto.findMany({ where: { centro_venta_id: centro, estado: 'PENDIENTE' }, include: { dispositivo: { select: { codigo: true, nombre: true } } }, orderBy: { recibido_en: 'asc' }, take: 200 }),
      this.prisma.$queryRaw<{ codigo: string; nombre: string; ultima_sincronizacion: Date | null }[]>`
        SELECT codigo::text, nombre::text, ultima_sincronizacion FROM ventas.dispositivo
        WHERE centro_venta_id = ${centro} AND activo AND tipo IN ('CAJA','TABLET')
          AND ultima_sincronizacion IS NOT NULL AND ultima_sincronizacion < now() - INTERVAL '15 minutes'`,
    ]);
    return {
      conflictos: conflictos.map((x) => ({ id: x.id.toString(), tipo: x.tipo_operacion, dispositivo: x.dispositivo.codigo, motivo: x.motivo, recibido_en: x.recibido_en, datos: x.datos })),
      atrasados,
    };
  }

  async resolver(centro: number, usuario: UsuarioSesion, numero: string, cuerpo: unknown) {
    const c = objeto(cuerpo);
    if (c.estado !== 'RESUELTO' && c.estado !== 'DESCARTADO') throw new BadRequestException('Indica si el conflicto quedó resuelto o descartado.');
    const nota = texto(c.nota, 300);
    if (!nota) throw new BadRequestException('Escribe qué se hizo con este conflicto.');
    if (!/^\d+$/.test(numero)) throw new BadRequestException('Conflicto no válido.');
    const r = await this.prisma.sync_conflicto.updateMany({ where: { id: BigInt(numero), centro_venta_id: centro, estado: 'PENDIENTE' }, data: { estado: c.estado, nota_resolucion: nota, resuelto_por: usuario.id, resuelto_en: new Date() } });
    if (!r.count) throw new NotFoundException('Ese conflicto ya fue atendido o no es de este centro.');
    return { ok: true };
  }
}

@Controller('sincronizacion')
export class SincronizacionController {
  constructor(private readonly sync: SincronizacionService) {}
  @Post() @Roles('ADMIN', 'GERENTE', 'CAJERO', 'MESERO')
  recibir(@CentroActual() centro: number, @UsuarioActual() u: UsuarioSesion, @Body() cuerpo: unknown) { return this.sync.recibir(centro, u, cuerpo); }
  @Get('conflictos') @Roles('ADMIN', 'GERENTE')
  bandeja(@CentroActual() centro: number) { return this.sync.bandeja(centro); }
  @Post('conflictos/:id') @Roles('ADMIN', 'GERENTE')
  resolver(@CentroActual() centro: number, @UsuarioActual() u: UsuarioSesion, @Param('id') id: string, @Body() cuerpo: unknown) { return this.sync.resolver(centro, u, id, cuerpo); }
}

@Module({ imports: [TiempoRealModule], controllers: [DispositivosController, SincronizacionController], providers: [DispositivosService, SincronizacionService] })
export class SincronizacionModule {}
