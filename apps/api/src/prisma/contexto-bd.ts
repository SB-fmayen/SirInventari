import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';

/**
 * Tarea 16: datos del usuario de la petición actual para la base de datos.
 * Mientras exista este contexto, cada conexión que pide la API:
 *  · cambia al rol limitado ventas_api (Row Level Security por centro),
 *  · indica app.usuario_id (auditoría) y app.centros (centros autorizados).
 * Fuera de una petición (scripts, arranque, tiempo real) se usa el usuario normal.
 */
export interface ContextoBd { usuarioId?: number; centros: number[] }
export const contextoBd = new AsyncLocalStorage<ContextoBd>();

export function sqlContexto(c = contextoBd.getStore()): string {
  if (!c) return "RESET ROLE; SELECT set_config('app.usuario_id', '', false), set_config('app.centros', '', false)";
  const usuario = Number.isSafeInteger(c.usuarioId) ? String(c.usuarioId) : '';
  const centros = c.centros.filter((n) => Number.isSafeInteger(n) && n > 0).join(',');
  return `SET ROLE ventas_api; SELECT set_config('app.usuario_id', '${usuario}', false), set_config('app.centros', '${centros}', false)`;
}

type Callback = (err: Error | undefined, client: pg.PoolClient | undefined, done: (release?: unknown) => void) => void;

/** Pool de pg que prepara cada conexión con el contexto de la petición que la pide. */
export class PoolConContexto extends pg.Pool {
  override connect(): Promise<pg.PoolClient>;
  override connect(callback: Callback): void;
  override connect(callback?: Callback): Promise<pg.PoolClient> | void {
    if (callback) return super.connect(callback);
    const sql = sqlContexto(); // se lee aquí, todavía dentro de la petición
    return super.connect().then(async (cliente) => {
      try { await cliente.query(sql); } catch (error) { cliente.release(true); throw error; }
      return cliente;
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override query(...args: any[]): any {
    if (typeof args[args.length - 1] === 'function') return (super.query as (...a: unknown[]) => unknown)(...args);
    const sql = sqlContexto();
    return super.connect().then(async (cliente) => {
      let roto = false;
      try {
        await cliente.query(sql);
        return await (cliente.query as (...a: unknown[]) => Promise<unknown>)(...args);
      } catch (error) { roto = !(error instanceof Error && 'code' in error); throw error; }
      finally { cliente.release(roto); }
    });
  }
}
