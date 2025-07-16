import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AvailabilitySlot } from './availability_slot.entity';
import { Doctor } from './doctor.entity';

@Injectable()
export class AvailabilityService {
  constructor(
    @InjectRepository(AvailabilitySlot)
    private readonly slotRepository: Repository<AvailabilitySlot>,
    @InjectRepository(Doctor)
    private readonly doctorRepository: Repository<Doctor>,
  ) {}

  async getSlots(doctorId: string) {
    return this.slotRepository.find({ where: { doctor: { id: doctorId } } });
  }

  async addSlot(doctorId: string, slotData: any, user: any) {
    // Only allow doctor to add their own slots
    const doctor = await this.doctorRepository.findOne({ where: { id: doctorId }, relations: ['user'] });
    if (!doctor) throw new NotFoundException('Doctor not found');
    if (!doctor.user || doctor.user.id !== user.sub) throw new ForbiddenException('You can only add slots for your own profile');
    const slot = this.slotRepository.create({ ...slotData, doctor });
    await this.slotRepository.save(slot);
    return slot;
  }

  async deleteSlot(doctorId: string, slotId: string, user: any) {
    const slot = await this.slotRepository.findOne({ where: { id: slotId }, relations: ['doctor'] });
    if (!slot) throw new NotFoundException('Slot not found');
    if (slot.doctor.id !== doctorId) throw new ForbiddenException('Slot does not belong to this doctor');
    if (slot.doctor.user.id !== user.sub) throw new ForbiddenException('You can only delete your own slots');
    await this.slotRepository.remove(slot);
    return { message: 'Slot deleted' };
  }
} 