import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import type { UsuarioSesion } from '../autenticacion/usuario-sesion.js';
import { contextoBd } from './contexto-bd.js';

/**
 * Tarea 16: después de validar al usuario (guardia), todo lo que hace la petición
 * en la base corre como ventas_api limitado a los centros del usuario.
 */
@Injectable()
export class ContextoBdInterceptor implements NestInterceptor {
  intercept(contexto: ExecutionContext, siguiente: CallHandler): Observable<unknown> {
    if (contexto.getType() !== 'http') return siguiente.handle();
    const usuario = contexto.switchToHttp().getRequest<{ usuario?: UsuarioSesion }>().usuario;
    if (!usuario) return siguiente.handle(); // rutas públicas, como /salud
    const datos = { usuarioId: usuario.id, centros: usuario.centros.map((c) => c.id) };
    // La suscripción se hace dentro del contexto para que el controlador lo herede.
    return new Observable((suscriptor) => contextoBd.run(datos, () => {
      const s = siguiente.handle().subscribe(suscriptor);
      return () => s.unsubscribe();
    }));
  }
}
