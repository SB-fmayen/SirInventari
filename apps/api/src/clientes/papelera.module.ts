import { BadRequestException, Body, ConflictException, Controller, Get, Injectable, Module, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { Roles } from '../autenticacion/roles.decorator.js';
import { CentroActual, UsuarioActual, type UsuarioSesion } from '../autenticacion/usuario-sesion.js';
import { objeto, texto, uuid } from '../pedidos/validacion-pedido.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ClientesModule } from './clientes.module.js';
import { ClientesService, paginaCliente, permisoCliente, versionCliente } from './clientes.service.js';
import { TiempoRealModule } from '../tiempo-real/tiempo-real.module.js';
import { TiempoRealGateway } from '../tiempo-real/tiempo-real.gateway.js';

@Injectable()
export class PapeleraService {
  constructor(private readonly prisma: PrismaService, private readonly clientes: ClientesService, private readonly tiempoReal: TiempoRealGateway) {}
  async listar(centro: number, u: UsuarioSesion, tipo: string, buscar: string, pagina: number, fecha?: string) {
    permisoCliente(u, tipo, 'ver');
    if (tipo === 'clientes') return this.clientes.listar(centro, buscar, pagina, true);
    if (fecha && (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !Number.isFinite(new Date(fecha).getTime()) || new Date(fecha).toISOString().slice(0,10) !== fecha)) throw new BadRequestException('La fecha no es válida.');
    const where = { centro_venta_id: centro, eliminado_en: { not: null }, ...(fecha ? { fecha_operacion: new Date(fecha) } : {}),
      ...(buscar ? { OR: [{ cliente_nombre: { contains: buscar, mode: 'insensitive' as const } }, { cliente_telefono: { contains: buscar } }, ...(/^\d{1,9}$/.test(buscar) ? [{ folio: Number(buscar) }] : [])] } : {}) };
    return { registros: await this.prisma.pedido.findMany({ where, orderBy: [{ eliminado_en: 'desc' }, { id: 'desc' }], skip: pagina * 50, take: 50,
      select: { id: true, folio: true, fecha_operacion: true, cliente_nombre: true, total: true, estado: true, version: true, eliminado_en: true, motivo_eliminacion: true, usuario_pedido_eliminado_porTousuario: { select: { nombre: true } } } }), total: await this.prisma.pedido.count({ where }), pagina };
  }
  async mover(centro: number, u: UsuarioSesion, tipo: string, id: string, cuerpo: unknown, restaurar: boolean) {
    permisoCliente(u, tipo, restaurar ? 'editar' : 'anular');
    const c = objeto(cuerpo), version = versionCliente(c.version), motivo = restaurar ? null : texto(c.motivo, 300);
    if (!restaurar && !motivo) throw new BadRequestException('Escribe el motivo para enviar a la papelera.');
    const resultado = await this.prisma.$transaction(async tx => {
      if (tipo === 'clientes') await tx.$queryRaw`SELECT id FROM ventas.cliente WHERE id=${id}::uuid AND centro_venta_id=${centro} FOR UPDATE`;
      else await tx.$queryRaw`SELECT id FROM ventas.pedido WHERE id=${id}::uuid AND centro_venta_id=${centro} FOR UPDATE`;
      const actual = tipo === 'clientes' ? await tx.cliente.findFirst({ where: { id, centro_venta_id: centro } }) : await tx.pedido.findFirst({ where: { id, centro_venta_id: centro } });
      if (!actual) throw new NotFoundException('No se encontró el registro en este centro.');
      if (actual.version !== version) {
        // Reenvío inmediato de la misma operación, sin duplicar la auditoría.
        if (actual.version === version + 1 && (restaurar ? !actual.eliminado_en : actual.eliminado_en && actual.eliminado_por === u.id && actual.motivo_eliminacion === motivo)) return { id };
        throw new ConflictException('El registro cambió. Actualiza antes de continuar.');
      }
      if (restaurar ? !actual.eliminado_en : !!actual.eliminado_en) return { id };
      if (tipo === 'pedidos' && !restaurar) {
        const p = await tx.pedido.findUniqueOrThrow({ where: { id } });
        if (!['PAGADO','ANULADO'].includes(p.estado)) throw new ConflictException('Primero anula el pedido pendiente. No se ocultan pedidos por cobrar.');
        if (p.estado !== 'ANULADO' && p.estado_cocina !== 'ENTREGADO') throw new ConflictException('Entrega el pedido antes de enviarlo a la papelera.');
      }
      await tx.$queryRaw`SELECT set_config('app.usuario_id',${String(u.id)},true)`;
      const data = { eliminado_en: restaurar ? null : new Date(), eliminado_por: restaurar ? null : u.id, motivo_eliminacion: motivo, actualizado_en: new Date(), version: { increment: 1 } };
      if (tipo === 'clientes') await tx.cliente.update({ where: { id }, data: { ...data, actualizado_por: u.id } });
      else await tx.pedido.update({ where: { id }, data });
      return { id };
    });
    if (tipo === 'pedidos') await this.tiempoReal.publicar(centro, id);
    return resultado;
  }
}
@Controller('papelera')
@Roles('ADMIN','GERENTE')
export class PapeleraController {
  constructor(private readonly papelera: PapeleraService) {}
  private tipo(valor: string) { if (!['clientes','pedidos'].includes(valor)) throw new BadRequestException('El tipo de registro no es válido.'); return valor; }
  @Get(':tipo') lista(@CentroActual() centro: number, @UsuarioActual() u: UsuarioSesion, @Param('tipo') tipo: string, @Query('buscar') buscar: unknown, @Query('pagina') pagina: unknown, @Query('fecha') fecha?: string) { return this.papelera.listar(centro, u, this.tipo(tipo), texto(buscar,100) ?? '', paginaCliente(pagina), fecha); }
  @Post(':tipo/:id/eliminacion') eliminar(@CentroActual() centro: number, @UsuarioActual() u: UsuarioSesion, @Param('tipo') tipo: string, @Param('id') id: string, @Body() c: unknown) { return this.papelera.mover(centro,u,this.tipo(tipo),uuid(id),c,false); }
  @Post(':tipo/:id/restauracion') restaurar(@CentroActual() centro: number, @UsuarioActual() u: UsuarioSesion, @Param('tipo') tipo: string, @Param('id') id: string, @Body() c: unknown) { return this.papelera.mover(centro,u,this.tipo(tipo),uuid(id),c,true); }
}
@Module({ imports: [ClientesModule,TiempoRealModule], controllers: [PapeleraController], providers: [PapeleraService] })
export class PapeleraModule {}
