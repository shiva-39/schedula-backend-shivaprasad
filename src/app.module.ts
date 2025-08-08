import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { JwtModule } from '@nestjs/jwt';
import { User } from './user.entity';
import { DoctorController } from './doctor/doctor.controller';
import { DoctorService } from './doctor/doctor.service';
import { Doctor } from './doctor/doctor.entity';
import { PatientController } from './patient/patient.controller';
import { PatientService } from './patient/patient.service';
import { Patient } from './patient/patient.entity';
import { JwtStrategy } from './auth/jwt.strategy';
import { ElasticScheduleEntity } from './elastic-schedule/elastic-schedule.entity';
import { RecurringScheduleEntity } from './elastic-schedule/recurring-schedule.entity';
import { ElasticScheduleController } from './elastic-schedule/elastic-schedule.controller';
import { ElasticScheduleService } from './elastic-schedule/elastic-schedule.service';
import { RecurringScheduleController } from './elastic-schedule/recurring-schedule.controller';
import { RecurringScheduleService } from './elastic-schedule/recurring-schedule.service';
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';
import { AvailabilitySlot } from './availability_slot.entity';
import { Appointment } from './appointment.entity';
import { AppointmentController } from './appointment.controller';
import { AppointmentService } from './appointment.service';
import { NotificationService } from './notification/notification.service';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || '123456',
      database: process.env.DB_NAME || 'schedula',
      autoLoadEntities: true,
      synchronize: false, // Use migrations only
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    }),
    TypeOrmModule.forFeature([User, Doctor, Patient, AvailabilitySlot, Appointment, ElasticScheduleEntity, RecurringScheduleEntity]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'shortkey',
      signOptions: { expiresIn: '1h' },
    }),
  ],
  controllers: [AppController, AuthController, DoctorController, PatientController, AvailabilityController, AppointmentController, ElasticScheduleController, RecurringScheduleController],
  providers: [AppService, AuthService, JwtStrategy, DoctorService, PatientService, AvailabilityService, AppointmentService, ElasticScheduleService, RecurringScheduleService, NotificationService],
})
export class AppModule {}