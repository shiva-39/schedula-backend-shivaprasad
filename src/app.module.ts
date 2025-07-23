import { ElasticScheduleController } from './elastic-schedule/elastic-schedule.controller';
import { ElasticScheduleService } from './elastic-schedule/elastic-schedule.service';
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
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';
import { AvailabilitySlot } from './availability_slot.entity';
import { Appointment } from './appointment.entity';
import { AppointmentController } from './appointment.controller';
import { AppointmentService } from './appointment.service';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || '123456',
      database: process.env.DB_NAME || 'schedula',
      autoLoadEntities: true,
      synchronize: false, // Use migrations only
    }),
    TypeOrmModule.forFeature([User, Doctor, Patient, AvailabilitySlot, Appointment, require('./elastic-schedule/elastic-schedule.entity').ElasticScheduleEntity]),
    JwtModule.register({
      secret: 'shortkey',
      signOptions: { expiresIn: '1h' },
    }),
  ],
  controllers: [AppController, AuthController, DoctorController, PatientController, AvailabilityController, AppointmentController, ElasticScheduleController],
  providers: [AppService, AuthService, JwtStrategy, DoctorService, PatientService, AvailabilityService, AppointmentService, ElasticScheduleService],
})
export class AppModule {}