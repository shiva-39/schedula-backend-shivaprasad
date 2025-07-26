import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ElasticScheduleEntity } from './elastic-schedule.entity';
import { Doctor } from '../doctor/doctor.entity';
import { Appointment } from '../appointment.entity';
import { CreateElasticScheduleDto } from './dto/create-elastic-schedule.dto';
import { UpdateElasticScheduleDto } from './dto/update-elastic-schedule.dto';

@Injectable()
export class ElasticScheduleService {
  constructor(
    @InjectRepository(ElasticScheduleEntity)
    private readonly elasticScheduleRepo: Repository<ElasticScheduleEntity>,
    @InjectRepository(Doctor)
    private readonly doctorRepo: Repository<Doctor>,
    @InjectRepository(Appointment)
    private readonly appointmentRepo: Repository<Appointment>,
    private readonly dataSource: DataSource,
  ) {}

  async createSchedule(doctorId: string, dto: CreateElasticScheduleDto, user: any) {
    const doctor = await this.doctorRepo.findOne({
      where: { id: doctorId },
      relations: ['user'],
    });

    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }

    if (doctor.user?.id !== user.sub) {
      throw new BadRequestException('You can only create schedules for yourself');
    }

    const elasticSchedule = this.elasticScheduleRepo.create({
      doctor: { id: doctorId },
      date: dto.date,
      startTime: dto.startTime,
      endTime: dto.endTime,
      slotDuration: dto.slotDuration,
      bufferTime: dto.bufferTime || 0,
      maxAppointments: dto.maxAppointments,
    });

    return await this.elasticScheduleRepo.save(elasticSchedule);
  }

  async getSchedulesByDoctor(doctorId: string) {
    return await this.elasticScheduleRepo.find({
      where: { doctor: { id: doctorId } },
      order: { date: 'ASC', startTime: 'ASC' },
    });
  }

  async getScheduleById(doctorId: string, scheduleId: string) {
    const schedule = await this.elasticScheduleRepo.findOne({
      where: {
        id: scheduleId,
        doctor: { id: doctorId },
      },
    });

    if (!schedule) {
      throw new NotFoundException('Elastic schedule not found');
    }

    return schedule;
  }

  async updateSchedule(doctorId: string, scheduleId: string, dto: UpdateElasticScheduleDto, user: any) {
    const schedule = await this.elasticScheduleRepo.findOne({
      where: {
        id: scheduleId,
        doctor: { id: doctorId },
      },
      relations: ['doctor', 'doctor.user'],
    });

    if (!schedule) {
      throw new NotFoundException('Elastic schedule not found');
    }

    if (schedule.doctor.user?.id !== user.sub) {
      throw new BadRequestException('You can only update your own schedules');
    }

    Object.assign(schedule, dto);
    return await this.elasticScheduleRepo.save(schedule);
  }

  async deleteSchedule(doctorId: string, scheduleId: string, user: any) {
    const schedule = await this.elasticScheduleRepo.findOne({
      where: {
        id: scheduleId,
        doctor: { id: doctorId },
      },
      relations: ['doctor', 'doctor.user'],
    });

    if (!schedule) {
      throw new NotFoundException('Elastic schedule not found');
    }

    if (schedule.doctor.user?.id !== user.sub) {
      throw new BadRequestException('You can only delete your own schedules');
    }

    await this.elasticScheduleRepo.remove(schedule);
    return { message: 'Elastic schedule deleted successfully' };
  }

  async getElasticSlots(doctorId: string, date: string) {
    const schedules = await this.elasticScheduleRepo.find({
      where: {
        doctor: { id: doctorId },
        date: date,
      },
    });

    return {
      date,
      schedules: schedules.map(schedule => ({
        id: schedule.id,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        slotDuration: schedule.slotDuration,
        maxAppointments: schedule.maxAppointments,
      })),
    };
  }
}
