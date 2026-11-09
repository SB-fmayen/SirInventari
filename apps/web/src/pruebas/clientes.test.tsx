import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Clientes } from "@/paginas/Clientes";
import { Papelera } from "@/paginas/Papelera";
import { ErrorApi } from "@/lib/api";

const sesion = vi.hoisted(() => ({
  api: vi.fn(),
  rol: "ADMIN",
  permisos: [] as { modulo: string; accion: string; permitido: boolean }[],
}));
vi.mock("@/sesion/SesionProvider", () => ({
  useSesion: () => ({
    api: sesion.api,
    centro: { id: 1, nombre: "Centro prueba" },
    estado: {
      tipo: "activa",
      usuario: { id: 1, rol: sesion.rol, permisos: sesion.permisos },
    },
  }),
}));
const id = "73f98958-7be3-4db8-bdf9-cb91d52acf25";
let cliente: {
  id: string;
  nombre: string;
  telefono: string;
  direccion: string;
  version: number;
  eliminado_en: string | null;
  motivo_eliminacion?: string;
};
beforeEach(() => {
  sesion.api.mockReset();
  sesion.rol = "ADMIN";
  sesion.permisos = [];
  cliente = {
    id,
    nombre: "Ana Cliente",
    telefono: "5555-1234",
    direccion: "Zona 1",
    version: 1,
    eliminado_en: null,
  };
  sesion.api.mockImplementation(
    async (ruta: string, opciones?: RequestInit) => {
      const c = opciones?.body ? JSON.parse(String(opciones.body)) : {};
      if (ruta.startsWith("/clientes?"))
        return {
          registros: cliente.eliminado_en ? [] : [{ ...cliente }],
          total: cliente.eliminado_en ? 0 : 1,
          pagina: 0,
        };
      if (ruta === `/clientes/${id}` && opciones?.method === "PATCH") {
        Object.assign(cliente, c);
        return cliente;
      }
      if (ruta === "/clientes" && opciones?.method === "POST") {
        Object.assign(cliente, c);
        return cliente;
      }
      if (ruta.startsWith(`/clientes/${id}/pedidos`))
        return {
          registros: [
            {
              id: "pedido-1",
              folio: 7,
              fecha_operacion: "2026-11-08",
              creado_en: "2026-11-08T18:30:00Z",
              estado: "PAGADO",
              total: "25",
              eliminado_en: null,
            },
          ],
          total: 1,
          pagina: 0,
        };
      if (ruta.startsWith(`/clientes/${id}/cambios`))
        return {
          registros: [
            {
              id: "1",
              campo: "direccion",
              valor_anterior: "Zona 1",
              valor_nuevo: "Zona 2",
              operacion: "EDICION",
              usuario: { nombre: "Gerente Pedro" },
              fecha: "2026-11-08T18:30:00Z",
            },
          ],
          total: 1,
          pagina: 0,
        };
      if (ruta === "/caja/pedidos/pedido-1/comprobante")
        return {
          centro: { nombre: "Centro prueba" },
          pedido: {
            id: "pedido-1",
            folio: 7,
            fecha_operacion: "2026-11-08",
            cliente_nombre: cliente.nombre,
            cliente_telefono: cliente.telefono,
            cliente_direccion: cliente.direccion,
            estado: "PAGADO",
            total: "25",
            pagado: "25",
            saldo: "0",
            pedido_detalle: [
              {
                id: "linea1",
                cantidad: "1",
                importe: "25",
                precio_unitario: "25",
                estado: "ACTIVA",
                producto: { nombre: "Shuko americano" },
                notas: "Sin cebolla",
              },
            ],
          },
          pagos: [
            {
              id: "pago1",
              metodo_pago: { nombre: "Efectivo" },
              monto: "25",
              estado: "APLICADO",
            },
          ],
        };
      if (ruta === `/papelera/clientes/${id}/eliminacion`) {
        cliente.eliminado_en = "2026-11-08T18:30:00Z";
        cliente.version++;
        cliente.motivo_eliminacion = c.motivo;
        return { id };
      }
      if (ruta === `/papelera/clientes/${id}/restauracion`) {
        cliente.eliminado_en = null;
        return { id };
      }
      if (ruta.startsWith("/papelera/clientes?"))
        return {
          registros: cliente.eliminado_en ? [{ ...cliente }] : [],
          total: cliente.eliminado_en ? 1 : 0,
          pagina: 0,
        };
      if (ruta.startsWith("/papelera/pedidos?"))
        return { registros: [], total: 0, pagina: 0 };
      throw new Error(`Ruta no simulada: ${ruta}`);
    },
  );
});
describe("Clientes y papelera en ventanas flotantes", () => {
  it("edita en ventana, protege cambios y conserva valores si el servidor rechaza el guardado", async () => {
    const confirmar = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<Clientes />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Editar Ana Cliente" }),
    );
    const dialogo = screen.getByRole("dialog", { name: "Editar cliente" });
    fireEvent.change(within(dialogo).getByLabelText("Dirección"), {
      target: { value: "Zona 2" },
    });
    await userEvent.click(
      within(dialogo).getByRole("button", { name: "Cerrar" }),
    );
    expect(confirmar).toHaveBeenCalledOnce();
    expect(dialogo).toBeInTheDocument();
    const anterior = sesion.api.getMockImplementation()!;
    sesion.api.mockImplementation(
      async (ruta: string, opciones?: RequestInit) => {
        if (opciones?.method === "PATCH")
          throw new ErrorApi(409, "Otro usuario cambió este cliente.");
        return anterior(ruta, opciones);
      },
    );
    await userEvent.click(
      within(dialogo).getByRole("button", { name: "Guardar cliente" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Otro usuario cambió este cliente.",
    );
    expect(within(dialogo).getByLabelText("Dirección")).toHaveValue("Zona 2");
    sesion.api.mockImplementation(anterior);
    await userEvent.click(
      within(dialogo).getByRole("button", { name: "Guardar cliente" }),
    );
    await screen.findByText("Cliente guardado.");
    expect(cliente.direccion).toBe("Zona 2");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("muestra pedidos con sus detalles y cambios por campo, fecha y responsable", async () => {
    render(<Clientes />);
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Ver detalles de Ana Cliente",
      }),
    );
    expect(await screen.findByText(/Gerente Pedro/)).toHaveTextContent(
      "8/11/26",
    );
    expect(screen.getByText("Antes: Zona 1")).toBeInTheDocument();
    expect(screen.getByText("Después: Zona 2")).toBeInTheDocument();
    await userEvent.click(
      await screen.findByRole("button", { name: "Ver detalles del pedido 7" }),
    );
    const dialogo = screen.getByRole("dialog", { name: "Detalle del pedido" });
    expect(
      await within(dialogo).findByText(/Shuko americano/),
    ).toBeInTheDocument();
    expect(within(dialogo).getByText("Notas: Sin cebolla")).toBeInTheDocument();
    expect(within(dialogo).getByText(/Efectivo/)).toBeInTheDocument();
    await userEvent.click(
      within(dialogo).getByRole("button", { name: "Cerrar" }),
    );
    expect(
      screen.getByRole("dialog", { name: "Cliente: Ana Cliente" }),
    ).toBeInTheDocument();
  });
  it("elimina con motivo y restaura desde papelera sin borrar la ficha", async () => {
    const vista = render(<Clientes />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Eliminar Ana Cliente" }),
    );
    const dialogo = screen.getByRole("dialog", {
      name: "Enviar a la papelera",
    });
    fireEvent.change(within(dialogo).getByLabelText("Motivo de eliminación"), {
      target: { value: "Registro de prueba" },
    });
    await userEvent.click(
      within(dialogo).getByRole("button", {
        name: "Confirmar envío a papelera",
      }),
    );
    await screen.findByText("Cliente enviado a la papelera.");
    expect(cliente.eliminado_en).toBeTruthy();
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Editar Ana Cliente" }),
      ).not.toBeInTheDocument(),
    );
    vista.unmount();
    render(<Papelera />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Restaurar" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar restauración" }),
    );
    await screen.findByText("Registro restaurado.");
    expect(cliente.eliminado_en).toBeNull();
  });
  it("un cajero consulta y edita pero no elimina ni consulta los cambios restringidos", async () => {
    sesion.rol = "CAJERO";
    render(<Clientes />);
    await screen.findByRole("button", { name: "Editar Ana Cliente" });
    expect(
      screen.queryByRole("button", { name: "Eliminar Ana Cliente" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Ver detalles de Ana Cliente" }),
    );
    await screen.findByRole("button", { name: "Ver detalles del pedido 7" });
    expect(
      sesion.api.mock.calls.some(([ruta]) => ruta.includes("/cambios")),
    ).toBe(false);
  });
  it("agrega un cliente y consulta búsquedas con el teléfono escrito", async () => {
    render(<Clientes />);
    await userEvent.click(
      screen.getByRole("button", { name: "Agregar cliente" }),
    );
    const dialogo = screen.getByRole("dialog", { name: "Agregar cliente" });
    fireEvent.change(within(dialogo).getByLabelText("Nombre"), {
      target: { value: "Luis" },
    });
    fireEvent.change(within(dialogo).getByLabelText("Teléfono"), {
      target: { value: "55557777" },
    });
    await userEvent.click(
      within(dialogo).getByRole("button", { name: "Guardar cliente" }),
    );
    await screen.findByText("Cliente guardado.");
    expect(
      sesion.api.mock.calls.find(
        ([ruta, opciones]) =>
          ruta === "/clientes" && opciones?.method === "POST",
      )?.[1],
    ).toMatchObject({ body: expect.stringContaining("Luis") });
    fireEvent.change(screen.getByLabelText("Buscar por nombre o teléfono"), {
      target: { value: "55557777" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Buscar" }));
    await waitFor(() =>
      expect(sesion.api).toHaveBeenCalledWith(
        "/clientes?buscar=55557777&pagina=0",
      ),
    );
  });
});
