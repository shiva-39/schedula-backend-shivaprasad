import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Appointment } from './appointment.entity';
import { ElasticScheduleEntity } from './elastic-schedule/elastic-schedule.entity';
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
    private readonly dataSource: DataSource,
    @InjectRepository(ElasticScheduleEntity)
    private readonly elasticScheduleRepo: Repository<ElasticScheduleEntity>,
  ) {}

  async createAppointment(data: any, user: any) {
    // Detect elastic scheduling by elasticScheduleId field
    if (data.elasticScheduleId) {
      // Elastic slot booking
      return await this.dataSource.transaction(async manager => {
        const patient = await this.patientRepository.findOne({ where: { user: { id: user.sub } } });
        const doctor = await this.doctorRepository.findOne({ where: { id: data.doctorId } });
        const elasticSchedule = await this.elasticScheduleRepo.findOne({ where: { id: data.elasticScheduleId } });
        if (!patient || !doctor || !elasticSchedule) throw new NotFoundException('Invalid patient, doctor, or elastic schedule');

        // Use direct slot calculation here for atomicity
        const slotDuration = elasticSchedule.slotDuration;
        const buffer = elasticSchedule.bufferTime || 0;
        const start = elasticSchedule.startTime;
        const end = elasticSchedule.endTime;
        const toMinutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
        const fromMinutes = (m: number) => { const h = Math.floor(m / 60).toString().padStart(2, '0'); const min = (m % 60).toString().padStart(2, '0'); return `${h}:${min}`; };
        let current = toMinutes(start);
        const endMin = toMinutes(end);
        // Get all appointments for doctor on that date
        const appointments = await manager.find(Appointment, { where: { doctor: { id: doctor.id }, date: elasticSchedule.date } });
        const bookedSlots = new Set<string>();
        for (const appt of appointments) {
          bookedSlots.add(`${appt.startTime}-${appt.endTime}`);
        }
        let assignedSlot: { startTime: string; endTime: string } | null = null;
        while (current + slotDuration <= endMin) {
          const slotStart = fromMinutes(current);
          const slotEnd = fromMinutes(current + slotDuration);
          if (!bookedSlots.has(`${slotStart}-${slotEnd}`)) {
            assignedSlot = { startTime: slotStart, endTime: slotEnd };
            break;
          }
          current += slotDuration + buffer;
        }
        if (!assignedSlot) throw new ConflictException('No available slot in elastic schedule');
        // Create appointment
        const appointment = manager.create(Appointment, {
          patient,
          doctor,
          status: 'scheduled',
          startTime: assignedSlot.startTime,
          endTime: assignedSlot.endTime,
          elasticSchedule,
          date: elasticSchedule.date,
        });
        await manager.save(Appointment, appointment);
        return appointment;
      });
    } else {
      // Traditional slot booking
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
  }

  async rescheduleAppointment(id: string, data: any, user: any) {
    const appointment = await this.appointmentRepository.findOne({ where: { id }, relations: ['patient', 'patient.user', 'elasticSchedule'] });
    if (!appointment) throw new NotFoundException('Appointment not found');
    if (!appointment.patient || !appointment.patient.user) throw new NotFoundException('Patient or user not found');
    if (appointment.patient.user.id !== user.sub) throw new ForbiddenException('You can only reschedule your own appointments');
    if (appointment.elasticSchedule) {
      // Elastic slot reschedule: patient picks a new time
      const elasticSchedule = appointment.elasticSchedule;
      // Validate requested time is available
      const requestedStart = data.startTime;
      const requestedEnd = data.endTime;
      // Get all appointments for doctor on that date
      const appointments = await this.appointmentRepository.find({ where: { doctor: { id: appointment.doctor.id }, date: elasticSchedule.date } });
      const bookedSlots = new Set<string>();
      for (const appt of appointments) {
        bookedSlots.add(`${appt.startTime}-${appt.endTime}`);
      }
      if (bookedSlots.has(`${requestedStart}-${requestedEnd}`)) {
        throw new ConflictException('Requested slot is already booked');
      }
      appointment.startTime = requestedStart;
      appointment.endTime = requestedEnd;
      appointment.status = 'rescheduled';
      await this.appointmentRepository.save(appointment);
      return appointment;
    } else {
      // Traditional slot reschedule
      const newSlot = await this.slotRepository.findOne({ where: { id: data.slotId } });
      if (!newSlot) throw new NotFoundException('Slot not found');
      appointment.slot = newSlot;
      appointment.status = 'rescheduled';
      await this.appointmentRepository.save(appointment);
      return appointment;
    }
  }

  async cancelAppointment(id: string, user: any) {
    const appointment = await this.appointmentRepository.findOne({ where: { id }, relations: ['patient', 'patient.user'] });
    if (!appointment) throw new NotFoundException('Appointment not found');
    if (!appointment.patient || !appointment.patient.user) throw new NotFoundException('Patient or user not found');
    if (appointment.patient.user.id !== user.sub) throw new ForbiddenException('You can only cancel your own appointments');
    appointment.status = 'cancelled';
    await this.appointmentRepository.save(appointment);
    return { message: 'Appointment cancelled' };
  }

  async getPatientAppointments(patientId: string, user: any) {
    const patient = await this.patientRepository.findOne({ where: { id: patientId }, relations: ['user'] });
    if (!patient) throw new NotFoundException('Patient not found');
    if (!patient.user) throw new NotFoundException('User not found for patient');
    if (patient.user.id !== user.sub) throw new ForbiddenException('You can only view your own appointments');
    return this.appointmentRepository.find({ where: { patient: { id: patientId } } });
  }

  async getDoctorAppointments(doctorId: string, user: any) {
    const doctor = await this.doctorRepository.findOne({ where: { id: doctorId }, relations: ['user'] });
    if (!doctor) throw new NotFoundException('Doctor not found');
    if (!doctor.user) throw new NotFoundException('User not found for doctor');
    if (doctor.user.id !== user.sub) throw new ForbiddenException('You can only view your own appointments');
    return this.appointmentRepository.find({ where: { doctor: { id: doctorId } } });
  }
} 