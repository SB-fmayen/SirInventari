export function hoyGuatemala() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guatemala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const dato = (tipo: string) =>
    partes.find((p) => p.type === tipo)?.value ?? ''
  return `${dato('year')}-${dato('month')}-${dato('day')}`
}
export function rangoRapido(tipo: string, hoy = hoyGuatemala()) {
  const fin = new Date(`${hoy}T00:00:00Z`),
    inicio = new Date(fin)
  if (tipo === 'ayer') {
    inicio.setUTCDate(inicio.getUTCDate() - 1)
    fin.setUTCDate(fin.getUTCDate() - 1)
  }
  if (tipo === 'semana')
    inicio.setUTCDate(inicio.getUTCDate() - ((inicio.getUTCDay() + 6) % 7))
  if (tipo === 'mes') inicio.setUTCDate(1)
  return {
    desde: inicio.toISOString().slice(0, 10),
    hasta: fin.toISOString().slice(0, 10),
  }
}
