import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  objeto,
  precio,
  type categoria,
  type producto,
  type productoCentro,
} from './validacion-catalogo.js';

@Injectable()
export class CatalogoService {
  constructor(private readonly prisma: PrismaService) {}

  categorias() {
    return this.prisma.categoria.findMany({
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }, { id: 'asc' }],
    });
  }

  guardarCategoria(id: number | null, datos: ReturnType<typeof categoria>) {
    return id === null
      ? this.prisma.categoria.create({
          data: { ...datos, nombre: datos.nombre! },
        })
      : this.prisma.categoria.update({ where: { id }, data: datos });
  }

  async productos(centroId: number, buscar: string, categoriaId?: number) {
    const filas = await this.prisma.producto.findMany({
      where: {
        ...(categoriaId ? { categoria_id: categoriaId } : {}),
        ...(buscar
          ? {
              OR: [
                { nombre: { contains: buscar, mode: 'insensitive' as const } },
                { sku: { contains: buscar, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      include: {
        categoria: true,
        producto_centro: { where: { centro_venta_id: centroId } },
      },
      orderBy: [
        { categoria: { orden: 'asc' } },
        { nombre: 'asc' },
        { id: 'asc' },
      ],
    });
    return filas.map(({ producto_centro, ...p }) => ({
      ...p,
      precio_centro: producto_centro[0]?.precio ?? null,
      precio: producto_centro[0]?.precio ?? p.precio_base,
      disponible: producto_centro[0]?.disponible ?? true,
      disponible_venta:
        p.activo &&
        p.categoria.activo &&
        (producto_centro[0]?.disponible ?? true),
    }));
  }

  guardarProducto(id: number | null, datos: ReturnType<typeof producto>) {
    return id === null
      ? this.prisma.producto.create({
          data: {
            ...datos,
            sku: datos.sku!,
            nombre: datos.nombre!,
            categoria_id: datos.categoria_id!,
            precio_base: datos.precio_base!,
          },
        })
      : this.prisma.producto.update({ where: { id }, data: datos });
  }

  guardarCentro(
    productoId: number,
    centroId: number,
    datos: ReturnType<typeof productoCentro>,
  ) {
    return this.prisma.producto_centro.upsert({
      where: {
        producto_id_centro_venta_id: {
          producto_id: productoId,
          centro_venta_id: centroId,
        },
      },
      create: { producto_id: productoId, centro_venta_id: centroId, ...datos },
      update: datos,
    });
  }

  async precios(centro: number, usuario: number, cuerpo: unknown) {
    const c = objeto(cuerpo);
    if (
      !['base', 'centro'].includes(String(c.alcance)) ||
      !Array.isArray(c.precios) ||
      !c.precios.length ||
      c.precios.length > 200
    )
      throw new BadRequestException(
        'Elige hasta 200 productos y el alcance del cambio de precios.',
      );
    const lista = c.precios
      .map((v) => {
        const p = objeto(v);
        if (!Number.isSafeInteger(p.producto_id) || Number(p.producto_id) < 1)
          throw new BadRequestException('Un producto no es válido.');
        return {
          id: Number(p.producto_id),
          anterior: p.anterior === null ? null : precio(p.anterior),
          nuevo: precio(p.nuevo),
        };
      })
      .sort((a, b) => a.id - b.id);
    if (new Set(lista.map((p) => p.id)).size !== lista.length)
      throw new BadRequestException(
        'No repitas productos en el cambio de precios.',
      );
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT set_config('app.usuario_id',${String(usuario)},true)`;
        for (const p of lista) {
          await tx.$queryRaw`SELECT id FROM ventas.producto WHERE id=${p.id} FOR UPDATE`;
          const producto = await tx.producto.findUniqueOrThrow({
            where: { id: p.id },
            include: {
              producto_centro: { where: { centro_venta_id: centro } },
            },
          });
          const anterior =
            c.alcance === 'base'
              ? producto.precio_base
              : (producto.producto_centro[0]?.precio ?? null);
          if (
            (anterior === null) !== (p.anterior === null) ||
            (anterior !== null &&
              p.anterior !== null &&
              !anterior.equals(p.anterior))
          )
            throw new ConflictException(
              'Un precio cambió mientras revisabas. Actualiza la vista previa antes de aplicar.',
            );
          if (c.alcance === 'base')
            await tx.producto.update({
              where: { id: p.id },
              data: { precio_base: p.nuevo },
            });
          else
            await tx.producto_centro.upsert({
              where: {
                producto_id_centro_venta_id: {
                  producto_id: p.id,
                  centro_venta_id: centro,
                },
              },
              create: {
                producto_id: p.id,
                centro_venta_id: centro,
                precio: p.nuevo,
              },
              update: { precio: p.nuevo },
            });
          await tx.auditoria.create({
            data: {
              tabla: 'producto',
              registro_id: String(p.id),
              accion: 'UPDATE',
              usuario_id: usuario,
              antes: {
                precio: anterior?.toFixed(2) ?? null,
                alcance: String(c.alcance),
                centro,
              },
              despues: {
                precio: new Prisma.Decimal(p.nuevo).toFixed(2),
                alcance: String(c.alcance),
                centro,
              },
            },
          });
        }
        return {
          mensaje: `Precios actualizados: ${lista.length}.`,
          cantidad: lista.length,
        };
      },
      { timeout: 15000 },
    );
  }
}
