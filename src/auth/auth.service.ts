import { Injectable, UnauthorizedException, ConflictException, Inject, forwardRef } from '@nestjs/common';
import { PatientRegisterDto } from './dto/patient-register.dto';
import { DoctorRegisterDto } from './dto/doctor-register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user.entity';
import { Doctor } from '../doctor.entity';
import { Patient } from '../patient.entity';
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
    return { message: 'Patient registered successfully' };
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
    return { message: 'Doctor registered successfully' };
  }

  async login(dto: LoginDto) {
    const user = await this.userRepository.findOne({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');
    const payload = { sub: user.id, email: user.email, role: user.role };
    const access_token = await this.jwtService.signAsync(payload);
    return { access_token };
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
