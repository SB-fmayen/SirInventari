import { SECCIONES } from '@/secciones'
import { NOMBRE_ROL, type Rol } from '@/sesion/tipos'

const roles: Rol[] = ['ADMIN', 'GERENTE', 'CAJERO', 'MESERO', 'COCINA']

/** Usa el mismo mapa del menú para evitar mostrar permisos distintos a los de la app. */
export function PermisosRoles() {
  return <details className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
    <summary className="min-h-11 cursor-pointer text-lg font-semibold text-slate-900">Ver accesos de cada rol</summary>
    <p className="mb-4 text-sm text-slate-600">Cada persona trabaja en sus centros asignados. El administrador tiene acceso a todos los centros activos.</p>
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Acceso de los cinco roles a cada módulo</caption>
        <thead><tr><th scope="col" className="p-3">Módulo</th>{roles.map((r) => <th scope="col" className="p-3" key={r}>{NOMBRE_ROL[r]}</th>)}</tr></thead>
        <tbody>{SECCIONES.map((s) => <tr className="border-t border-slate-100" key={s.ruta}><th scope="row" className="p-3 font-medium">{s.ruta === '/pedidos' ? 'Ventas: pedidos' : s.ruta === '/caja' ? 'Ventas: cobros' : s.nombre}</th>{roles.map((r) => <td className={`p-3 ${s.roles.includes(r) ? 'font-semibold text-teal-800' : 'text-slate-500'}`} key={r}>{s.roles.includes(r) ? 'Sí' : 'Sin acceso'}</td>)}</tr>)}</tbody>
      </table>
    </div>
    <p className="mt-4 text-sm text-slate-600">Ventas reúne pedidos y cobros en una pantalla de mostrador. El mesero puede tomar pedidos; administrador, gerente y cajero también pueden cobrar. Turnos permite abrir, cerrar y consultar turnos. Cocina cambia la preparación sin modificar los cobros. Catálogo permite editar y desactivar productos y categorías. Reportes permite consultar ventas, historial y descargar CSV. Solo el administrador gestiona usuarios, roles y centros asignados.</p>
  </details>
}
