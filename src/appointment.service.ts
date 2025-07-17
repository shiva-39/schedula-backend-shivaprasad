import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Appointment } from './appointment.entity';
import { Patient } from './patient/patient.entity';
import { Doctor } from './doctor/doctor.entity';
import { AvailabilitySlot } from './availability_slot.entity';

@Injectable()
export class AppointmentService {
  constructor(
    @InjectRepository(Appointment)
    private readonly appointmentRepository: Repository<Appointment>,
    @InjectRepository(Patient)
    private readonly patientRepository: Repository<Patient>,
    @InjectRepository(Doctor)
    private readonly doctorRepository: Repository<Doctor>,
    @InjectRepository(AvailabilitySlot)
    private readonly slotRepository: Repository<AvailabilitySlot>,
  ) {}

  async createAppointment(data: any, user: any) {
    // TODO: Add logic for wave/stream capacity
    const patient = await this.patientRepository.findOne({ where: { user: { id: user.sub } } });
    const doctor = await this.doctorRepository.findOne({ where: { id: data.doctorId } });
    const slot = await this.slotRepository.findOne({ where: { id: data.slotId } });
    if (!patient) console.log('Patient not found:', user.sub);
    if (!doctor) console.log('Doctor not found:', data.doctorId);
    if (!slot) console.log('Slot not found:', data.slotId);
    if (!patient || !doctor || !slot) throw new NotFoundException('Invalid patient, doctor, or slot');
    const appointment = this.appointmentRepository.create({ patient, doctor, slot, status: 'scheduled' });
    await this.appointmentRepository.save(appointment);
    return appointment;
  }

  async rescheduleAppointment(id: string, data: any, user: any) {
    const appointment = await this.appointmentRepository.findOne({ where: { id }, relations: ['patient'] });
    if (!appointment) throw new NotFoundException('Appointment not found');
    if (appointment.patient.id !== user.sub) throw new ForbiddenException('You can only reschedule your own appointments');
    const newSlot = await this.slotRepository.findOne({ where: { id: data.slotId } });
    if (!newSlot) throw new NotFoundException('Slot not found');
    appointment.slot = newSlot;
    appointment.status = 'rescheduled';
    await this.appointmentRepository.save(appointment);
    return appointment;
  }

  async cancelAppointment(id: string, user: any) {
    const appointment = await this.appointmentRepository.findOne({ where: { id }, relations: ['patient'] });
    if (!appointment) throw new NotFoundException('Appointment not found');
    if (appointment.patient.id !== user.sub) throw new ForbiddenException('You can only cancel your own appointments');
    appointment.status = 'cancelled';
    await this.appointmentRepository.save(appointment);
    return { message: 'Appointment cancelled' };
  }

  async getPatientAppointments(patientId: string, user: any) {
    if (patientId !== user.sub) throw new ForbiddenException('You can only view your own appointments');
    return this.appointmentRepository.find({ where: { patient: { id: patientId } } });
  }

  async getDoctorAppointments(doctorId: string, user: any) {
    // Only allow doctor to view their own appointments
    if (doctorId !== user.sub) throw new ForbiddenException('You can only view your own appointments');
    return this.appointmentRepository.find({ where: { doctor: { id: doctorId } } });
  }
} 