import { useState } from 'react'
import { createPortal } from 'react-dom'

export interface DatosTicket {
  centro: { nombre: string }
  pedido: {
    id: string; folio: number; fecha_operacion: string; estado: string
    subtotal?: string; descuento?: string; total: string; pagado: string; saldo: string
    creado_en?: string; cliente_nombre: string | null; mesa_referencia: string | null
    tipo_venta?: { nombre: string }; usuario?: { nombre: string }; motivo_cortesia?: string | null
    pedido_detalle: { id: string; cantidad: string; importe: string; precio_unitario?: string; estado: string; notas?: string | null; producto: { nombre: string } }[]
  }
  pagos: { id: string; monto: string; estado: string; registrado_en?: string; terminal_pos: string | null; referencia_pos: string | null; metodo_pago: { nombre: string } }[]
}
const dinero = (valor: string | number) => `Q ${Number(valor).toFixed(2)}`
const formatos = {
  auto: { nombre: 'Automático / papel de la impresora', ancho: '80mm', papel: 'auto', margen: '0' },
  '58': { nombre: 'Recibo de 58 mm', ancho: '58mm', papel: 'auto', margen: '0' },
  '80': { nombre: 'Recibo de 80 mm', ancho: '80mm', papel: 'auto', margen: '0' },
  carta: { nombre: 'Hoja Carta (recibo compacto)', ancho: '80mm', papel: 'letter', margen: '8mm' },
  a4: { nombre: 'Hoja A4 (recibo compacto)', ancho: '80mm', papel: 'A4', margen: '8mm' },
} as const
type Formato = keyof typeof formatos
const claveFormato = 'sirinventari.formato-recibo'
function leerFormato(): Formato {
  try {
    const valor = localStorage.getItem(claveFormato)
    return valor && Object.hasOwn(formatos, valor) ? valor as Formato : 'auto'
  } catch { return 'auto' }
}

export function TicketVenta({ datos, efectivo }: { datos: DatosTicket; efectivo?: { recibido: string; vuelto: string } | null }) {
  const [formato, establecerFormato] = useState<Formato>(leerFormato)
  const configuracion = formatos[formato]
  const { pedido, centro, pagos } = datos
  const aplicados = pagos.filter(p => p.estado === 'APLICADO')
  const fechaHora = aplicados.at(-1)?.registrado_en ?? pedido.creado_en
  const contenido = <article className="ticket-venta" aria-label="Ticket de venta">
    <header className="ticket-cabecera"><div><p className="ticket-marca">Shukos y pizza la iguana</p><p>{centro.nombre}</p><p>COMPROBANTE DE VENTA</p></div><div className="ticket-folio"><span>PEDIDO</span><strong>{String(pedido.folio).padStart(4, '0')}</strong><span>PAGADO</span></div></header>
    <div className="ticket-datos"><p><strong>Fecha de operación:</strong> {pedido.fecha_operacion.split('-').reverse().join('/')}</p>{fechaHora && <p><strong>Fecha y hora:</strong> {new Date(fechaHora).toLocaleString('es-GT', { timeZone: 'America/Guatemala', dateStyle: 'short', timeStyle: 'short' })}</p>}<p><strong>Cliente:</strong> {pedido.cliente_nombre || pedido.mesa_referencia || 'Cliente de mostrador'}</p>{pedido.tipo_venta && <p><strong>Entrega:</strong> {pedido.tipo_venta.nombre}</p>}{pedido.usuario && <p><strong>Pedido tomado por:</strong> {pedido.usuario.nombre}</p>}</div>
    <table><thead><tr><th className="ticket-cantidad">Cant.</th><th>Producto</th><th className="ticket-numero">Importe</th></tr></thead><tbody>{pedido.pedido_detalle.filter(l => l.estado === 'ACTIVA').map(l => <tr key={l.id}><td>{Number(l.cantidad)}</td><td>{l.producto.nombre}{l.precio_unitario !== undefined && <small>{dinero(l.precio_unitario)} c/u</small>}{l.notas && <small>{l.notas}</small>}</td><td className="ticket-numero">{dinero(l.importe)}</td></tr>)}</tbody></table>
    <div className="ticket-totales">{pedido.subtotal !== undefined && <p><span>Subtotal</span><span>{dinero(pedido.subtotal)}</span></p>}{Number(pedido.descuento) > 0 && <p><span>Descuento{pedido.motivo_cortesia ? ' por cortesía' : ''}</span><span>− {dinero(pedido.descuento!)}</span></p>}<p className="ticket-total"><strong>TOTAL</strong><strong>{dinero(pedido.total)}</strong></p><p><span>Pagado</span><span>{dinero(pedido.pagado)}</span></p><p><span>Saldo pendiente</span><span>{dinero(pedido.saldo)}</span></p></div>
    <section className="ticket-pagos"><h3>Forma de pago</h3>{aplicados.map(p => <p key={p.id}><span>{p.metodo_pago.nombre}{p.referencia_pos && <small>Autorización / referencia: {p.referencia_pos}{p.terminal_pos && ` · Terminal: ${p.terminal_pos}`}</small>}</span><strong>{dinero(p.monto)}</strong></p>)}{pedido.motivo_cortesia && <p>Cortesía autorizada · Sin cobro</p>}{efectivo && <div className="ticket-efectivo"><p><span>Recibido en el último pago en efectivo</span><span>{dinero(efectivo.recibido)}</span></p><p><span>Vuelto de ese pago</span><strong>{dinero(efectivo.vuelto)}</strong></p></div>}</section>
    <footer><strong>¡Gracias por tu compra!</strong><p>Conserva este ticket como comprobante de tu pedido.</p><p className="ticket-referencia">Referencia: {pedido.id}</p><p>Comprobante interno de venta. No sustituye una factura.</p></footer>
  </article>
  return <><div className="configuracion-recibo"><label>Formato del recibo <select value={formato} onChange={e => {
    const valor = e.target.value as Formato
    establecerFormato(valor)
    try { localStorage.setItem(claveFormato, valor) } catch { /* Se conserva la selección durante esta sesión. */ }
  }}>{Object.entries(formatos).map(([valor, opcion]) => <option key={valor} value={valor}>{opcion.nombre}</option>)}</select></label><p>Compatible con la impresión del navegador. Selecciona tu impresora y el mismo papel al imprimir; usa escala 100 % y desactiva encabezados y pies de página. La selección se recuerda en este navegador si permite guardar preferencias.</p></div><style>{`.ticket-venta { width: ${configuracion.ancho}; } @media print { @page { size: ${configuracion.papel}; margin: ${configuracion.margen}; } .impresion-ticket .ticket-venta { width: ${configuracion.ancho}; } }`}</style>{contenido}{createPortal(<div className="impresion-ticket" aria-hidden="true">{contenido}</div>, document.body)}</>
}
