import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Doctor } from './doctor.entity';
import { User } from '../user.entity';

@Injectable()
export class DoctorService {
  constructor(
    @InjectRepository(Doctor)
    private readonly doctorRepository: Repository<Doctor>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async getDoctors() {
    return this.doctorRepository.find();
  }

  async getDoctor(id: string) {
    const doctor = await this.doctorRepository.findOne({ where: { id } });
    if (!doctor) throw new NotFoundException('Doctor not found');
    return doctor;
  }

  async updateDoctor(id: string, update: any, user: any) {
    // Only allow doctor to update their own profile
    const doctor = await this.doctorRepository.findOne({ where: { id }, relations: ['user'] });
    if (!doctor) throw new NotFoundException('Doctor not found');
    if (doctor.user.id !== user.sub) throw new ForbiddenException('You can only update your own profile');
    Object.assign(doctor, update);
    await this.doctorRepository.save(doctor);
    return doctor;
  }
} 