import { readFile } from 'node:fs/promises';
import postgres from 'postgres';

if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required to run PostgreSQL migrations.');
    process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

try {
    const schema = await readFile(new URL('../server/postgres-schema.sql', import.meta.url), 'utf8');
    await sql.unsafe(schema);
    console.log('Study Lab PostgreSQL schema is ready.');
} finally {
    await sql.end();
}
