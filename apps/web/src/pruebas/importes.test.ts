import { describe, expect, it } from 'vitest'
import { totalLineas } from '@/lib/importes'
describe('Total del borrador', () => {
  it('redondea cada línea igual que la base, antes de sumarlas', () => {
    expect(totalLineas(Array.from({ length: 3 }, () => ({ cantidad: '0.50', precio: '0.01' })))).toBe('0.03')
    expect(totalLineas([{ cantidad: '2.50', precio: '18.75' }, { cantidad: '1', precio: '0' }])).toBe('46.88')
  })
  it('mantiene los centavos exactos para cantidades grandes', () => {
    expect(totalLineas([{ cantidad: '999999.99', precio: '99999999.99' }])).toBe('99999998990000.00')
    expect(totalLineas([])).toBe('0.00')
  })
})
