// Carga el .env de la raíz del proyecto antes de las pruebas e2e.
// Las pruebas e2e necesitan la base de Docker encendida: docker compose up -d
import { config } from 'dotenv';

config({ path: '../../.env', quiet: true });
