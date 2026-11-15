import { BadRequestException, Body, ConflictException, Controller, Get, Injectable, Module, Post } from '@nestjs/common';
import { Roles } from '../autenticacion/roles.decorator.js';
import { CentroActual } from '../autenticacion/usuario-sesion.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { objeto, texto } from '../pedidos/validacion-pedido.js';

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

@Module({ controllers: [DispositivosController], providers: [DispositivosService] })
export class SincronizacionModule {}
