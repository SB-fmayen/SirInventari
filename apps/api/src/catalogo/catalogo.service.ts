import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { categoria, producto, productoCentro } from './validacion-catalogo.js';

@Injectable()
export class CatalogoService {
  constructor(private readonly prisma: PrismaService) {}

  categorias() {
    return this.prisma.categoria.findMany({ orderBy: [{ orden: 'asc' }, { nombre: 'asc' }, { id: 'asc' }] });
  }

  guardarCategoria(id: number | null, datos: ReturnType<typeof categoria>) {
    return id === null
      ? this.prisma.categoria.create({ data: { ...datos, nombre: datos.nombre! } })
      : this.prisma.categoria.update({ where: { id }, data: datos });
  }

  async productos(centroId: number, buscar: string, categoriaId?: number) {
    const filas = await this.prisma.producto.findMany({
      where: {
        ...(categoriaId ? { categoria_id: categoriaId } : {}),
        ...(buscar ? { OR: [{ nombre: { contains: buscar, mode: 'insensitive' as const } }, { sku: { contains: buscar, mode: 'insensitive' as const } }] } : {}),
      },
      include: { categoria: true, producto_centro: { where: { centro_venta_id: centroId } } },
      orderBy: [{ categoria: { orden: 'asc' } }, { nombre: 'asc' }, { id: 'asc' }],
    });
    return filas.map(({ producto_centro, ...p }) => ({
      ...p,
      precio_centro: producto_centro[0]?.precio ?? null,
      precio: producto_centro[0]?.precio ?? p.precio_base,
      disponible: producto_centro[0]?.disponible ?? true,
      disponible_venta: p.activo && p.categoria.activo && (producto_centro[0]?.disponible ?? true),
    }));
  }

  guardarProducto(id: number | null, datos: ReturnType<typeof producto>) {
    return id === null
      ? this.prisma.producto.create({ data: {
        ...datos, sku: datos.sku!, nombre: datos.nombre!, categoria_id: datos.categoria_id!, precio_base: datos.precio_base!,
      } })
      : this.prisma.producto.update({ where: { id }, data: datos });
  }

  guardarCentro(productoId: number, centroId: number, datos: ReturnType<typeof productoCentro>) {
    return this.prisma.producto_centro.upsert({
      where: { producto_id_centro_venta_id: { producto_id: productoId, centro_venta_id: centroId } },
      create: { producto_id: productoId, centro_venta_id: centroId, ...datos },
      update: datos,
    });
  }
}
