import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { objeto, texto, uuid } from '../pedidos/validacion-pedido.js';
import type { UsuarioSesion } from '../autenticacion/usuario-sesion.js';

export function permisoCliente(u: UsuarioSesion, modulo: string, accion: string) {
  if (u.rol !== 'ADMIN' && u.permisos?.some(p => p.modulo === modulo && ['ver', accion].includes(p.accion) && !p.permitido)) {
    throw new ForbiddenException('Tu administrador restringió esta acción para tu usuario.');
  }
}
export function versionCliente(valor: unknown) {
  if (typeof valor !== 'number' || !Number.isSafeInteger(valor) || valor < 1) throw new BadRequestException('Actualiza el registro antes de guardar.');
  return valor;
}
export function telefonoNormalizado(valor: string) {
  if (!/^\+?[\d\s().-]+$/.test(valor)) throw new BadRequestException('Escribe un teléfono válido, con prefijo internacional si corresponde.');
  const normalizado = valor.replace(/\D/g, '');
  if (!/^\d{6,15}$/.test(normalizado)) throw new BadRequestException('El teléfono debe tener entre 6 y 15 dígitos.');
  return normalizado;
}
export function datosCliente(cuerpo: unknown) {
  const c = objeto(cuerpo);
  const nombre = texto(c.nombre, 100), telefono = texto(c.telefono, 30), direccion = texto(c.direccion, 300);
  if (!nombre || !telefono) throw new BadRequestException('Escribe el nombre y el teléfono del cliente.');
  return { nombre, telefono, telefono_normalizado: telefonoNormalizado(telefono), direccion };
}
export const paginaCliente = (valor: unknown) => {
  if (valor === undefined) return 0;
  if (typeof valor !== 'string' || !/^\d{1,6}$/.test(valor)) throw new BadRequestException('La página no es válida.');
  return Number(valor);
};
const seleccion = { id: true, nombre: true, telefono: true, direccion: true, version: true, eliminado_en: true, motivo_eliminacion: true, eliminado_por: true, creado_en: true } satisfies Prisma.clienteSelect;
export type VinculoCliente = { cliente_id: string | null; cliente_nombre: string | null; cliente_telefono: string | null; cliente_direccion: string | null; cliente_version: number | null; actualizar_cliente: boolean };

