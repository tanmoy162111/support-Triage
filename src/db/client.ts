import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export function makeDb(url: string) {
  return drizzle(postgres(url, { max: 5 }), { schema });
}
export type Db = ReturnType<typeof makeDb>;
