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
