import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ElasticScheduleEntity } from './elastic-schedule.entity';
import { Appointment } from '../appointment.entity';
import { CreateElasticScheduleDto } from './dto/create-elastic-schedule.dto';

@Injectable()
export class ElasticScheduleService {
  constructor(
    @InjectRepository(ElasticScheduleEntity)
    private readonly elasticScheduleRepo: Repository<ElasticScheduleEntity>,
    @InjectRepository(Appointment)
    private readonly appointmentRepo: Repository<Appointment>
  ) {}

  async createSchedule(doctorId: string, dto: CreateElasticScheduleDto) {
    const schedule = this.elasticScheduleRepo.create({
      doctor: { id: doctorId } as any,
      date: dto.date,
      startTime: dto.startTime,
      endTime: dto.endTime,
      slotDuration: dto.slotDuration,
      bufferTime: dto.bufferTime,
      maxAppointments: dto.maxAppointments,
    });
    return this.elasticScheduleRepo.save(schedule);
  }

  async getAvailableSlots(doctorId: string, date: string) {
    const schedule = await this.elasticScheduleRepo.findOne({ where: { doctor: { id: doctorId }, date } });
    if (!schedule) return [];
    const appointments = await this.appointmentRepo.find({ where: { doctor: { id: doctorId }, date } });
    const bookedSlots = new Set<string>();
    for (const appt of appointments) {
      bookedSlots.add(`${appt.startTime}-${appt.endTime}`);
    }
    const slots: { startTime: string; endTime: string }[] = [];
    const toMinutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const fromMinutes = (m: number) => { const h = Math.floor(m / 60).toString().padStart(2, '0'); const min = (m % 60).toString().padStart(2, '0'); return `${h}:${min}`; };
    let current = toMinutes(schedule.startTime);
    const endMin = toMinutes(schedule.endTime);
    while (current + schedule.slotDuration <= endMin) {
      const slotStart = fromMinutes(current);
      const slotEnd = fromMinutes(current + schedule.slotDuration);
      if (!bookedSlots.has(`${slotStart}-${slotEnd}`)) {
        slots.push({ startTime: slotStart, endTime: slotEnd });
      }
      current += schedule.slotDuration + (schedule.bufferTime || 0);
    }
    return slots;
  }
}
