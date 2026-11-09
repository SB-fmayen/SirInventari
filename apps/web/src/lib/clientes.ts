export const botonCliente =
  "min-h-12 rounded-xl bg-teal-700 px-4 font-semibold text-white disabled:opacity-50";
export const secundarioCliente =
  "min-h-12 rounded-xl border border-slate-300 bg-white px-4 font-semibold text-slate-700 disabled:opacity-50";
export const campoCliente =
  "min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base";
export const fechaCliente = (v: string) =>
  new Date(v).toLocaleString("es-GT", {
    timeZone: "America/Guatemala",
    dateStyle: "short",
    timeStyle: "short",
  });
export const errorCliente = (e: unknown) =>
  e instanceof Error
    ? e.message
    : "No se pudo completar la operación. Intenta de nuevo.";
export interface Cliente {
  id: string;
  nombre: string;
  telefono: string;
  direccion: string | null;
  version: number;
  eliminado_en: string | null;
  motivo_eliminacion?: string | null;
  usuario_cliente_eliminado_porTousuario?: { nombre: string } | null;
}
export interface PaginaClientes<T> {
  registros: T[];
  total: number;
  pagina: number;
}
export function permisoClientes(
  usuario: {
    rol: string;
    permisos?: { modulo: string; accion: string; permitido: boolean }[];
  } | null,
  modulo: string,
  accion = "ver",
) {
  return (
    !!usuario &&
    (usuario.rol === "ADMIN" ||
      !usuario.permisos?.some(
        (p) =>
          p.modulo === modulo &&
          ["ver", accion].includes(p.accion) &&
          !p.permitido,
      ))
  );
}
