import { createApiHandler } from '../server/app.js';
import { createPostgresRepository } from '../server/postgres-repository.js';

const repository = createPostgresRepository();
const handler = createApiHandler({ repository, secure: true, database: 'postgresql' });

export default handler;
