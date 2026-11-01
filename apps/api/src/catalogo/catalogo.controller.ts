import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Roles } from '../autenticacion/roles.decorator.js';
import { CentroActual } from '../autenticacion/usuario-sesion.js';
import { CatalogoService } from './catalogo.service.js';
import { categoria, entero, producto, productoCentro } from './validacion-catalogo.js';

const idValido = new ParseIntPipe({ exceptionFactory: () => new BadRequestException('El número del catálogo no es válido.') });

@Controller('catalogo')
@Roles('ADMIN', 'GERENTE')
export class CatalogoController {
  constructor(private readonly catalogo: CatalogoService) {}

  @Get('categorias')
  categorias() { return this.catalogo.categorias(); }

  @Post('categorias')
  crearCategoria(@Body() cuerpo: unknown) { return this.catalogo.guardarCategoria(null, categoria(cuerpo, true)); }

  @Patch('categorias/:id')
  editarCategoria(@Param('id', idValido) id: number, @Body() cuerpo: unknown) {
    return this.catalogo.guardarCategoria(id, categoria(cuerpo, false));
  }

  @Get('productos')
  productos(@CentroActual() centroId: number, @Query('buscar') buscar?: unknown, @Query('categoria_id') categoriaId?: unknown) {
    if (buscar !== undefined && (typeof buscar !== 'string' || buscar.length > 120)) {
      throw new BadRequestException('La búsqueda debe tener hasta 120 caracteres.');
    }
    if (categoriaId !== undefined && (typeof categoriaId !== 'string' || !/^\d+$/.test(categoriaId))) {
      throw new BadRequestException('El número de categoría no es válido.');
    }
    return this.catalogo.productos(centroId, (buscar as string | undefined)?.trim() ?? '',
      categoriaId === undefined ? undefined : entero(Number(categoriaId), 'categoría', 1));
  }

  @Post('productos')
  crearProducto(@Body() cuerpo: unknown) { return this.catalogo.guardarProducto(null, producto(cuerpo, true)); }

  @Patch('productos/:id')
  editarProducto(@Param('id', idValido) id: number, @Body() cuerpo: unknown) {
    return this.catalogo.guardarProducto(id, producto(cuerpo, false));
  }

  @Patch('productos/:id/centro')
  editarCentro(@Param('id', idValido) id: number, @CentroActual() centroId: number, @Body() cuerpo: unknown) {
    return this.catalogo.guardarCentro(id, centroId, productoCentro(cuerpo));
  }
}
