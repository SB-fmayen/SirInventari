import {
  Body,
  Controller,
  Get,
  Module,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../autenticacion/roles.decorator.js';
import {
  CentroActual,
  UsuarioActual,
  type UsuarioSesion,
} from '../autenticacion/usuario-sesion.js';
import { texto, uuid } from '../pedidos/validacion-pedido.js';
import {
  ClientesService,
  paginaCliente,
  permisoCliente,
} from './clientes.service.js';

@Controller('clientes')
@Roles('ADMIN', 'GERENTE', 'CAJERO', 'MESERO')
export class ClientesController {
  constructor(private readonly clientes: ClientesService) {}
  @Get() lista(
    @CentroActual() centro: number,
    @Query('buscar') buscar: unknown,
    @Query('pagina') pagina: unknown,
  ) {
    return this.clientes.listar(
      centro,
      texto(buscar, 100) ?? '',
      paginaCliente(pagina),
    );
  }
  @Post() crear(
    @CentroActual() centro: number,
    @UsuarioActual() u: UsuarioSesion,
    @Body() c: unknown,
  ) {
    return this.clientes.crear(centro, u, c);
  }
  @Get(':id') ficha(@CentroActual() centro: number, @Param('id') id: string) {
    return this.clientes.ficha(centro, uuid(id));
  }
  @Patch(':id') editar(
    @CentroActual() centro: number,
    @UsuarioActual() u: UsuarioSesion,
    @Param('id') id: string,
    @Body() c: unknown,
  ) {
    return this.clientes.editar(centro, u, uuid(id), c);
  }
  @Get(':id/pedidos') @Roles('ADMIN', 'GERENTE', 'CAJERO') historial(
    @CentroActual() centro: number,
    @UsuarioActual() u: UsuarioSesion,
    @Param('id') id: string,
    @Query('pagina') pagina: unknown,
  ) {
    permisoCliente(u, 'pedidos', 'ver');
    permisoCliente(u, 'caja', 'ver');
    return this.clientes.historial(centro, uuid(id), paginaCliente(pagina));
  }
  @Get(':id/cambios') @Roles('ADMIN', 'GERENTE') cambios(
    @CentroActual() centro: number,
    @Param('id') id: string,
    @Query('pagina') pagina: unknown,
  ) {
    return this.clientes.cambios(centro, uuid(id), paginaCliente(pagina));
  }
}
@Module({
  controllers: [ClientesController],
  providers: [ClientesService],
  exports: [ClientesService],
})
export class ClientesModule {}
