import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RecurringScheduleEntity } from './recurring-schedule.entity';
import { ElasticScheduleEntity } from './elastic-schedule.entity';
import { CreateRecurringScheduleDto } from './dto/create-recurring-schedule.dto';
import { UpdateRecurringScheduleDto } from './dto/update-recurring-schedule.dto';
import { GenerateSchedulesDto } from './dto/generate-schedules.dto';
import { CreateDateOverrideDto } from './dto/create-date-override.dto';
import { 
  getCurrentDate, 
  getCurrentLocalDate,
  getCurrentTime, 
  getCurrentLocalTime,
  timeToMinutes, 
  minutesToTime,
  formatDate,
  formatTime
} from '../utils/time-utils';

@Injectable()
export class RecurringScheduleService {
  constructor(
    @InjectRepository(RecurringScheduleEntity)
    private readonly recurringScheduleRepo: Repository<RecurringScheduleEntity>,
    @InjectRepository(ElasticScheduleEntity)
    private readonly elasticScheduleRepo: Repository<ElasticScheduleEntity>,
  ) {}

  /**
   * Create a new recurring schedule template
   */
  async createRecurringSchedule(
    doctorId: string,
    dto: CreateRecurringScheduleDto,
  ) {
    const recurringSchedule = this.recurringScheduleRepo.create({
      doctor: { id: doctorId } as any,
      name: dto.name,
      startTime: dto.startTime,
      endTime: dto.endTime,
      slotDuration: dto.slotDuration,
      bufferTime: dto.bufferTime,
      maxAppointments: dto.maxAppointments,
      daysOfWeek: dto.daysOfWeek,
      weeksAhead: dto.weeksAhead || 4,
      allowOverrides: dto.allowOverrides !== false, // default true
      autoGenerate: dto.autoGenerate !== false, // default true
    });

    const saved = await this.recurringScheduleRepo.save(recurringSchedule);

    // Auto-generate initial schedules if enabled
    if (saved.autoGenerate) {
      await this.generateSchedulesFromTemplate(saved.id, {});
    }

    return saved;
  }

