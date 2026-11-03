import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Roles } from '../autenticacion/roles.decorator.js';
import { CentroActual, UsuarioActual, type UsuarioSesion } from '../autenticacion/usuario-sesion.js';
import { CatalogoService } from '../catalogo/catalogo.service.js';
import { PedidosService } from './pedidos.service.js';
import { lineas, nuevoPedido, objeto, texto, uuid } from './validacion-pedido.js';

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
    return this.pedidos.crear(centroId, usuario.id, nuevoPedido(cuerpo));
  }
  @Post(':id/lineas') agregar(@CentroActual() centroId: number, @UsuarioActual() usuario: UsuarioSesion, @Param('id') id: string, @Body() cuerpo: unknown) {
    return this.pedidos.agregar(centroId, usuario.id, uuid(id), lineas(cuerpo));
  }
  @Post(':id/lineas/:lineaId/anulacion') anular(@CentroActual() centroId: number, @UsuarioActual() usuario: UsuarioSesion, @Param('id') id: string, @Param('lineaId') lineaId: string, @Body() cuerpo: unknown) {
    const motivo = texto(objeto(cuerpo).motivo, 200);
    if (!motivo) throw new BadRequestException('Escribe el motivo de la anulación.');
    return this.pedidos.anularLinea(centroId, usuario.id, uuid(id), uuid(lineaId), motivo);
  }
}
