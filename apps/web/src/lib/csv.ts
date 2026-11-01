/** CSV para Excel: escapa comillas y trata como texto las celdas que podrían ser fórmulas. */
export function convertirCsv(filas: (string | number)[][]): string {
  return filas.map((fila) => fila.map((valor) => {
    let texto = String(valor)
    if (/^\s*[=+\-@]|^[\t\r\n]/.test(texto)) texto = `'${texto}`
    return `"${texto.replaceAll('"', '""')}"`
  }).join(',')).join('\r\n')
}
