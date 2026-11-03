import { BadRequestException } from '@nestjs/common';

export function objeto(cuerpo: unknown): Record<string, unknown> {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
    throw new BadRequestException('Faltan los datos del catálogo.');
  }
  return cuerpo as Record<string, unknown>;
}

export function texto(valor: unknown, campo: string, limite: number): string {
  if (typeof valor !== 'string' || !valor.trim() || valor.trim().length > limite) {
    throw new BadRequestException(`Escribe ${campo} de entre 1 y ${limite} caracteres.`);
  }
  return valor.trim();
}

export function entero(valor: unknown, campo: string, minimo: number, maximo = 2147483647): number {
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < minimo || valor > maximo) {
    throw new BadRequestException(`El valor de ${campo} no es válido.`);
  }
  return valor;
}

export function booleano(valor: unknown): boolean {
  if (typeof valor !== 'boolean') throw new BadRequestException('Indica si queda activo o disponible.');
  return valor;
}

export function precio(valor: unknown): string {
  if ((typeof valor !== 'string' && typeof valor !== 'number') || !/^\d{1,8}(\.\d{1,2})?$/.test(String(valor))) {
    throw new BadRequestException('El precio debe ser un número de 0 a 99999999.99, con hasta dos decimales.');
  }
  return String(valor);
}

export function categoria(cuerpo: unknown, nuevo: boolean) {
  const c = objeto(cuerpo);
  const datos = {
    ...(nuevo || c.nombre !== undefined ? { nombre: texto(c.nombre, 'el nombre', 60) } : {}),
    ...(c.orden !== undefined ? { orden: entero(c.orden, 'orden', -32768, 32767) } : {}),
    ...(c.activo !== undefined ? { activo: booleano(c.activo) } : {}),
  };
  if (!Object.keys(datos).length) throw new BadRequestException('No hay cambios para guardar.');
  return datos;
}

export function producto(cuerpo: unknown, nuevo: boolean) {
  const c = objeto(cuerpo);
  if (c.foto_datos !== undefined && c.foto_datos !== null) {
    if (typeof c.foto_datos !== 'string' || c.foto_datos.length > 280000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(c.foto_datos)) throw new BadRequestException('La foto debe ser PNG, JPEG o WebP y pesar hasta 200 KB.');
    const bin = Buffer.from(c.foto_datos.split(',')[1], 'base64');
    if (bin.length > 204800 || !(bin.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || bin.subarray(0,3).equals(Buffer.from([255,216,255])) || bin.subarray(0,4).toString()==='RIFF' && bin.subarray(8,12).toString()==='WEBP')) throw new BadRequestException('El archivo no es una foto válida o supera 200 KB.');
  }
  const datos = {
    ...(nuevo || c.sku !== undefined ? { sku: texto(c.sku, 'el SKU', 30) } : {}),
    ...(nuevo || c.nombre !== undefined ? { nombre: texto(c.nombre, 'el nombre', 120) } : {}),
    ...(nuevo || c.categoria_id !== undefined ? { categoria_id: entero(c.categoria_id, 'categoría', 1) } : {}),
    ...(nuevo || c.precio_base !== undefined ? { precio_base: precio(c.precio_base) } : {}),
    ...(c.grupo_variantes !== undefined ? { grupo_variantes: c.grupo_variantes === null || c.grupo_variantes === '' ? null : texto(c.grupo_variantes, 'el grupo de variantes', 120) } : {}),
    ...(c.es_complemento !== undefined ? { es_complemento: booleano(c.es_complemento) } : {}),
    ...(c.foto_datos !== undefined ? { foto_datos: c.foto_datos as string | null } : {}),
    ...(c.activo !== undefined ? { activo: booleano(c.activo) } : {}),
  };
  if (!Object.keys(datos).length) throw new BadRequestException('No hay cambios para guardar.');
  return datos;
}

export function productoCentro(cuerpo: unknown) {
  const c = objeto(cuerpo);
  const datos = {
    ...(c.precio !== undefined ? { precio: c.precio === null ? null : precio(c.precio) } : {}),
    ...(c.disponible !== undefined ? { disponible: booleano(c.disponible) } : {}),
  };
  if (!Object.keys(datos).length) throw new BadRequestException('No hay cambios para guardar.');
  return datos;
}
