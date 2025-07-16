import { DataSource } from 'typeorm';
import { User } from './user.entity';
import { Doctor } from './doctor.entity';
import { Patient } from './patient.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || '123456',
  database: process.env.DB_NAME || 'schedula',
  entities: [User, Doctor, Patient],
  migrations: ['src/migration/*.ts'],
  synchronize: false,
}); 