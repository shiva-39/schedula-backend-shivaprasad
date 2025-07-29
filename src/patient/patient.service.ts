import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Patient } from './patient.entity';
import { User } from '../user.entity';

@Injectable()
export class PatientService {
  constructor(
    @InjectRepository(Patient)
    private readonly patientRepository: Repository<Patient>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async getPatient(id: string, user: any) {
    const patient = await this.patientRepository.findOne({ where: { id }, relations: ['user'] });
    if (!patient) throw new NotFoundException('Patient not found');
    if (patient.user.id !== user.sub) throw new ForbiddenException('You can only view your own profile');
    return patient;
  }

  async updatePatient(id: string, update: any, user: any) {
    const patient = await this.patientRepository.findOne({ where: { id }, relations: ['user'] });
    if (!patient) throw new NotFoundException('Patient not found');
    if (patient.user.id !== user.sub) throw new ForbiddenException('You can only update your own profile');
    Object.assign(patient, update);
    await this.patientRepository.save(patient);
    return patient;
  }
} 