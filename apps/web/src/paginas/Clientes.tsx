import { useEffect, useState } from "react";
import { useSesion } from "@/sesion/SesionProvider";
import {
  botonCliente as boton,
  secundarioCliente as secundario,
  campoCliente as campo,
  fechaCliente,
  errorCliente,
  permisoClientes,
  type Cliente,
  type PaginaClientes,
} from "@/lib/clientes";
import {
  VentanaClientes,
  EditorCliente,
  MovimientoPapelera,
  DetallePedidoCliente,
  PaginacionClientes,
} from "@/componentes/ClientesCompartidos";

interface PedidoCliente {
  id: string;
  folio: number;
  fecha_operacion: string;
  estado: string;
  total: string;
  eliminado_en: string | null;
  creado_en: string;
}
interface CambioCliente {
  id: string;
  campo: string;
  valor_anterior: string | null;
  valor_nuevo: string | null;
  operacion: string;
  fecha: string;
  usuario: { nombre: string };
}
export function FichaCliente({
  cliente,
  cerrar,
}: {
  cliente: Cliente;
  cerrar: () => void;
}) {
  const { api, estado } = useSesion();
  const u = estado.tipo === "activa" ? estado.usuario : null;
  const verCambios =
    !!u &&
    ["ADMIN", "GERENTE"].includes(u.rol) &&
    permisoClientes(u, "clientes");
  const verPedidos =
    permisoClientes(u, "pedidos") && permisoClientes(u, "caja");
  const [pedidos, setPedidos] = useState<PaginaClientes<PedidoCliente>>({
      registros: [],
      total: 0,
      pagina: 0,
    }),
    [cambios, setCambios] = useState<PaginaClientes<CambioCliente>>({
      registros: [],
      total: 0,
      pagina: 0,
    });
  const [paginaPedidos, setPaginaPedidos] = useState(0),
    [paginaCambios, setPaginaCambios] = useState(0),
    [detalle, setDetalle] = useState<string | null>(null),
    [error, setError] = useState(""),
    [cargando, setCargando] = useState(true);
  useEffect(() => {
    let vigente = true;
    void Promise.all([
      verPedidos
        ? api<PaginaClientes<PedidoCliente>>(
            `/clientes/${cliente.id}/pedidos?pagina=${paginaPedidos}`,
          )
        : Promise.resolve({ registros: [], total: 0, pagina: 0 }),
      verCambios
        ? api<PaginaClientes<CambioCliente>>(
            `/clientes/${cliente.id}/cambios?pagina=${paginaCambios}`,
          )
        : Promise.resolve({ registros: [], total: 0, pagina: 0 }),
    ])
      .then(([p, c]) => {
        if (vigente) {
          setPedidos(p);
          setCambios(c);
        }
      })
      .catch((e) => {
        if (vigente) setError(errorCliente(e));
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [api, cliente.id, paginaPedidos, paginaCambios, verCambios, verPedidos]);
  const nombres: Record<string, string> = {
    nombre: "Nombre",
    telefono: "Teléfono",
    direccion: "Dirección",
    eliminado_en: "En papelera desde",
    motivo_eliminacion: "Motivo de eliminación",
  };
  return (
    <VentanaClientes titulo={`Cliente: ${cliente.nombre}`} cerrar={cerrar}>
      <dl>
        <dt className="font-bold">Nombre</dt>
        <dd>{cliente.nombre}</dd>
        <dt className="font-bold">Teléfono</dt>
        <dd>{cliente.telefono}</dd>
        <dt className="font-bold">Dirección</dt>
        <dd>{cliente.direccion || "Sin dirección registrada"}</dd>
      </dl>
      {cliente.eliminado_en && (
        <p className="rounded-xl bg-amber-50 p-3">
          En papelera desde {fechaCliente(cliente.eliminado_en)}. Motivo:{" "}
          {cliente.motivo_eliminacion}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {cargando && <p>Cargando historial…</p>}
      <section className="space-y-3">
        <h3 className="text-xl font-bold">Historial de pedidos</h3>
        {!verPedidos && <p>No tienes acceso al historial comercial.</p>}
        {verPedidos && (
          <>
            <ul className="space-y-2">
              {pedidos.registros.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
                >
                  <span>
                    Pedido {p.folio} · {p.fecha_operacion.slice(0, 10)}
                    <br />
                    {fechaCliente(p.creado_en)} · {p.estado} · Q{" "}
                    {Number(p.total).toFixed(2)}
                    {p.eliminado_en && (
                      <strong className="block text-amber-800">
                        En papelera
                      </strong>
                    )}
                  </span>
                  <button
                    className={secundario}
                    onClick={() => setDetalle(p.id)}
                  >
                    Ver detalles del pedido {p.folio}
                  </button>
                </li>
              ))}
            </ul>
            {!cargando && !pedidos.total && (
              <p>Este cliente aún no tiene pedidos.</p>
            )}
            <PaginacionClientes
              pagina={paginaPedidos}
              total={pedidos.total}
              cambiar={setPaginaPedidos}
            />
          </>
        )}
      </section>
      {verCambios && (
        <section className="space-y-3">
          <h3 className="text-xl font-bold">Historial de cambios por campo</h3>
          <p>Fechas y horas de Guatemala.</p>
          <ul className="space-y-2">
            {cambios.registros.map((c) => (
              <li key={c.id} className="rounded-xl border p-3">
                <strong>{nombres[c.campo] ?? c.campo}</strong> · {c.operacion}
                <p>
                  Antes:{" "}
                  {c.campo === "eliminado_en" && c.valor_anterior
                    ? fechaCliente(c.valor_anterior)
                    : c.valor_anterior || "Sin dato"}
                </p>
                <p>
                  Después:{" "}
                  {c.campo === "eliminado_en" && c.valor_nuevo
                    ? fechaCliente(c.valor_nuevo)
                    : c.valor_nuevo || "Sin dato"}
                </p>
                <p className="text-sm text-slate-600">
                  {c.usuario.nombre} · {fechaCliente(c.fecha)}
                </p>
              </li>
            ))}
          </ul>
          <PaginacionClientes
            pagina={paginaCambios}
            total={cambios.total}
            cambiar={setPaginaCambios}
          />
        </section>
      )}
      {detalle && (
        <DetallePedidoCliente id={detalle} cerrar={() => setDetalle(null)} />
      )}
    </VentanaClientes>
  );
}
export function Clientes() {
  const { api, estado, centro } = useSesion();
  const u = estado.tipo === "activa" ? estado.usuario : null;
  const [buscar, setBuscar] = useState(""),
    [consulta, setConsulta] = useState(""),
    [pagina, setPagina] = useState(0),
    [revision, setRevision] = useState(0);
  const [datos, setDatos] = useState<PaginaClientes<Cliente>>({
      registros: [],
      total: 0,
      pagina: 0,
    }),
    [error, setError] = useState(""),
    [cargando, setCargando] = useState(true);
  const [editor, setEditor] = useState<Cliente | "nuevo" | null>(null),
    [ficha, setFicha] = useState<Cliente | null>(null),
    [eliminar, setEliminar] = useState<Cliente | null>(null),
    [aviso, setAviso] = useState("");
  const puedeEliminar =
    !!u &&
    ["ADMIN", "GERENTE"].includes(u.rol) &&
    permisoClientes(u, "clientes", "anular") &&
    permisoClientes(u, "papelera", "anular");
  useEffect(() => {
    let vigente = true;
    void api<PaginaClientes<Cliente>>(
      `/clientes?buscar=${encodeURIComponent(consulta)}&pagina=${pagina}`,
    )
      .then((d) => {
        if (vigente) setDatos(d);
      })
      .catch((e) => {
        if (vigente) setError(errorCliente(e));
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [api, consulta, pagina, revision]);
  function actualizar() {
    setError("");
    setCargando(true);
    setRevision((r) => r + 1);
  }
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Clientes</h1>
          <p>{centro?.nombre} · Datos de contacto e historial de pedidos.</p>
        </div>
        {permisoClientes(u, "clientes", "crear") && (
          <button className={boton} onClick={() => setEditor("nuevo")}>
            Agregar cliente
          </button>
        )}
      </div>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setConsulta(buscar.trim());
          setPagina(0);
          actualizar();
        }}
      >
        <label className="flex-1">
          Buscar por nombre o teléfono
          <input
            type="search"
            className={campo}
            maxLength={100}
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
          />
        </label>
        <button className={boton}>Buscar</button>
        <button type="button" className={secundario} onClick={actualizar}>
          Actualizar
        </button>
      </form>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">
          {error}
        </p>
      )}
      {aviso && <p role="status">{aviso}</p>}
      {cargando ? (
        <p>Cargando clientes…</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border bg-white">
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th className="p-3">Nombre</th>
                  <th className="p-3">Teléfono</th>
                  <th className="p-3">Dirección</th>
                  <th className="p-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {datos.registros.map((c) => (
                  <tr className="border-t" key={c.id}>
                    <td className="p-3 font-semibold">{c.nombre}</td>
                    <td className="p-3">{c.telefono}</td>
                    <td className="p-3">{c.direccion || "Sin dirección"}</td>
                    <td className="flex flex-wrap gap-2 p-3">
                      <button
                        className={secundario}
                        onClick={() => setFicha(c)}
                        aria-label={`Ver detalles de ${c.nombre}`}
                      >
                        Ver detalles
                      </button>
                      {permisoClientes(u, "clientes", "editar") && (
                        <button
                          className={secundario}
                          onClick={() => setEditor(c)}
                          aria-label={`Editar ${c.nombre}`}
                        >
                          Editar
                        </button>
                      )}
                      {puedeEliminar && (
                        <button
                          className={secundario}
                          onClick={() => setEliminar(c)}
                          aria-label={`Eliminar ${c.nombre}`}
                        >
                          Eliminar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!datos.total && <p>No hay clientes con esos filtros.</p>}
          <PaginacionClientes
            pagina={pagina}
            total={datos.total}
            cambiar={(p) => {
              setPagina(p);
              setCargando(true);
            }}
          />
        </>
      )}
      {editor && (
        <EditorCliente
          inicial={editor === "nuevo" ? undefined : editor}
          cerrar={() => setEditor(null)}
          alGuardar={() => {
            setEditor(null);
            setAviso("Cliente guardado.");
            actualizar();
          }}
        />
      )}
      {ficha && <FichaCliente cliente={ficha} cerrar={() => setFicha(null)} />}
      {eliminar && (
        <MovimientoPapelera
          tipo="clientes"
          registro={eliminar}
          cerrar={() => setEliminar(null)}
          terminar={() => {
            setEliminar(null);
            setAviso("Cliente enviado a la papelera.");
            actualizar();
          }}
        />
      )}
    </div>
  );
}
