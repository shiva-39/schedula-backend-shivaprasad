import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ElasticScheduleEntity } from './elastic-schedule.entity';
import { Doctor } from '../doctor/doctor.entity';

@Injectable()
export class ElasticScheduleAnalyticsService {
  constructor(
    @InjectRepository(ElasticScheduleEntity)
    private readonly elasticScheduleRepo: Repository<ElasticScheduleEntity>,
    @InjectRepository(Doctor)
    private readonly doctorRepo: Repository<Doctor>
  ) {}

  async getDoctorElasticStats(doctorId: string) {
    // Get all elastic schedules for doctor
    const schedules = await this.elasticScheduleRepo.find({ where: { doctor: { id: doctorId } } });
    let totalSlots = 0;
    let totalBooked = 0;
    for (const schedule of schedules) {
      // Calculate total slots for this schedule
      const slotDuration = schedule.slotDuration;
      const buffer = schedule.bufferTime || 0;
      const start = schedule.startTime;
      const end = schedule.endTime;
      const toMinutes = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
      };
      let current = toMinutes(start);
      const endMin = toMinutes(end);
      while (current + slotDuration <= endMin) {
        totalSlots++;
        current += slotDuration + buffer;
      }
      // Get booked slots for this schedule
      // You may need to inject Appointment repository for real data
      // For now, use dynamic import
      const { Appointment } = await import('../appointment.entity');
      const { getRepository } = await import('typeorm');
      const appointmentRepo = getRepository(Appointment);
      const appointments = await appointmentRepo.find({ where: { doctor: { id: doctorId }, date: schedule.date } });
      totalBooked += appointments.length;
    }
    const fillRate = totalSlots > 0 ? totalBooked / totalSlots : 0;
    let recommendation = '';
    if (fillRate < 0.5) {
      recommendation = 'Consider increasing slot duration or reducing window.';
    } else if (fillRate > 0.8) {
      recommendation = 'Consider reducing slot duration or increasing window.';
    } else {
      recommendation = 'Current settings are optimal.';
    }
    return {
      doctorId,
      totalSlots,
      totalBooked,
      fillRate,
      recommendation,
    };
  }

  async getAllDoctorsElasticStats() {
    const doctors = await this.doctorRepo.find();
    const stats: Array<{
      doctorId: string;
      totalSlots: number;
      totalBooked: number;
      fillRate: number;
      recommendation: string;
    }> = [];
    for (const doctor of doctors) {
      const stat = await this.getDoctorElasticStats(doctor.id);
      stats.push(stat);
    }
    return stats;
  }
}
