import { useEffect, useState } from "react";
import { useSesion } from "@/sesion/SesionProvider";
import { FichaCliente } from "@/paginas/Clientes";
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
  MovimientoPapelera,
  DetallePedidoCliente,
  PaginacionClientes,
} from "@/componentes/ClientesCompartidos";

interface RegistroPapelera extends Cliente {
  folio?: number;
  fecha_operacion?: string;
  cliente_nombre?: string;
  total?: string;
  estado?: string;
  usuario_pedido_eliminado_porTousuario?: { nombre: string } | null;
}
export function Papelera() {
  const { api, estado, centro } = useSesion();
  const u = estado.tipo === "activa" ? estado.usuario : null;
  const [tipo, setTipo] = useState<"clientes" | "pedidos">(
      permisoClientes(u, "clientes") ? "clientes" : "pedidos",
    ),
    [buscar, setBuscar] = useState(""),
    [consulta, setConsulta] = useState(""),
    [fecha, setFecha] = useState(""),
    [pagina, setPagina] = useState(0),
    [revision, setRevision] = useState(0);
  const [datos, setDatos] = useState<PaginaClientes<RegistroPapelera>>({
      registros: [],
      total: 0,
      pagina: 0,
    }),
    [error, setError] = useState(""),
    [cargando, setCargando] = useState(true),
    [aviso, setAviso] = useState("");
  const [restaurar, setRestaurar] = useState<RegistroPapelera | null>(null),
    [cliente, setCliente] = useState<Cliente | null>(null),
    [pedido, setPedido] = useState<string | null>(null);
  useEffect(() => {
    let vigente = true;
    void api<PaginaClientes<RegistroPapelera>>(
      `/papelera/${tipo}?buscar=${encodeURIComponent(consulta)}&pagina=${pagina}${fecha ? `&fecha=${fecha}` : ""}`,
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
  }, [api, tipo, consulta, pagina, revision, fecha]);
  function actualizar() {
    setCargando(true);
    setError("");
    setRevision((r) => r + 1);
  }
  const nombre = (r: RegistroPapelera) =>
    tipo === "clientes"
      ? r.nombre
      : `Pedido ${r.folio} · ${r.fecha_operacion?.slice(0, 10)}`;
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <h1 className="text-3xl font-bold">Papelera</h1>
      <p>
        {centro?.nombre} · Consulta y restaura registros. Los pagos y reportes
        se conservan.
      </p>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setConsulta(buscar.trim());
          setPagina(0);
          actualizar();
        }}
      >
        <label>
          Tipo de registro
          <select
            className={campo}
            value={tipo}
            onChange={(e) => {
              setTipo(e.target.value as typeof tipo);
              setPagina(0);
              setCargando(true);
              setError("");
            }}
          >
            {permisoClientes(u, "clientes") && (
              <option value="clientes">Clientes</option>
            )}
            {permisoClientes(u, "pedidos") && (
              <option value="pedidos">Pedidos</option>
            )}
          </select>
        </label>
        <label className="flex-1">
          Buscar por nombre, teléfono, folio, motivo o usuario
          <input
            className={campo}
            type="search"
            maxLength={100}
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
          />
        </label>
          <label>
            {tipo === "pedidos" ? "Fecha del pedido" : "Fecha de envío a papelera"}
            <input
              className={campo}
              type="date"
              value={fecha}
              onChange={(e) => {
                setFecha(e.target.value);
                setPagina(0);
              }}
            />
          </label>
        <button className={boton}>Buscar</button>
        <button className={secundario} type="button" onClick={actualizar}>
          Actualizar
        </button>
      </form>
      {error && (
        <p role="alert" className="text-red-800">
          {error}
        </p>
      )}
      {aviso && <p role="status">{aviso}</p>}
      {cargando ? (
        <p>Cargando papelera…</p>
      ) : (
        <>
          <ul className="space-y-3">
            {datos.registros.map((r) => (
              <li
                className="space-y-2 rounded-xl border bg-white p-4"
                key={r.id}
              >
                <strong className="text-lg">{nombre(r)}</strong>
                <p>
                  {tipo === "clientes"
                    ? r.telefono
                    : `${r.cliente_nombre || "Cliente de mostrador"} · ${r.estado} · Q ${Number(r.total).toFixed(2)}`}
                </p>
                <p>
                  Retirado por{" "}
                  {r.usuario_cliente_eliminado_porTousuario?.nombre ||
                    r.usuario_pedido_eliminado_porTousuario?.nombre ||
                    "Usuario registrado"}{" "}
                  · {r.eliminado_en && fechaCliente(r.eliminado_en)}
                </p>
                <p>Motivo: {r.motivo_eliminacion}</p>
                <div className="flex flex-wrap gap-2">
                  {(tipo === "clientes" || permisoClientes(u, "caja")) && (
                    <button
                      className={secundario}
                      onClick={() => {
                        if (tipo === "clientes") setCliente(r);
                        else setPedido(r.id);
                      }}
                    >
                      Ver detalles
                    </button>
                  )}
                  {permisoClientes(u, "papelera", "editar") &&
                    permisoClientes(u, tipo, "editar") && (
                      <button className={boton} onClick={() => setRestaurar(r)}>
                        Restaurar
                      </button>
                    )}
                </div>
              </li>
            ))}
          </ul>
          {!datos.total && (
            <p>No hay registros en la papelera con esos filtros.</p>
          )}
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
      {restaurar && (
        <MovimientoPapelera
          tipo={tipo}
          registro={{ ...restaurar, nombre: nombre(restaurar) }}
          restaurar
          cerrar={() => setRestaurar(null)}
          terminar={() => {
            setRestaurar(null);
            setAviso("Registro restaurado.");
            actualizar();
          }}
        />
      )}
      {cliente && (
        <FichaCliente cliente={cliente} cerrar={() => setCliente(null)} />
      )}
      {pedido && (
        <DetallePedidoCliente id={pedido} cerrar={() => setPedido(null)} />
      )}
    </div>
  );
}