@Injectable()
export class ClientesService {
  constructor(private readonly prisma: PrismaService) {}
  async ficha(centro: number, id: string) {
    const c = await this.prisma.cliente.findFirst({ where: { id, centro_venta_id: centro }, select: seleccion });
    if (!c) throw new NotFoundException('No se encontró el cliente en este centro.');
    return c;
  }
  async listar(centro: number, buscar: string, pagina: number, papelera = false) {
    const digitos = buscar.replace(/\D/g, '');
    const where: Prisma.clienteWhereInput = { centro_venta_id: centro, eliminado_en: papelera ? { not: null } : null,
      ...(buscar ? { OR: [{ nombre: { contains: buscar, mode: 'insensitive' } }, { telefono: { contains: buscar } }, ...(digitos ? [{ telefono_normalizado: { contains: digitos } }] : [])] } : {}) };
    const [registros, total] = await Promise.all([
      this.prisma.cliente.findMany({ where, select: { ...seleccion, usuario_cliente_eliminado_porTousuario: { select: { nombre: true } } }, orderBy: [{ nombre: 'asc' }, { id: 'asc' }], skip: pagina * 50, take: 50 }),
      this.prisma.cliente.count({ where }),
    ]);
    return { registros, total, pagina };
  }
  async crear(centro: number, u: UsuarioSesion, cuerpo: unknown) {
    const c = objeto(cuerpo), id = uuid(c.id), datos = datosCliente(c);
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))::text`;
      const existente = await tx.cliente.findUnique({ where: { id } });
      if (existente) {
        if (existente.centro_venta_id !== centro || existente.creado_por !== u.id || existente.nombre !== datos.nombre || existente.telefono !== datos.telefono || existente.direccion !== datos.direccion || existente.eliminado_en) throw new ConflictException('Ese cliente ya existe con otros datos. Actualiza la lista.');
        return tx.cliente.findUniqueOrThrow({ where: { id }, select: seleccion });
      }
      await this.comprobarTelefono(tx, centro, datos.telefono_normalizado);
      await tx.$queryRaw`SELECT set_config('app.usuario_id',${String(u.id)},true)`;
      return tx.cliente.create({ data: { id, centro_venta_id: centro, ...datos, creado_por: u.id, actualizado_por: u.id }, select: seleccion });
    });
  }
  private async comprobarTelefono(tx: Prisma.TransactionClient, centro: number, telefono: string, excluir?: string) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`cliente:${centro}:${telefono}`}))::text`;
    const c = await tx.cliente.findFirst({ where: { centro_venta_id: centro, telefono_normalizado: telefono, ...(excluir ? { id: { not: excluir } } : {}) } });
    if (c) throw new ConflictException(c.eliminado_en ? 'Ese teléfono pertenece a un cliente en la papelera. Pide a un gerente que lo restaure.' : 'Ya existe un cliente con ese teléfono. Búscalo y selecciona su ficha.');
  }
  async editar(centro: number, u: UsuarioSesion, id: string, cuerpo: unknown) {
    const c = objeto(cuerpo), datos = datosCliente(c), version = versionCliente(c.version);
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM ventas.cliente WHERE id=${id}::uuid AND centro_venta_id=${centro} FOR UPDATE`;
      const actual = await tx.cliente.findFirst({ where: { id, centro_venta_id: centro } });
      if (!actual) throw new NotFoundException('No se encontró el cliente en este centro.');
      if (actual.eliminado_en) throw new ConflictException('Restaura el cliente antes de editarlo.');
      if (actual.version !== version) {
        if (actual.nombre === datos.nombre && actual.telefono === datos.telefono && actual.direccion === datos.direccion && actual.actualizado_por === u.id && actual.version === version + 1) return actual;
        throw new ConflictException('Otro usuario cambió este cliente. Vuelve a abrir su ficha antes de guardar.');
      }
      await this.comprobarTelefono(tx, centro, datos.telefono_normalizado, id);
      if (actual.nombre === datos.nombre && actual.telefono === datos.telefono && actual.direccion === datos.direccion) return actual;
      await tx.$queryRaw`SELECT set_config('app.usuario_id',${String(u.id)},true)`;
      return tx.cliente.update({ where: { id }, data: { ...datos, actualizado_por: u.id, actualizado_en: new Date(), version: { increment: 1 } }, select: seleccion });
    });
  }
  // La venta y la ficha se guardan en la misma transacción; reintentos del pedido se resuelven antes de entrar aquí.
  async vincular(tx: Prisma.TransactionClient, centro: number, u: UsuarioSesion, datos: VinculoCliente) {
    if (!datos.cliente_id && !datos.cliente_telefono) return null;
    permisoCliente(u, 'clientes', datos.cliente_id ? (datos.actualizar_cliente ? 'editar' : 'ver') : 'crear');
    const ficha = datosCliente({ nombre: datos.cliente_nombre, telefono: datos.cliente_telefono, direccion: datos.cliente_direccion });
    if (datos.cliente_id) {
      await tx.$queryRaw`SELECT id FROM ventas.cliente WHERE id=${datos.cliente_id}::uuid AND centro_venta_id=${centro} FOR UPDATE`;
      const c = await tx.cliente.findFirst({ where: { id: datos.cliente_id, centro_venta_id: centro } });
      if (!c) throw new NotFoundException('No se encontró el cliente en este centro.');
      if (c.eliminado_en) throw new ConflictException('El cliente está en la papelera. Pide a un gerente que lo restaure.');
      if (c.version !== datos.cliente_version) throw new ConflictException('La ficha del cliente cambió. Búscalo de nuevo antes de guardar.');
      if (c.nombre !== ficha.nombre || c.telefono !== ficha.telefono || c.direccion !== ficha.direccion) {
        if (!datos.actualizar_cliente) throw new ConflictException('Los datos difieren de la ficha. Confirma actualizar el cliente o vuelve a seleccionarlo.');
        await this.comprobarTelefono(tx, centro, ficha.telefono_normalizado, c.id);
        await tx.cliente.update({ where: { id: c.id }, data: { ...ficha, actualizado_por: u.id, actualizado_en: new Date(), version: { increment: 1 } } });
      }
      return c.id;
    }
    await this.comprobarTelefono(tx, centro, ficha.telefono_normalizado);
    const c = await tx.cliente.create({ data: { id: randomUUID(), centro_venta_id: centro, ...ficha, creado_por: u.id, actualizado_por: u.id } });
    return c.id;
  }
  async historial(centro: number, id: string, pagina: number) {
    await this.ficha(centro, id);
    const where = { cliente_id: id, centro_venta_id: centro };
    return { registros: await this.prisma.pedido.findMany({ where, orderBy: [{ creado_en: 'desc' }, { id: 'desc' }], skip: pagina * 50, take: 50,
      select: { id: true, folio: true, fecha_operacion: true, estado: true, total: true, eliminado_en: true, creado_en: true } }), total: await this.prisma.pedido.count({ where }), pagina };
  }
  async cambios(centro: number, id: string, pagina: number) {
    await this.ficha(centro, id);
    const where = { cliente_id: id, centro_venta_id: centro };
    const registros = await this.prisma.cliente_cambio.findMany({ where, include: { usuario: { select: { nombre: true } } }, orderBy: [{ fecha: 'desc' }, { id: 'desc' }], skip: pagina * 50, take: 50 });
    return { registros: registros.map(c => ({ ...c, id: c.id.toString() })), total: await this.prisma.cliente_cambio.count({ where }), pagina };
  }
}
