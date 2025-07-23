import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ElasticScheduleEntity } from './elastic-schedule.entity';
import { Appointment } from '../appointment.entity';
import { CreateElasticScheduleDto } from './dto/create-elastic-schedule.dto';
import { UpdateElasticScheduleDto } from './dto/update-elastic-schedule.dto';

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

  async updateSchedule(doctorId: string, scheduleId: string, dto: UpdateElasticScheduleDto) {
    const schedule = await this.elasticScheduleRepo.findOne({ where: { id: scheduleId, doctor: { id: doctorId } } });
    if (!schedule) throw new Error('Elastic schedule not found');
    if (dto.startTime !== undefined) schedule.startTime = dto.startTime;
    if (dto.endTime !== undefined) schedule.endTime = dto.endTime;
    if (dto.slotDuration !== undefined) schedule.slotDuration = dto.slotDuration;
    if (dto.bufferTime !== undefined) schedule.bufferTime = dto.bufferTime;
    if (dto.maxAppointments !== undefined) schedule.maxAppointments = dto.maxAppointments;
    if (dto.date !== undefined) schedule.date = dto.date;
    // Save the old slotDuration to detect reduction
    const oldSchedule = { ...schedule };
    await this.elasticScheduleRepo.save(schedule);
    // Auto-rescheduling logic with adjustExisting flag
    const appointments = await this.appointmentRepo.find({ where: { doctor: { id: doctorId }, elasticSchedule: { id: scheduleId }, date: schedule.date } });
    const toMinutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const fromMinutes = (m: number) => { const h = Math.floor(m / 60).toString().padStart(2, '0'); const min = (m % 60).toString().padStart(2, '0'); return `${h}:${min}`; };
    const startMin = toMinutes(schedule.startTime);
    const endMin = toMinutes(schedule.endTime);
    const slotDuration = schedule.slotDuration;
    const buffer = schedule.bufferTime || 0;
    // Build all possible slots
    let current = startMin;
    const possibleSlots: { startTime: string, endTime: string }[] = [];
    while (current + slotDuration <= endMin) {
      const slotStart = fromMinutes(current);
      const slotEnd = fromMinutes(current + slotDuration);
      possibleSlots.push({ startTime: slotStart, endTime: slotEnd });
      current += slotDuration + buffer;
    }

    // If slotDuration is reduced, update all future appointments to fit new shorter slots
    if (dto.slotDuration !== undefined && oldSchedule.slotDuration && dto.slotDuration < oldSchedule.slotDuration) {
      // Redistribute all appointments to new shorter slots
      for (let i = 0; i < appointments.length; i++) {
        if (i < possibleSlots.length) {
          const slot = possibleSlots[i];
          appointments[i].startTime = slot.startTime;
          appointments[i].endTime = slot.endTime;
          appointments[i].status = 'rescheduled';
          await this.appointmentRepo.save(appointments[i]);
        } else {
          // No slot available, mark as rescheduled and notify patient
          appointments[i].status = 'rescheduled';
          await this.appointmentRepo.save(appointments[i]);
        }
      }
      // Return early, since all appointments have been redistributed
      return schedule;
    }

    if (dto.adjustExisting) {
      // Redistribute all appointments to new slots (push entire queue)
      for (let i = 0; i < appointments.length; i++) {
        if (i < possibleSlots.length) {
          const slot = possibleSlots[i];
          appointments[i].startTime = slot.startTime;
          appointments[i].endTime = slot.endTime;
          appointments[i].status = 'rescheduled';
          await this.appointmentRepo.save(appointments[i]);
        } else {
          // No slot available, mark as rescheduled and notify patient
          appointments[i].status = 'rescheduled';
          await this.appointmentRepo.save(appointments[i]);
        }
      }
    } else {
      // Only reschedule conflicts, keep non-conflicting appointments
      const slotMap = new Map<string, Appointment | null>(possibleSlots.map(s => [`${s.startTime}-${s.endTime}`, null]));
      // Place existing appointments in slotMap if they fit
      for (const appt of appointments) {
        const key = `${appt.startTime}-${appt.endTime}`;
        if (slotMap.has(key)) {
          slotMap.set(key, appt);
        }
      }
      // Detect and reassign conflicts
      for (const appt of appointments) {
        const key = `${appt.startTime}-${appt.endTime}`;
        if (!slotMap.has(key) || slotMap.get(key) !== appt) {
          // Conflict: slot no longer exists or is double-booked
          appt.status = 'rescheduled';
          // Find next available slot
          const available = Array.from(slotMap.entries()).find(([k, v]) => v === null);
          if (available) {
            const [slotKey, _] = available;
            const [newStart, newEnd] = slotKey.split('-');
            appt.startTime = newStart;
            appt.endTime = newEnd;
            appt.status = 'rescheduled';
            slotMap.set(slotKey, appt);
            // Optionally notify patient here (e.g., send email)
          } else {
            // No available slot, keep as rescheduled and notify patient
          }
          await this.appointmentRepo.save(appt);
        }
      }
    }
    // Optionally notify doctor of all rescheduled appointments
    return schedule;
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
