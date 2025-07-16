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
    TypeOrmModule.forFeature([User, Doctor, Patient, AvailabilitySlot]),
    JwtModule.register({
      secret: `${process.env.JWT_SECRET || 'supersecretkey'}`,
      signOptions: { expiresIn: '1d' },
    }),
  ],
  controllers: [AppController, AuthController, DoctorController, PatientController, AvailabilityController],
  providers: [AppService, AuthService, JwtStrategy, DoctorService, PatientService, AvailabilityService],
})
export class AppModule {}
