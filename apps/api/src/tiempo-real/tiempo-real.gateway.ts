import { Logger } from '@nestjs/common';
import { OnGatewayInit, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Namespace } from 'socket.io';
import { VerificadorFirebase } from '../autenticacion/verificador-firebase.js';
import { PrismaService } from '../prisma/prisma.service.js';

@WebSocketGateway({ namespace: '/ventas', cors: {
  origin: (origen: string | undefined, responder: (error: Error | null, permitir?: boolean) => void) => {
    const permitidos = (process.env.CORS_ORIGENES ?? 'http://localhost:5173').split(',').map((o) => o.trim());
    responder(null, !origen || permitidos.includes(origen));
  },
} })
export class TiempoRealGateway implements OnGatewayInit {
  @WebSocketServer() servidor!: Namespace;
  private readonly logger = new Logger('TiempoReal');
  constructor(private readonly prisma: PrismaService, private readonly firebase: VerificadorFirebase) {}

  private async autorizado(uid: string, centroId: number) {
    const u = await this.prisma.usuario.findUnique({ where: { firebase_uid: uid }, include: { usuario_centro: true } });
    if (!u?.activo || !['ADMIN', 'GERENTE', 'CAJERO', 'MESERO', 'COCINA'].includes(u.rol)) return false;
    if (u.rol !== 'ADMIN' && !u.usuario_centro.some((uc) => uc.centro_venta_id === centroId)) return false;
    return Boolean(await this.prisma.centro_venta.findFirst({ where: { id: centroId, activo: true } }));
  }

  afterInit(servidor: Namespace) {
    servidor.use(async (socket, siguiente) => {
      try {
        const { token, centro_id } = socket.handshake.auth as { token?: unknown; centro_id?: unknown };
        if (typeof token !== 'string' || typeof centro_id !== 'number' || !Number.isInteger(centro_id)) throw new Error();
        const { uid } = await this.firebase.verificar(token);
        if (!await this.autorizado(uid, centro_id)) throw new Error();
        socket.data.uid = uid;
        socket.data.token = token;
        socket.data.centro_id = centro_id;
        // No acepta nombres de salas enviados por el cliente.
        await socket.join(`centro:${centro_id}`);
        siguiente();
      } catch {
        siguiente(new Error('No se pudo conectar en tiempo real. Revisa tu sesión y tu centro de venta.'));
      }
    });
  }

  async publicar(centroId: number, pedidoId: string) {
    try {
      if (!this.servidor) return;
      const conexiones = await this.servidor.in(`centro:${centroId}`).fetchSockets();
      for (const socket of conexiones) {
        let autorizado = false;
        try {
          const { uid } = await this.firebase.verificar(String(socket.data.token));
          autorizado = uid === socket.data.uid && await this.autorizado(uid, centroId);
        } catch { /* Una sesión vencida se desconecta; la app renueva el token al reconectar. */ }
        if (autorizado) {
          // Solo avisa del cambio; los datos se consultan mediante la API protegida.
          socket.emit('pedido:actualizado', { pedido_id: pedidoId });
        } else socket.disconnect(true);
      }
    } catch (error) {
      // Un aviso fallido no deshace una venta que ya quedó guardada.
      this.logger.warn(`No se pudo avisar del cambio del pedido: ${String(error)}`);
    }
  }
}