  /**
   * Get all recurring schedules for a doctor
   */
  async getRecurringSchedules(doctorId: string) {
    return this.recurringScheduleRepo.find({
      where: { doctor: { id: doctorId } },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get a specific recurring schedule
   */
  async getRecurringSchedule(doctorId: string, recurringId: string) {
    const schedule = await this.recurringScheduleRepo.findOne({
      where: { id: recurringId, doctor: { id: doctorId } },
    });
    if (!schedule) {
      throw new NotFoundException('Recurring schedule not found');
    }
    return schedule;
  }

  /**
   * Update a recurring schedule template
   */
  async updateRecurringSchedule(
    doctorId: string,
    recurringId: string,
    dto: UpdateRecurringScheduleDto,
  ) {
    const schedule = await this.getRecurringSchedule(doctorId, recurringId);

    // Validate time restrictions if regenerating future schedules (unless bypassed)
    if (dto.regenerateFuture && !dto.bypassTimeRestrictions) {
      this.validateTemplateUpdateRestrictions(schedule, dto.regenerateFuture);
    }

    // Update fields
    if (dto.name !== undefined) schedule.name = dto.name;
    if (dto.startTime !== undefined) schedule.startTime = dto.startTime;
    if (dto.endTime !== undefined) schedule.endTime = dto.endTime;
    if (dto.slotDuration !== undefined)
      schedule.slotDuration = dto.slotDuration;
    if (dto.bufferTime !== undefined) schedule.bufferTime = dto.bufferTime;
    if (dto.maxAppointments !== undefined)
      schedule.maxAppointments = dto.maxAppointments;
    if (dto.daysOfWeek !== undefined) schedule.daysOfWeek = dto.daysOfWeek;
    if (dto.weeksAhead !== undefined) schedule.weeksAhead = dto.weeksAhead;
    if (dto.isActive !== undefined) schedule.isActive = dto.isActive;
    if (dto.allowOverrides !== undefined)
      schedule.allowOverrides = dto.allowOverrides;
    if (dto.autoGenerate !== undefined)
      schedule.autoGenerate = dto.autoGenerate;

    const updated = await this.recurringScheduleRepo.save(schedule);

    // Regenerate future schedules if requested
    if (dto.regenerateFuture) {
      await this.regenerateFutureSchedules(updated.id);
    }

    return updated;
  }

  /**
   * Delete a recurring schedule template
   */
  async deleteRecurringSchedule(
    doctorId: string,
    recurringId: string,
    deleteFutureSchedules = false,
  ) {
    const schedule = await this.getRecurringSchedule(doctorId, recurringId);

    if (deleteFutureSchedules) {
      // Delete all future generated schedules from this template
      const today = getCurrentDate();
      const deleteFromDate = schedule.lastGeneratedDate || today;
      
      await this.elasticScheduleRepo
        .createQueryBuilder()
        .delete()
        .from(ElasticScheduleEntity)
        .where('doctorId = :doctorId', { doctorId })
        .andWhere('recurringTemplateId = :templateId', { templateId: recurringId })
        .andWhere('date >= :fromDate', { fromDate: deleteFromDate })
        .execute();
    }

    await this.recurringScheduleRepo.remove(schedule);
    return { message: 'Recurring schedule deleted successfully' };
  }

  /**
   * Generate daily schedules from a recurring template
   */
  async generateSchedulesFromTemplate(
    recurringId: string,
    dto: GenerateSchedulesDto,
  ) {
    const template = await this.recurringScheduleRepo.findOne({
      where: { id: recurringId },
      relations: ['doctor'],
    });

    if (!template) {
      throw new NotFoundException('Recurring schedule template not found');
    }

    if (!template.isActive) {
      throw new ConflictException(
        'Cannot generate schedules from inactive template',
      );
    }

    const startDate = dto.startDate ? new Date(dto.startDate) : new Date();
    const endDate = dto.endDate
      ? new Date(dto.endDate)
      : new Date(
          startDate.getTime() + template.weeksAhead * 7 * 24 * 60 * 60 * 1000,
        );

    const generatedSchedules: ElasticScheduleEntity[] = [];
    const skippedDates: string[] = [];

    // Iterate through each day in the range
    for (
      let currentDate = new Date(startDate);
      currentDate <= endDate;
      currentDate.setDate(currentDate.getDate() + 1)
    ) {
      const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 1 = Monday, etc.

      // Check if this day is included in the template
      if (!template.daysOfWeek.includes(dayOfWeek)) {
        continue;
      }

      const dateString = formatDate(currentDate);

      // Check if schedule already exists for this date
      const existingSchedule = await this.elasticScheduleRepo.findOne({
        where: {
          doctor: { id: template.doctor.id },
          date: dateString,
        },
      });

      if (existingSchedule && !dto.overrideExisting) {
        skippedDates.push(dateString);
        continue;
      }

      // Create or update the daily schedule
      let dailySchedule: ElasticScheduleEntity;

      if (existingSchedule && dto.overrideExisting) {
        // Update existing schedule with template values
        existingSchedule.startTime = template.startTime;
        existingSchedule.endTime = template.endTime;
        existingSchedule.slotDuration = template.slotDuration;
        existingSchedule.bufferTime = template.bufferTime;
        existingSchedule.maxAppointments = template.maxAppointments;
        existingSchedule.recurringTemplateId = template.id;
        existingSchedule.isOverride = false; // Reset override flag
        dailySchedule = await this.elasticScheduleRepo.save(existingSchedule);
      } else {
        // Create new schedule
        dailySchedule = this.elasticScheduleRepo.create({
          doctor: template.doctor,
          date: dateString,
          startTime: template.startTime,
          endTime: template.endTime,
          slotDuration: template.slotDuration,
          bufferTime: template.bufferTime,
          maxAppointments: template.maxAppointments,
          recurringTemplateId: template.id,
          isOverride: false,
        });
        dailySchedule = await this.elasticScheduleRepo.save(dailySchedule);
      }

      generatedSchedules.push(dailySchedule);
    }

    // Update the last generated date
    template.lastGeneratedDate = formatDate(endDate);
    await this.recurringScheduleRepo.save(template);

    return {
      message: `Generated ${generatedSchedules.length} schedules`,
      generated: generatedSchedules.length,
      skipped: skippedDates.length,
      skippedDates,
      schedules: generatedSchedules,
    };
  }

  /**
   * Regenerate future schedules from today onwards
   */
  async regenerateFutureSchedules(recurringId: string) {
    const template = await this.recurringScheduleRepo.findOne({
      where: { id: recurringId },
      relations: ['doctor'],
    });

    if (!template) {
      throw new NotFoundException('Recurring schedule template not found');
    }

    const today = getCurrentDate();

    // Delete future schedules that were generated from this template
    await this.elasticScheduleRepo
      .createQueryBuilder()
      .delete()
      .from(ElasticScheduleEntity)
      .where('doctorId = :doctorId', { doctorId: template.doctor.id })
      .andWhere('recurringTemplateId = :templateId', { templateId: template.id })
      .andWhere('date >= :today', { today })
      .execute();
      
    return this.generateSchedulesFromTemplate(recurringId, {
      startDate: today,
      overrideExisting: true,
    });
  }

  /**
   * Get upcoming schedules generated from a template
   */
  async getGeneratedSchedules(
    doctorId: string,
    recurringId: string,
    days = 30,
  ) {
    const template = await this.getRecurringSchedule(doctorId, recurringId);

    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000);

    const schedules = await this.elasticScheduleRepo
      .createQueryBuilder('schedule')
      .where('schedule.doctorId = :doctorId', { doctorId })
      .andWhere('schedule.date >= :startDate', {
        startDate: formatDate(startDate),
      })
      .andWhere('schedule.date <= :endDate', {
        endDate: formatDate(endDate),
      })
      .orderBy('schedule.date', 'ASC')
      .getMany();

    // Filter schedules that match this template's days of week
    const matchingSchedules = schedules.filter((schedule) => {
      const scheduleDate = new Date(schedule.date);
      const dayOfWeek = scheduleDate.getDay();
      return template.daysOfWeek.includes(dayOfWeek);
    });

    return {
      template: template,
      schedules: matchingSchedules,
      total: matchingSchedules.length,
    };
  }

  /**
   * Create a one-time override for a specific date
   */
  async createDateOverride(
    doctorId: string,
    recurringId: string,
    createDateOverrideDto: CreateDateOverrideDto,
  ) {
    const { date, reason, bypassTimeRestrictions, ...overrides } =
      createDateOverrideDto;
    const template = await this.getRecurringSchedule(doctorId, recurringId);

    if (!template.allowOverrides) {
      throw new ConflictException(
        'This template does not allow date overrides',
      );
    }

    // Validate time restrictions for date overrides unless bypassed
    if (!bypassTimeRestrictions) {
      this.validateOverrideTimeRestrictions(date, overrides, template);
    }

    // Check if the date matches the template's days of week
    const targetDate = new Date(date);
    const dayOfWeek = targetDate.getDay();

    if (!template.daysOfWeek.includes(dayOfWeek)) {
      throw new ConflictException(
        'Override date does not match template days of week',
      );
    }

    // Find existing schedule for this date
    let schedule = await this.elasticScheduleRepo.findOne({
      where: {
        doctor: { id: doctorId },
        date: date,
      },
    });

    if (schedule) {
      // Update existing schedule with overrides
      Object.assign(schedule, overrides);
      schedule.isOverride = true;
      if (reason) {
        schedule.overrideReason = reason;
      }
      schedule = await this.elasticScheduleRepo.save(schedule);
    } else {
      // Create new schedule with template defaults and overrides
      schedule = this.elasticScheduleRepo.create({
        doctor: { id: doctorId } as any,
        date: date,
        startTime: overrides.startTime || template.startTime,
        endTime: overrides.endTime || template.endTime,
        slotDuration: overrides.slotDuration || template.slotDuration,
        bufferTime: overrides.bufferTime || template.bufferTime,
        maxAppointments: overrides.maxAppointments || template.maxAppointments,
        recurringTemplateId: template.id,
        isOverride: true,
        ...(reason && { overrideReason: reason }),
      });
      schedule = await this.elasticScheduleRepo.save(schedule);
    }

    return {
      message: 'Date override created successfully',
      schedule: schedule,
    };
  }

  /**
   * Run auto-generation for all active templates (could be called by a cron job)
   */
  async autoGenerateAllSchedules() {
    const activeTemplates = await this.recurringScheduleRepo.find({
      where: { isActive: true, autoGenerate: true },
      relations: ['doctor'],
    });

    const results: any[] = [];

    for (const template of activeTemplates) {
      try {
        const result = await this.generateSchedulesFromTemplate(
          template.id,
          {},
        );
        results.push({
          templateId: template.id,
          templateName: template.name,
          doctorId: template.doctor.id,
          ...result,
        });
      } catch (error: any) {
        results.push({
          templateId: template.id,
          templateName: template.name,
          doctorId: template.doctor.id,
          error: error.message,
        });
      }
    }

    return {
      message: `Auto-generation completed for ${activeTemplates.length} templates`,
      results,
    };
  }

  /**
   * Validates that date overrides comply with time restrictions
   * - Only today or future dates can be overridden
   * - Overrides must be at least 2 hours before session start time
   */
  private validateOverrideTimeRestrictions(
    date: string,
    overrides: Partial<ElasticScheduleEntity>,
    template: RecurringScheduleEntity,
  ) {
    const today = getCurrentLocalDate(); // Use local date for business logic

    // Check if trying to override past dates
    if (date < today) {
      throw new ConflictException('Cannot create overrides for past dates');
    }

    // For today's override, check 2-hour advance notice
    if (date === today) {
      const currentTime = getCurrentLocalTime(); // Use local time for business logic
      const sessionStartTime = overrides.startTime || template.startTime;

      const currentMinutes = timeToMinutes(currentTime);
      const sessionStartMinutes = timeToMinutes(sessionStartTime);

      // Calculate time difference in minutes
      const timeDifference = sessionStartMinutes - currentMinutes;

      // Require at least 2 hours (120 minutes) advance notice
      if (timeDifference < 120) {
        throw new ConflictException(
          `Cannot create override for today's schedule. Overrides must be created at least 2 hours before session start time. ` +
            `Current time: ${currentTime}, Session starts: ${sessionStartTime}`,
        );
      }
    }
  }

  /**
   * Validates that template updates affecting today's schedules comply with time restrictions
   */
  private validateTemplateUpdateRestrictions(
    template: RecurringScheduleEntity,
    regenerateFuture: boolean,
  ) {
    if (!regenerateFuture) return; // No validation needed if not regenerating

    const now = new Date();
    const today = getCurrentLocalDate(); // Use local date for business logic
    const currentDayOfWeek = now.getDay();

    // Check if today is one of the template's active days
    if (template.daysOfWeek.includes(currentDayOfWeek)) {
      const currentTime = getCurrentLocalTime(); // Use local time for business logic
      const sessionStartTime = template.startTime;

      const currentMinutes = timeToMinutes(currentTime);
      const sessionStartMinutes = timeToMinutes(sessionStartTime);

      // Calculate time difference in minutes
      const timeDifference = sessionStartMinutes - currentMinutes;

      // Require at least 2 hours (120 minutes) advance notice
      if (timeDifference < 120) {
        throw new ConflictException(
          `Cannot regenerate today's schedule. Template updates affecting today must be made at least 2 hours before session start time. ` +
            `Current time: ${currentTime}, Session starts: ${sessionStartTime}. ` +
            `Update the template without regeneration, or wait until after today's session.`,
        );
      }
    }
  }

  /**
   * Converts time string (HH:MM) to minutes since midnight
   */
  private timeToMinutes(timeString: string): number {
    return timeToMinutes(timeString);
  }
}
