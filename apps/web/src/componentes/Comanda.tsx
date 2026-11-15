import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Tarea 19 · Comanda y comprobante para impresora térmica (58 u 80 mm).
 * Usa la impresión del navegador: funciona con cualquier impresora instalada en el equipo
 * (USB o Bluetooth emparejada), con o sin internet. El folio provisional sale grande.
 */
export interface DatosComanda {
  folio: string            // definitivo ("12") o provisional ("CAJA1-0001")
  provisional: boolean
  tipo: string
  cliente: string
  hora: string             // ISO
  lineas: { nombre: string; cantidad: string; notas?: string | null; importe?: string }[]
  total?: string
  pago?: { metodo: string; monto: string; vuelto?: number; referencia?: string }
  centro?: string
}
const dinero = (v: string | number) => `Q ${Number(v).toFixed(2)}`
const hora = (v: string) => new Date(v).toLocaleString('es-GT', { timeZone: 'America/Guatemala', dateStyle: 'short', timeStyle: 'short' })

export function HojaComanda({ datos, modo }: { datos: DatosComanda; modo: 'comanda' | 'comprobante' }) {
  return <article className="ticket-venta comanda" aria-label={modo === 'comanda' ? 'Comanda para cocina' : 'Comprobante sin internet'}>
    <p className="comanda-titulo">{modo === 'comanda' ? 'COMANDA · COCINA' : 'COMPROBANTE DE VENTA'}</p>
    {datos.centro && <p className="comanda-centro">{datos.centro}</p>}
    <p className="comanda-folio">{datos.provisional ? 'FOLIO PROVISIONAL' : 'PEDIDO'}<strong>{datos.folio}</strong></p>
    {datos.provisional && <p className="comanda-aviso">Venta sin internet · el folio definitivo se asigna al sincronizar</p>}
    <p><strong>{datos.tipo}</strong> · {datos.cliente}</p>
    <p>{hora(datos.hora)}</p>
    <ul className="comanda-lineas">{datos.lineas.map((l, i) => <li key={i}><span className="comanda-cantidad">{Number(l.cantidad)} ×</span> <span>{l.nombre}{l.notas && <small>→ {l.notas}</small>}</span>{modo === 'comprobante' && l.importe && <span className="comanda-importe">{dinero(l.importe)}</span>}</li>)}</ul>
    {modo === 'comprobante' && datos.total && <p className="comanda-total"><strong>TOTAL</strong><strong>{dinero(datos.total)}</strong></p>}
    {modo === 'comprobante' && datos.pago && <p>{datos.pago.metodo}: {dinero(datos.pago.monto)}{datos.pago.referencia && ` · Aut. ${datos.pago.referencia}`}{datos.pago.vuelto ? ` · Vuelto ${dinero(datos.pago.vuelto)}` : ''}</p>}
    {modo === 'comprobante' && <footer><strong>¡Gracias por tu compra!</strong><p>Comprobante interno de venta. No sustituye una factura.</p></footer>}
  </article>
}

/** Botón que imprime la comanda o el comprobante en la impresora del equipo. */
export function BotonImprimir({ datos, modo, etiqueta }: { datos: DatosComanda; modo: 'comanda' | 'comprobante'; etiqueta?: string }) {
  const [imprimiendo, setImprimiendo] = useState(false)
  useEffect(() => {
    if (!imprimiendo) return
    const terminar = () => setImprimiendo(false)
    window.addEventListener('afterprint', terminar)
    const t = window.setTimeout(() => { try { window.print() } catch { /* sin diálogo de impresión */ } }, 50)
    const respaldo = window.setTimeout(terminar, 60000)
    return () => { window.removeEventListener('afterprint', terminar); window.clearTimeout(t); window.clearTimeout(respaldo) }
  }, [imprimiendo])
  return <>
    <button type="button" className="min-h-12 rounded-xl bg-slate-800 px-4 font-semibold text-white" onClick={() => setImprimiendo(true)}>{etiqueta ?? (modo === 'comanda' ? '🖨 Imprimir comanda' : '🖨 Imprimir comprobante')}</button>
    {imprimiendo && createPortal(<div className="impresion-ticket"><HojaComanda datos={datos} modo={modo} /></div>, document.body)}
  </>
}
