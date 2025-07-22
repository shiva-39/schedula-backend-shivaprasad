import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ElasticScheduleEntity } from './elastic-schedule.entity';
import { Doctor } from '../doctor/doctor.entity';
import { CreateElasticScheduleDto } from './dto/create-elastic-schedule.dto';

@Injectable()
export class ElasticScheduleService {
  constructor(
    @InjectRepository(ElasticScheduleEntity)
    private readonly elasticScheduleRepo: Repository<ElasticScheduleEntity>,
    @InjectRepository(Doctor)
    private readonly doctorRepo: Repository<Doctor>
  ) {}

  async createSchedule(doctorId: string, dto: CreateElasticScheduleDto, user: any) {
    // Optionally check user is doctor and matches doctorId
    const doctor = await this.doctorRepo.findOne({ where: { id: doctorId } });
    if (!doctor) throw new Error('Doctor not found');
    const schedule = this.elasticScheduleRepo.create({
      doctor,
      date: dto.date,
      startTime: dto.startTime,
      endTime: dto.endTime,
      slotDuration: dto.slotDuration,
      bufferTime: dto.bufferTime,
      maxAppointments: dto.maxAppointments,
    });
    return this.elasticScheduleRepo.save(schedule);
  }

  async getElasticSlots(doctorId: string, date: string): Promise<{ startTime: string; endTime: string }[]> {
    // Find schedule for doctor and date
    const schedule = await this.elasticScheduleRepo.findOne({ where: { doctor: { id: doctorId }, date } });
    if (!schedule) return [];

    // Get all appointments for the doctor on that day
    // Assuming you have an Appointment entity and repository
    // You may need to inject Appointment repository in the constructor
    // For now, use dynamic import
    const { Appointment } = await import('../appointment.entity');
    const { getRepository } = await import('typeorm');
    const appointmentRepo = getRepository(Appointment);
    const appointments = await appointmentRepo.find({ where: { doctor: { id: doctorId }, date } });

    // Build a set of booked time ranges
    const bookedSlots = new Set<string>();
    for (const appt of appointments) {
      bookedSlots.add(`${appt.startTime}-${appt.endTime}`);
    }

    // Calculate available slots
    const slots: { startTime: string; endTime: string }[] = [];
    const start = schedule.startTime;
    const end = schedule.endTime;
    const slotDuration = schedule.slotDuration;
    const buffer = schedule.bufferTime || 0;

    // Convert time strings to minutes
    const toMinutes = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };
    const fromMinutes = (m: number) => {
      const h = Math.floor(m / 60).toString().padStart(2, '0');
      const min = (m % 60).toString().padStart(2, '0');
      return `${h}:${min}`;
    };
    let current = toMinutes(start);
    const endMin = toMinutes(end);
    while (current + slotDuration <= endMin) {
      const slotStart = fromMinutes(current);
      const slotEnd = fromMinutes(current + slotDuration);
      // Check if slot is booked
      if (!bookedSlots.has(`${slotStart}-${slotEnd}`)) {
        slots.push({ startTime: slotStart, endTime: slotEnd });
      }
      current += slotDuration + buffer;
    }
    return slots;
  }
}
