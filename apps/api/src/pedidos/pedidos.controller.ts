import { BadRequestException, Body, ForbiddenException, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Roles } from '../autenticacion/roles.decorator.js';
import { CentroActual, UsuarioActual, type UsuarioSesion } from '../autenticacion/usuario-sesion.js';
import { CatalogoService } from '../catalogo/catalogo.service.js';
import { PedidosService } from './pedidos.service.js';
import { lineas, nuevoPedido, objeto, texto, uuid } from './validacion-pedido.js';

// Tarea 15: CAJERO y MESERO no anulan directamente; piden autorización a un gerente.
function soloGerente(usuario: UsuarioSesion, mensaje: string) {
  if (!['ADMIN', 'GERENTE'].includes(usuario.rol)) throw new ForbiddenException(mensaje);
}

@Controller('pedidos')
@Roles('ADMIN', 'GERENTE', 'CAJERO', 'MESERO')
export class PedidosController {
  constructor(private readonly pedidos: PedidosService, private readonly catalogo: CatalogoService) {}
  @Get('tipos') tipos() { return this.pedidos.tipos(); }
  @Get('catalogo') async menu(@CentroActual() centroId: number) {
    const productos = await this.catalogo.productos(centroId, '');
    return productos.filter((p) => p.disponible_venta);
  }
  @Get() listar(@CentroActual() centroId: number, @Query('buscar') buscar?: unknown, @Query('anteriores') anteriores?: string, @Query('fecha') fecha?: string) {
    if (buscar !== undefined && typeof buscar !== 'string') throw new BadRequestException('La búsqueda no es válida.');
    return this.pedidos.listar(centroId, texto(buscar, 100) ?? '', anteriores === '1', fecha);
  }
  @Get(':id') detalle(@CentroActual() centroId: number, @Param('id') id: string) { return this.pedidos.detalle(centroId, uuid(id)); }
  @Post() crear(@CentroActual() centroId: number, @UsuarioActual() usuario: UsuarioSesion, @Body() cuerpo: unknown) {
    return this.pedidos.crear(centroId, usuario, nuevoPedido(cuerpo));
  }
  @Post(':id/lineas') agregar(@CentroActual() centroId: number, @UsuarioActual() usuario: UsuarioSesion, @Param('id') id: string, @Body() cuerpo: unknown) {
    return this.pedidos.agregar(centroId, usuario.id, uuid(id), lineas(cuerpo));
  }
  @Post(':id/lineas/:lineaId/anulacion') anular(@CentroActual() centroId: number, @UsuarioActual() usuario: UsuarioSesion, @Param('id') id: string, @Param('lineaId') lineaId: string, @Body() cuerpo: unknown) {
    const motivo = texto(objeto(cuerpo).motivo, 200);
    if (!motivo) throw new BadRequestException('Escribe el motivo de la anulación.');
    soloGerente(usuario, 'Para quitar un producto ya guardado necesitas la autorización de un gerente. Usa «Solicitar autorización».');
    return this.pedidos.anularLinea(centroId, usuario.id, uuid(id), uuid(lineaId), motivo);
  }
  @Post(':id/anulacion') anularPedido(@CentroActual() centroId: number, @UsuarioActual() usuario: UsuarioSesion, @Param('id') id: string, @Body() cuerpo: unknown) {
    const motivo = texto(objeto(cuerpo).motivo, 200);
    if (!motivo) throw new BadRequestException('Escribe por qué el cliente ya no necesita el pedido.');
    soloGerente(usuario, 'Solo un gerente o administrador puede anular un pedido completo. Pídele que lo anule desde su usuario.');
    return this.pedidos.anularPedido(centroId, usuario.id, uuid(id), motivo);
  }
}
