function centesimas(valor: string): bigint {
  if (!/^\d+(\.\d{0,2})?$/.test(valor)) return 0n
  const [entero, fraccion = ''] = valor.split('.')
  return BigInt(entero) * 100n + BigInt(fraccion.padEnd(2, '0'))
}

/** PostgreSQL redondea cada línea a centavos antes de sumar el pedido. */
export function totalLineas(lineas: { cantidad: string; precio: string }[]): string {
  const total = lineas.reduce((suma, l) => suma + (centesimas(l.cantidad) * centesimas(l.precio) + 50n) / 100n, 0n)
  return `${total / 100n}.${String(total % 100n).padStart(2, '0')}`
}
