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

    const savedSchedule = await this.elasticScheduleRepo.save(elasticSchedule);

    // Handle automatic appointment rescheduling if requested
    if (dto.adjustExisting) {
      await this.rescheduleExistingAppointments(doctorId, dto.date, savedSchedule);
    }

    return savedSchedule;
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

    // Store old schedule values for comparison
    const oldStartTime = schedule.startTime;
    const oldEndTime = schedule.endTime;

    // Update the schedule
    Object.assign(schedule, dto);
    const updatedSchedule = await this.elasticScheduleRepo.save(schedule);

    // Handle automatic appointment rescheduling if requested
    if (dto.adjustExisting && (dto.startTime !== oldStartTime || dto.endTime !== oldEndTime)) {
      await this.rescheduleExistingAppointments(doctorId, schedule.date, schedule);
    }

    return updatedSchedule;
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

  async getAvailableSlots(doctorId: string, date: string) {
    // Check for elastic schedule first - prioritize manual overrides (null recurringTemplateId) over auto-generated ones
    const elasticSchedules = await this.elasticScheduleRepo.find({
      where: {
        doctor: { id: doctorId },
        date: date,
      },
      order: {
        createdAt: 'DESC' // Get most recent first
      }
    });

    let elasticSchedule;
    if (elasticSchedules.length > 0) {
      // Prioritize manual overrides (null recurringTemplateId) over auto-generated ones
      elasticSchedule = elasticSchedules.find(s => s.recurringTemplateId === null) || elasticSchedules[0];
    }

    let schedule;
    if (elasticSchedule) {
      schedule = elasticSchedule;
    } else {
      // Fall back to recurring schedule
      const recurringSchedules = await this.dataSource.getRepository('RecurringSchedule').find({
        where: { doctor: { id: doctorId } },
      });
      
      if (recurringSchedules.length === 0) {
        return { availableSlots: [], message: 'No schedule found for this date' };
      }
      
      schedule = recurringSchedules[0]; // Use first recurring schedule
    }

    // Get booked appointments for this date
    const appointments = await this.dataSource.getRepository('Appointment').find({
      where: {
        doctor: { id: doctorId },
        date: date,
      },
    });

    const bookedSlots = new Set<string>();
    for (const appointment of appointments) {
      if (appointment.startTime && appointment.endTime) {
        bookedSlots.add(`${appointment.startTime}-${appointment.endTime}`);
      }
    }

    // Generate available slots
    const availableSlots: { startTime: string; endTime: string }[] = [];
    const slotDuration = schedule.slotDuration;
    const buffer = schedule.bufferTime || 0;
    const start = schedule.startTime;
    const end = schedule.endTime;
    
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
      if (!bookedSlots.has(`${slotStart}-${slotEnd}`)) {
        availableSlots.push({ startTime: slotStart, endTime: slotEnd });
      }
      current += slotDuration + buffer;
    }
    
    return { 
      availableSlots, 
      date,
      scheduleType: elasticSchedule ? 'elastic' : 'recurring',
      schedule: {
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        slotDuration: schedule.slotDuration,
        bufferTime: schedule.bufferTime
      }
    };
  }

  async rescheduleExistingAppointments(doctorId: string, date: string, newSchedule: any) {
    // Get all appointments for this doctor on this date
    const appointments = await this.dataSource.getRepository('Appointment').find({
      where: {
        doctor: { id: doctorId },
        date: date,
        status: 'scheduled'
      },
      relations: ['patient', 'patient.user']
    });

    if (appointments.length === 0) {
      return { message: 'No appointments to reschedule', rescheduled: [] };
    }

    // Generate available slots in the new schedule
    const toMinutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const fromMinutes = (m: number) => { 
      const h = Math.floor(m / 60).toString().padStart(2, '0'); 
      const min = (m % 60).toString().padStart(2, '0'); 
      return `${h}:${min}`; 
    };

    const startMin = toMinutes(newSchedule.startTime);
    const endMin = toMinutes(newSchedule.endTime);
    const slotDuration = newSchedule.slotDuration;
    const buffer = newSchedule.bufferTime || 0;

    // Generate all possible slots
    const availableSlots: Array<{ startTime: string; endTime: string }> = [];
    let current = startMin;
    while (current + slotDuration <= endMin) {
      const slotStart = fromMinutes(current);
      const slotEnd = fromMinutes(current + slotDuration);
      availableSlots.push({ startTime: slotStart, endTime: slotEnd });
      current += slotDuration + buffer;
    }

    // Check if we have enough slots for all appointments
    const appointmentsToReschedule = appointments;
    const canFitInSlots = Math.min(appointmentsToReschedule.length, availableSlots.length);
    
    const rescheduledAppointments: Array<{ appointmentId: string; patientName: string; oldTime: string; newTime: string }> = [];
    const notifiedPatients: Array<{ appointmentId: string; patientName: string; oldTime: string; reason: string }> = [];
    const appointmentRepo = this.dataSource.getRepository('Appointment');

    // Reschedule appointments that can fit in available slots
    for (let i = 0; i < canFitInSlots; i++) {
      const appointment = appointmentsToReschedule[i];
      const newSlot = availableSlots[i];
      
      // Store old time for tracking
      const oldTime = `${appointment.startTime.toTimeString().substring(0, 5)}-${appointment.endTime.toTimeString().substring(0, 5)}`;
      
      // Update appointment times
      const appointmentDate = date;
      const newStartTimestamp = new Date(`${appointmentDate}T${newSlot.startTime}:00.000Z`);
      const newEndTimestamp = new Date(`${appointmentDate}T${newSlot.endTime}:00.000Z`);
      
      appointment.startTime = newStartTimestamp;
      appointment.endTime = newEndTimestamp;
      appointment.status = 'rescheduled';
      
      await appointmentRepo.save(appointment);
      
      rescheduledAppointments.push({
        appointmentId: appointment.id,
        patientName: appointment.patient?.user?.name || 'Unknown',
        oldTime: oldTime,
        newTime: `${newSlot.startTime}-${newSlot.endTime}`
      });
    }

    // Handle appointments that couldn't fit in the new schedule
    for (let i = canFitInSlots; i < appointmentsToReschedule.length; i++) {
      const appointment = appointmentsToReschedule[i];
      const oldTime = `${appointment.startTime.toTimeString().substring(0, 5)}-${appointment.endTime.toTimeString().substring(0, 5)}`;
      
      // Cancel the appointment and notify patient
      appointment.status = 'cancelled';
      appointment.cancellationReason = 'Doctor schedule updated - insufficient slots available';
      
      await appointmentRepo.save(appointment);
      
      notifiedPatients.push({
        appointmentId: appointment.id,
        patientName: appointment.patient?.user?.name || 'Unknown',
        oldTime: oldTime,
        reason: 'Schedule updated with fewer slots available. Please book a new appointment for afternoon, evening, or next day.'
      });
    }

    return {
      message: `Successfully rescheduled ${rescheduledAppointments.length} appointments. ${notifiedPatients.length} patients notified to book new slots.`,
      rescheduled: rescheduledAppointments,
      notifiedPatients: notifiedPatients,
      summary: {
        totalAppointments: appointmentsToReschedule.length,
        successfullyRescheduled: rescheduledAppointments.length,
        needsRebooking: notifiedPatients.length
      }
    };
  }
}
