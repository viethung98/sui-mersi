import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  url: process.env.DB_URL || '',
  database: process.env.DB_DATABASE || 'amazon_shopping_agent',
  synchronize: asBoolean(process.env.DB_SYNCHRONIZE || 'false'),
  migrationsRun: asBoolean(process.env.DB_MIGRATIONS_RUN || 'false'),
}));

function asBoolean(value: string): boolean {
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}
