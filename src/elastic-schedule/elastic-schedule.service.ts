import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { ElasticScheduleEntity } from './elastic-schedule.entity';
import { RecurringScheduleEntity } from './recurring-schedule.entity';
import { Doctor } from '../doctor/doctor.entity';
import { Appointment } from '../appointment.entity';
import { CreateElasticScheduleDto } from './dto/create-elastic-schedule.dto';
import { UpdateElasticScheduleDto } from './dto/update-elastic-schedule.dto';

@Injectable()
export class ElasticScheduleService {
  constructor(
    @InjectRepository(ElasticScheduleEntity)
    private readonly elasticScheduleRepo: Repository<ElasticScheduleEntity>,
    @InjectRepository(RecurringScheduleEntity)
    private readonly recurringScheduleRepo: Repository<RecurringScheduleEntity>,
    @InjectRepository(Doctor)
    private readonly doctorRepo: Repository<Doctor>,
    @InjectRepository(Appointment)
    private readonly appointmentRepo: Repository<Appointment>,
    private readonly dataSource: DataSource,
  ) {}

  // Create day-specific override schedule
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

  // Get all elastic schedules for a doctor
  async getSchedulesByDoctor(doctorId: string) {
    return await this.elasticScheduleRepo.find({
      where: { doctor: { id: doctorId } },
      order: { date: 'ASC', startTime: 'ASC' },
    });
  }

  // Get a specific elastic schedule by ID
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

  // Update elastic schedule (with optional rescheduling)
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

  // Delete elastic schedule
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

  // Get all elastic slots for a doctor on a date
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

  // Calculate available slots for a doctor on a date
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
      const recurringSchedules = await this.recurringScheduleRepo.find({
        where: { doctor: { id: doctorId } },
      });
      
      if (recurringSchedules.length === 0) {
        return { availableSlots: [], message: 'No schedule found for this date' };
      }
      
      schedule = recurringSchedules[0]; // Use first recurring schedule
    }

    // Get booked appointments for this date (excluding cancelled appointments)
    const appointments = await this.appointmentRepo.find({
      where: {
        doctor: { id: doctorId },
        date: date,
        status: In(['scheduled', 'rescheduled']), // Exclude cancelled appointments
      },
      relations: ['patient'], // Load patient relation for debug info
    });

    const bookedSlots = new Set<string>();
    for (const appointment of appointments) {
      if (appointment.startTime && appointment.endTime) {
        // Extract time in HH:MM format from UTC timestamp properly
        const startTimeStr = appointment.startTime.toISOString().substring(11, 16);
        const endTimeStr = appointment.endTime.toISOString().substring(11, 16);
        bookedSlots.add(`${startTimeStr}-${endTimeStr}`);
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

  // Intelligent rescheduling engine (preserves fitting appointments, handles overflow)
  async rescheduleExistingAppointments(doctorId: string, date: string, newSchedule: any) {
    // Get all appointments for this doctor on this date
    const appointments = await this.appointmentRepo.find({
      where: {
        doctor: { id: doctorId },
        date: date,
        status: In(['scheduled', 'rescheduled']) // Include both statuses
      },
      relations: ['patient', 'patient.user'],
      order: { startTime: 'ASC' } // Sort by start time for FIFO processing
    });

    if (appointments.length === 0) {
      return { message: 'No appointments to reschedule', rescheduled: [] };
    }

    // Helper functions
    const toMinutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const scheduleStartMin = toMinutes(newSchedule.startTime);
    const scheduleEndMin = toMinutes(newSchedule.endTime);

    // Categorize appointments: those that fit vs. those that don't
    const appointmentsThatFit: typeof appointments = [];
    const appointmentsThatDontFit: typeof appointments = [];

    for (const appointment of appointments) {
      if (!appointment.startTime || !appointment.endTime) {
        appointmentsThatDontFit.push(appointment);
        continue;
      }

      const apptStart = appointment.startTime.toISOString().substring(11, 16);
      const apptEnd = appointment.endTime.toISOString().substring(11, 16);
      const apptStartMin = toMinutes(apptStart);
      const apptEndMin = toMinutes(apptEnd);

      // Check if appointment fits within new time boundaries
      const fitsInTimeRange = apptStartMin >= scheduleStartMin && apptEndMin <= scheduleEndMin;
      
      if (fitsInTimeRange) {
        appointmentsThatFit.push(appointment);
      } else {
        appointmentsThatDontFit.push(appointment);
      }
    }

    // Apply capacity constraints: if more appointments fit than maxAppointments allows
    const maxAppointments = newSchedule.maxAppointments || appointmentsThatFit.length;
    const appointmentsToKeep = appointmentsThatFit.slice(0, maxAppointments);
    const appointmentsExceedingCapacity = appointmentsThatFit.slice(maxAppointments);

    // Combine all appointments that need to be rescheduled/cancelled
    const appointmentsToHandle = [...appointmentsThatDontFit, ...appointmentsExceedingCapacity];

    const rescheduledAppointments: Array<{ appointmentId: string; patientName: string; oldTime: string; newTime: string }> = [];
    const cancelledAppointments: Array<{ appointmentId: string; patientName: string; oldTime: string; reason: string }> = [];

    // Process appointments that need to be handled
    for (const appointment of appointmentsToHandle) {
      const oldTime = appointment.startTime && appointment.endTime ? 
        `${appointment.startTime.toISOString().substring(11, 16)}-${appointment.endTime.toISOString().substring(11, 16)}` : 
        'Unknown';

      // For now, we'll cancel them (overflow detection will handle redistribution)
      // This is better than trying to fit them in wrong slots
      appointment.status = 'cancelled';
      await this.appointmentRepo.save(appointment);

      cancelledAppointments.push({
        appointmentId: appointment.id,
        patientName: appointment.patient?.name || 'Unknown',
        oldTime: oldTime,
        reason: appointmentsThatDontFit.includes(appointment) 
          ? 'Appointment outside new time boundaries'
          : 'Appointment exceeds capacity limit'
      });
    }

    // Log what we preserved
    const preservedAppointments = appointmentsToKeep.map(appt => ({
      appointmentId: appt.id,
      patientName: appt.patient?.name || 'Unknown',
      time: appt.startTime && appt.endTime ? 
        `${appt.startTime.toISOString().substring(11, 16)}-${appt.endTime.toISOString().substring(11, 16)}` : 
        'Unknown',
      reason: 'Fits within new schedule constraints'
    }));

    return {
      message: `Schedule adjustment completed. ${preservedAppointments.length} appointments preserved, ${cancelledAppointments.length} appointments marked for overflow redistribution.`,
      preserved: preservedAppointments,
      cancelled: cancelledAppointments,
      rescheduled: rescheduledAppointments, // Empty for now - overflow logic handles redistribution
      summary: {
        totalAppointments: appointments.length,
        preserved: preservedAppointments.length,
        cancelled: cancelledAppointments.length,
        maxCapacity: maxAppointments
      }
    };
  }
}
