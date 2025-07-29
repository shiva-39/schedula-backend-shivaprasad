import { DataSource } from 'typeorm';
import { User } from './user.entity';
import { Doctor } from './doctor/doctor.entity';
import { Patient } from './patient/patient.entity';
import { Appointment } from './appointment.entity';
import { AvailabilitySlot } from './availability_slot.entity';
import { ElasticScheduleEntity } from './elastic-schedule/elastic-schedule.entity';
import { RecurringScheduleEntity } from './elastic-schedule/recurring-schedule.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || '123456',
  database: process.env.DB_NAME || 'schedula',
  entities: [User, Doctor, Patient, Appointment, AvailabilitySlot, ElasticScheduleEntity, RecurringScheduleEntity],
  migrations: ['src/migration/*.ts'],
  synchronize: false,
}); 