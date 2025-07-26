import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AvailabilitySlot } from './availability_slot.entity';
import { Doctor } from './doctor/doctor.entity';
import { Appointment } from './appointment.entity';

@Injectable()
export class AvailabilityService {
  constructor(
    @InjectRepository(AvailabilitySlot)
    private readonly slotRepository: Repository<AvailabilitySlot>,
    @InjectRepository(Doctor)
    private readonly doctorRepository: Repository<Doctor>,
    @InjectRepository(Appointment)
    private readonly appointmentRepository: Repository<Appointment>,
  ) {}

  async getSlots(doctorId: string) {
    return this.slotRepository.find({ where: { doctor: { id: doctorId } } });
  }

  async addSlot(doctorId: string, slotData: any, user: any) {
    try {
      // Only allow doctor to add their own slots
      const doctor = await this.doctorRepository.findOne({ where: { id: doctorId }, relations: ['user'] });
      if (!doctor) throw new NotFoundException('Doctor not found');
      if (!doctor.user || doctor.user.id !== user.sub) throw new ForbiddenException('You can only add slots for your own profile');
      
      // Handle different date formats
      let startDateTime: Date;
      let endDateTime: Date;
      
      if (slotData.date && typeof slotData.startTime === 'string' && !slotData.startTime.includes('T')) {
        // Format: separate date and time fields
        startDateTime = new Date(`${slotData.date}T${slotData.startTime}`);
        endDateTime = new Date(`${slotData.date}T${slotData.endTime}`);
      } else {
        // Format: ISO datetime strings
        startDateTime = new Date(slotData.startTime);
        endDateTime = new Date(slotData.endTime);
      }
      
      // Validate dates
      if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
        throw new Error('Invalid date format. Use ISO datetime strings (e.g., "2025-07-30T09:00:00") or separate date and time fields.');
      }
      
      const slot = this.slotRepository.create({
        doctor,
        startTime: startDateTime,
        endTime: endDateTime,
        mode: slotData.isAvailable !== false ? 'available' : 'unavailable', // default to available
      });
      
      await this.slotRepository.save(slot);
      return slot;
    } catch (error) {
      console.error('Error in addSlot:', error);
      throw error;
    }
  }

  async deleteSlot(doctorId: string, slotId: string, user: any) {
    const slot = await this.slotRepository.findOne({ where: { id: slotId }, relations: ['doctor', 'doctor.user'] });
    console.log('Slot:', slot);
    console.log('Slot doctor:', slot?.doctor);
    console.log('Slot doctor user:', slot?.doctor?.user);
    if (!slot) throw new NotFoundException('Slot not found');
    if (!slot.doctor) throw new NotFoundException('Slot doctor relation not found');
    if (slot.doctor.id !== doctorId) throw new ForbiddenException('Slot does not belong to this doctor');
    if (!slot.doctor.user) throw new NotFoundException('Doctor user relation not found');
    if (slot.doctor.user.id !== user.sub) throw new ForbiddenException('You can only delete your own slots');
    // Check for linked appointments
    const linkedAppointments = await this.appointmentRepository.count({ where: { slot: { id: slotId } } });
    if (linkedAppointments > 0) {
      throw new ConflictException('Cannot delete slot: it is linked to existing appointments');
    }
    await this.slotRepository.remove(slot);
    return { message: 'Slot deleted' };
  }
}
