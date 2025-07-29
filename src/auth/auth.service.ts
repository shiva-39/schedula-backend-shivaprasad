import { Injectable, UnauthorizedException, ConflictException, Inject, forwardRef } from '@nestjs/common';
import { PatientRegisterDto } from '../auth/dto/patient-register.dto';
import { DoctorRegisterDto } from '../auth/dto/doctor-register.dto';
import { LoginDto } from '../auth/dto/login.dto';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user.entity';
import { Doctor } from '../doctor/doctor.entity';
import { Patient } from '../patient/patient.entity';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  // Track doctors using elastic scheduling and their slot fill rate
  async getElasticDoctorsWithFillRate(): Promise<Array<{ doctorId: string; doctorName: string; totalSlots: number; filledSlots: number; fillRate: number }>> {
    // Find all doctors with at least one elastic schedule
    const doctors = await this.doctorRepository.find();
    const elasticSchedulesRepo = (this as any).elasticScheduleRepo || null;
    if (!elasticSchedulesRepo) throw new Error('ElasticSchedule repository not injected');
    const result: Array<{ doctorId: string; doctorName: string; totalSlots: number; filledSlots: number; fillRate: number }> = [];
    for (const doctor of doctors) {
      // Find elastic schedules for this doctor
      const schedules = await elasticSchedulesRepo.find({ where: { doctor: { id: doctor.id } } });
      if (schedules.length === 0) continue;
      let totalSlots = 0;
      let filledSlots = 0;
      for (const schedule of schedules) {
        // Calculate total possible slots for this schedule
        const slotDuration = schedule.slotDuration;
        const buffer = schedule.bufferTime || 0;
        const start = schedule.startTime;
        const end = schedule.endTime;
        const toMinutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
        let current = toMinutes(start);
        const endMin = toMinutes(end);
        while (current + slotDuration <= endMin) {
          totalSlots++;
          current += slotDuration + buffer;
        }
        // Count filled slots (appointments)
        const appointments = await (this as any).appointmentRepository.find({ where: { doctor: { id: doctor.id }, date: schedule.date, elasticSchedule: { id: schedule.id } } });
        filledSlots += appointments.length;
      }
      result.push({ doctorId: doctor.id, doctorName: doctor.name, totalSlots, filledSlots, fillRate: totalSlots ? filledSlots / totalSlots : 0 });
    }
    return result;
  }

  // Recommend optimal durations/windows based on fill rate
  async recommendElasticSlotSettings(doctorId: string): Promise<{ recommendedSlotDuration?: number; recommendedWindow?: string; fillRate?: number; message?: string }> {
    const elasticSchedulesRepo = (this as any).elasticScheduleRepo || null;
    if (!elasticSchedulesRepo) throw new Error('ElasticSchedule repository not injected');
    const schedules = await elasticSchedulesRepo.find({ where: { doctor: { id: doctorId } } });
    if (schedules.length === 0) return { message: 'No elastic schedules found for doctor' };
    let bestFillRate = 0;
    let bestSchedule: typeof schedules[0] | null = null;
    for (const schedule of schedules) {
      const slotDuration = schedule.slotDuration;
      const buffer = schedule.bufferTime || 0;
      const start = schedule.startTime;
      const end = schedule.endTime;
      const toMinutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
      let current = toMinutes(start);
      const endMin = toMinutes(end);
      let totalSlots = 0;
      while (current + slotDuration <= endMin) {
        totalSlots++;
        current += slotDuration + buffer;
      }
      const appointments = await (this as any).appointmentRepository.find({ where: { doctor: { id: doctorId }, date: schedule.date, elasticSchedule: { id: schedule.id } } });
      const fillRate = totalSlots ? appointments.length / totalSlots : 0;
      if (fillRate > bestFillRate) {
        bestFillRate = fillRate;
        bestSchedule = schedule;
      }
    }
    if (!bestSchedule) return { message: 'No filled slots found for doctor' };
    return {
      recommendedSlotDuration: bestSchedule.slotDuration,
      recommendedWindow: `${bestSchedule.startTime}-${bestSchedule.endTime}`,
      fillRate: bestFillRate,
    };
  }
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Doctor)
    private readonly doctorRepository: Repository<Doctor>,
    @InjectRepository(Patient)
    private readonly patientRepository: Repository<Patient>,
    private readonly jwtService: JwtService,
  ) {}

  async registerPatient(dto: PatientRegisterDto) {
    const existing = await this.userRepository.findOne({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already in use');
    const hash = await bcrypt.hash(dto.password, 10);
    const user = this.userRepository.create({
      email: dto.email,
      passwordHash: hash,
      role: 'patient',
    });
    await this.userRepository.save(user);
    const patient = this.patientRepository.create({
      name: dto.name,
      gender: dto.gender,
      age: dto.age,
      phoneNumber: dto.phoneNumber,
      user: user,
    });
    await this.patientRepository.save(patient);
    return { 
      message: 'Patient registered successfully',
      id: patient.id,
      userId: user.id 
    };
  }

  async registerDoctor(dto: DoctorRegisterDto) {
    const existing = await this.userRepository.findOne({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already in use');
    const hash = await bcrypt.hash(dto.password, 10);
    const user = this.userRepository.create({
      email: dto.email,
      passwordHash: hash,
      role: 'doctor',
    });
    await this.userRepository.save(user);
    const doctor = this.doctorRepository.create({
      name: dto.name,
      specialization: dto.specialization,
      yearsExperience: dto.yearsExperience,
      user: user,
    });
    await this.doctorRepository.save(doctor);
    return { 
      message: 'Doctor registered successfully',
      id: doctor.id,
      userId: user.id 
    };
  }

  async login(dto: LoginDto) {
    // Extra logging for debugging
    const user = await this.userRepository.findOne({ where: { email: dto.email } });
    if (!user) {
      console.log('Login failed: user not found for email', dto.email);
      throw new UnauthorizedException('Invalid credentials');
    }
    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      console.log('Login failed: invalid password for email', dto.email);
      throw new UnauthorizedException('Invalid credentials');
    }

    let entityId: string | null = null;
    
    // Get the Doctor/Patient ID based on role
    if (user.role === 'patient') {
      const patient = await this.patientRepository.findOne({ where: { user: { id: user.id } } });
      if (!patient) {
        // Auto-create missing Patient entity for patient users
        const newPatient = this.patientRepository.create({
          name: user.email.split('@')[0],
          gender: 'unknown',
          age: 0,
          phoneNumber: '',
          user: user,
        });
        await this.patientRepository.save(newPatient);
        entityId = newPatient.id;
        console.log('Auto-created missing Patient entity for user:', user.id);
      } else {
        entityId = patient.id;
      }
    } else if (user.role === 'doctor') {
      const doctor = await this.doctorRepository.findOne({ where: { user: { id: user.id } } });
      if (doctor) {
        entityId = doctor.id;
      }
    }

    // Log user info for debugging
    console.log('Login success:', { id: user.id, email: user.email, role: user.role, entityId });
    // Use a minimal payload and short expiry for a smaller token
    const payload = { sub: user.id, email: user.email, role: user.role };
    const access_token = await this.jwtService.signAsync(payload, { secret: 'shortkey', expiresIn: '1h' });
    // Log token for debugging
    console.log('Generated token for', user.email, access_token);
    return { 
      access_token,
      userId: user.id,
      entityId: entityId,
      role: user.role
    };
  }

  async logout(_req: any) {
    // JWT logout is stateless; client should delete token
    return { message: 'Logged out (client should delete token)' };
  }

  async getProfile(user: any) {
    // user is injected by JwtAuthGuard
    const dbUser = await this.userRepository.findOne({ where: { id: user.sub } });
    if (!dbUser) throw new UnauthorizedException('User not found');
    // Remove sensitive info
    const { passwordHash, ...profile } = dbUser;
    return profile;
  }
}