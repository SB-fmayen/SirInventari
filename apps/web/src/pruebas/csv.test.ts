import { describe, expect, it } from 'vitest'
import { convertirCsv } from '@/lib/csv'
describe('Descarga CSV', () => {
  it('conserva comas, comillas, saltos de línea y cantidades', () => {
    expect(convertirCsv([['Nombre', 'Total'], ['Plato, "grande"\ncon bebida', '45.01']])).toBe('"Nombre","Total"\r\n"Plato, ""grande""\ncon bebida","45.01"')
  })
  it('evita que los nombres se abran como fórmulas en una hoja de cálculo', () => {
    for (const nombre of ['=1+1', '+SUM(1)', '-1+2', '@SUM(1)', '  =1', '\t=1']) {
      expect(convertirCsv([[nombre]])).toBe(`"'${nombre}"`)
    }
  })
})
