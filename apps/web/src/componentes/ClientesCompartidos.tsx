import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSesion } from "@/sesion/SesionProvider";
import { useCambiosSinGuardar } from "@/hooks/useCambiosSinGuardar";
import type { DatosTicket } from "@/componentes/TicketVenta";

import {
  botonCliente,
  secundarioCliente,
  campoCliente,
  errorCliente,
  type Cliente,
  type PaginaClientes,
} from "@/lib/clientes";

export function VentanaClientes({
  titulo,
  cerrar,
  ocupado = false,
  children,
}: {
  titulo: string;
  cerrar: () => void;
  ocupado?: boolean;
  children: ReactNode;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (typeof d.showModal === "function") d.showModal();
    else d.setAttribute("open", "");
    return () => {
      if (typeof d.close === "function") d.close();
    };
  }, []);
  return (
    <dialog
      ref={dialogo}
      aria-label={titulo}
      className="editor-catalogo"
      onCancel={(e) => {
        e.preventDefault();
        if (!ocupado) cerrar();
      }}
    >
      <div className="cabecera-editor-catalogo">
        <h2 className="text-xl font-bold">{titulo}</h2>
        <button
          type="button"
          className={secundarioCliente}
          disabled={ocupado}
          onClick={cerrar}
        >
          Cerrar
        </button>
      </div>
      <div className="space-y-4 p-5">{children}</div>
    </dialog>
  );
}
export function PaginacionClientes({
  pagina,
  total,
  cambiar,
  ocupado = false,
}: {
  pagina: number;
  total: number;
  cambiar: (pagina: number) => void;
  ocupado?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span>
        {total} registros · Página {pagina + 1}
      </span>
      <button
        className={secundarioCliente}
        disabled={ocupado || pagina === 0}
        onClick={() => cambiar(pagina - 1)}
      >
        Anterior
      </button>
      <button
        className={secundarioCliente}
        disabled={ocupado || (pagina + 1) * 50 >= total}
        onClick={() => cambiar(pagina + 1)}
      >
        Siguiente
      </button>
    </div>
  );
}
export function EditorCliente({
  inicial,
  alGuardar,
  cerrar,
}: {
  inicial?: Cliente;
  alGuardar: () => void;
  cerrar: () => void;
}) {
  const { api } = useSesion();
  const [id] = useState(() => inicial?.id ?? crypto.randomUUID());
  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [telefono, setTelefono] = useState(inicial?.telefono ?? "");
  const [direccion, setDireccion] = useState(inicial?.direccion ?? "");
  const [ocupado, setOcupado] = useState(false),
    [error, setError] = useState("");
  const cambios =
    nombre !== (inicial?.nombre ?? "") ||
    telefono !== (inicial?.telefono ?? "") ||
    direccion !== (inicial?.direccion ?? "");
  useCambiosSinGuardar(cambios);
  function salir() {
    if (
      !ocupado &&
      (!cambios ||
        window.confirm("¿Salir sin guardar los cambios del cliente?"))
    )
      cerrar();
  }
  return (
    <VentanaClientes
      titulo={inicial ? "Editar cliente" : "Agregar cliente"}
      cerrar={salir}
      ocupado={ocupado}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setOcupado(true);
          setError("");
          void api(`/clientes${inicial ? `/${id}` : ""}`, {
            method: inicial ? "PATCH" : "POST",
            body: JSON.stringify({
              id,
              nombre,
              telefono,
              direccion,
              version: inicial?.version,
            }),
          })
            .then(alGuardar)
            .catch((e) => setError(errorCliente(e)))
            .finally(() => setOcupado(false));
        }}
      >
        <label className="block">
          Nombre
          <input
            autoFocus
            className={campoCliente}
            required
            maxLength={100}
            disabled={ocupado}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
        </label>
        <label className="block">
          Teléfono
          <input
            type="tel"
            className={campoCliente}
            required
            maxLength={30}
            disabled={ocupado}
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
          />
        </label>
        <label className="block">
          Dirección
          <textarea
            className={campoCliente}
            maxLength={300}
            disabled={ocupado}
            value={direccion}
            onChange={(e) => setDireccion(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="text-red-800">
            {error}
          </p>
        )}
        <button className={botonCliente} disabled={ocupado || !cambios}>
          {ocupado ? "Guardando…" : "Guardar cliente"}
        </button>
      </form>
    </VentanaClientes>
  );
}
export function MovimientoPapelera({
  tipo,
  registro,
  restaurar = false,
  terminar,
  cerrar,
}: {
  tipo: "clientes" | "pedidos";
  registro: { id: string; version: number; nombre: string };
  restaurar?: boolean;
  terminar: () => void;
  cerrar: () => void;
}) {
  const { api } = useSesion();
  const [motivo, setMotivo] = useState(""),
    [ocupado, setOcupado] = useState(false),
    [error, setError] = useState("");
  useCambiosSinGuardar(!!motivo);
  function salir() {
    if (
      !ocupado &&
      (!motivo ||
        window.confirm("¿Salir sin completar el envío a la papelera?"))
    )
      cerrar();
  }
  return (
    <VentanaClientes
      titulo={restaurar ? "Restaurar registro" : "Enviar a la papelera"}
      cerrar={salir}
      ocupado={ocupado}
    >
      <p className="font-semibold">{registro.nombre}</p>
      <p>
        {restaurar
          ? "Se recupera la visibilidad del registro. El estado del pedido y los pagos se conservan."
          : "Podrás restaurarlo desde Papelera. Los pedidos, pagos e historiales se conservan. Los pedidos pendientes deben anularse antes; los pagados deben estar entregados."}
      </p>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          setOcupado(true);
          void api(
            `/papelera/${tipo}/${registro.id}/${restaurar ? "restauracion" : "eliminacion"}`,
            {
              method: "POST",
              body: JSON.stringify({ version: registro.version, motivo }),
            },
          )
            .then(terminar)
            .catch((e) => setError(errorCliente(e)))
            .finally(() => setOcupado(false));
        }}
      >
        {!restaurar && (
          <label className="block">
            Motivo de eliminación
            <textarea
              autoFocus
              className={campoCliente}
              required
              maxLength={300}
              disabled={ocupado}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </label>
        )}
        {error && (
          <p role="alert" className="text-red-800">
            {error}
          </p>
        )}
        <button className={botonCliente} disabled={ocupado}>
          {ocupado
            ? "Guardando…"
            : restaurar
              ? "Confirmar restauración"
              : "Confirmar envío a papelera"}
        </button>
      </form>
    </VentanaClientes>
  );
}
export function BuscarCliente({
  inicial = "",
  elegir,
  cerrar,
}: {
  inicial?: string;
  elegir: (cliente: Cliente) => void;
  cerrar: () => void;
}) {
  const { api } = useSesion();
  const [buscar, setBuscar] = useState(inicial),
    [consulta, setConsulta] = useState(inicial),
    [pagina, setPagina] = useState(0),
    [revision, setRevision] = useState(0);
  const [datos, setDatos] = useState<PaginaClientes<Cliente>>({
      registros: [],
      total: 0,
      pagina: 0,
    }),
    [error, setError] = useState(""),
    [ocupado, setOcupado] = useState(true);
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
        if (vigente) setOcupado(false);
      });
    return () => {
      vigente = false;
    };
  }, [api, consulta, pagina, revision]);
  return (
    <VentanaClientes titulo="Buscar cliente" cerrar={cerrar}>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setOcupado(true);
          setError("");
          setPagina(0);
          setConsulta(buscar.trim());
          setRevision((r) => r + 1);
        }}
      >
        <label className="flex-1">
          Nombre o teléfono
          <input
            autoFocus
            className={campoCliente}
            value={buscar}
            maxLength={100}
            onChange={(e) => setBuscar(e.target.value)}
          />
        </label>
        <button className={botonCliente}>Buscar</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {ocupado ? (
        <p>Cargando clientes…</p>
      ) : (
        <>
          <ul className="space-y-2">
            {datos.registros.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
              >
                <span>
                  <strong>{c.nombre}</strong>
                  <br />
                  {c.telefono}
                  <br />
                  {c.direccion}
                </span>
                <button className={botonCliente} onClick={() => elegir(c)}>
                  Seleccionar {c.nombre}
                </button>
              </li>
            ))}
          </ul>
          {!datos.total && (
            <p>
              No hay clientes con esa búsqueda. Puedes cerrar y escribir los
              datos de un cliente nuevo en la venta.
            </p>
          )}
          <PaginacionClientes
            pagina={pagina}
            total={datos.total}
            cambiar={(p) => {
              setOcupado(true);
              setPagina(p);
            }}
          />
        </>
      )}
    </VentanaClientes>
  );
}
export function DetallePedidoCliente({
  id,
  cerrar,
}: {
  id: string;
  cerrar: () => void;
}) {
  const { api } = useSesion();
  const [datos, setDatos] = useState<DatosTicket | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let vigente = true;
    void api<DatosTicket>(`/caja/pedidos/${id}/comprobante`)
      .then((d) => {
        if (vigente) setDatos(d);
      })
      .catch((e) => {
        if (vigente) setError(errorCliente(e));
      });
    return () => {
      vigente = false;
    };
  }, [api, id]);
  return (
    <VentanaClientes titulo="Detalle del pedido" cerrar={cerrar}>
      {error && <p role="alert">{error}</p>}
      {!datos && !error && <p>Cargando pedido…</p>}
      {datos && (
        <>
          <p className="text-lg font-bold">
            Pedido {datos.pedido.folio} ·{" "}
            {datos.pedido.fecha_operacion.slice(0, 10)} · {datos.centro.nombre}
          </p>
          <p>Estado: {datos.pedido.estado}</p>
          <p>
            {datos.pedido.cliente_nombre} · {datos.pedido.cliente_telefono}
          </p>
          <p>{datos.pedido.cliente_direccion}</p>
          <ul className="space-y-2">
            {datos.pedido.pedido_detalle.map((l) => (
              <li className="rounded-xl border p-3" key={l.id}>
                {l.cantidad} × {l.producto.nombre} · Q{" "}
                {Number(l.importe).toFixed(2)} · {l.estado}
                {l.precio_unitario && (
                  <p>
                    Precio unitario: Q {Number(l.precio_unitario).toFixed(2)}
                  </p>
                )}
                {l.notas && <p>Notas: {l.notas}</p>}
              </li>
            ))}
          </ul>
          <p>
            Total: Q {Number(datos.pedido.total).toFixed(2)} · Pagado: Q{" "}
            {datos.pedido.pagado} · Saldo: Q {datos.pedido.saldo}
          </p>
          <h3 className="font-bold">Pagos</h3>
          {datos.pagos.map((p) => (
            <p key={p.id}>
              {p.metodo_pago.nombre} · Q {Number(p.monto).toFixed(2)} ·{" "}
              {p.estado}
              {p.referencia_pos && ` · Referencia ${p.referencia_pos}`}
              {p.terminal_pos && ` · Terminal ${p.terminal_pos}`}
            </p>
          ))}
        </>
      )}
    </VentanaClientes>
  );
}
