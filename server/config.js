import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDirectory = fileURLToPath(new URL('.', import.meta.url));

export const config = {
    host: process.env.HOST || '127.0.0.1',
    port: Number(process.env.PORT || 3001),
    production: process.env.NODE_ENV === 'production',
    distDirectory: resolve(serverDirectory, '../dist'),
    uploadsDirectory: resolve(process.env.UPLOADS_DIRECTORY || resolve(serverDirectory, '../data/uploads'))
};
