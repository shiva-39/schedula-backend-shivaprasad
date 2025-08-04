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

  // --- TEMPLATE CREATION LOGIC ---
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

    // --- AUTO-GENERATE INITIAL SCHEDULES IF ENABLED ---
    if (saved.autoGenerate) {
      await this.generateSchedulesFromTemplate(saved.id, {});
    }

    return saved;
  }

  // --- GET ALL RECURRING SCHEDULES FOR A DOCTOR ---
  async getRecurringSchedules(doctorId: string) {
    return this.recurringScheduleRepo.find({
      where: { doctor: { id: doctorId } },
      order: { createdAt: 'DESC' },
    });
  }

  // --- GET A SPECIFIC RECURRING SCHEDULE ---
  async getRecurringSchedule(doctorId: string, recurringId: string) {
    const schedule = await this.recurringScheduleRepo.findOne({
      where: { id: recurringId, doctor: { id: doctorId } },
    });
    if (!schedule) {
      throw new NotFoundException('Recurring schedule not found');
    }
    return schedule;
  }

  // --- UPDATE RECURRING SCHEDULE TEMPLATE LOGIC ---
  async updateRecurringSchedule(
    doctorId: string,
    recurringId: string,
    dto: UpdateRecurringScheduleDto,
  ) {
    const schedule = await this.getRecurringSchedule(doctorId, recurringId);

    // --- VALIDATE TIME RESTRICTIONS FOR REGENERATION (EDGE CASE) ---
    if (dto.regenerateFuture && !dto.bypassTimeRestrictions) {
      this.validateTemplateUpdateRestrictions(schedule, dto.regenerateFuture, dto);
    }

    // --- UPDATE FIELDS ---
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

    // --- REGENERATE FUTURE SCHEDULES IF REQUESTED ---
    if (dto.regenerateFuture) {
      await this.regenerateFutureSchedules(updated.id);
    }

    return updated;
  }

  // --- DELETE RECURRING SCHEDULE TEMPLATE LOGIC ---
  async deleteRecurringSchedule(
    doctorId: string,
    recurringId: string,
    deleteFutureSchedules = false,
  ) {
    const schedule = await this.getRecurringSchedule(doctorId, recurringId);

    if (deleteFutureSchedules) {
      // --- DELETE ALL FUTURE GENERATED SCHEDULES FROM THIS TEMPLATE ---
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

  // --- GENERATE DAILY SCHEDULES FROM TEMPLATE LOGIC ---
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

    // --- ITERATE THROUGH EACH DAY IN THE RANGE ---
    for (
      let currentDate = new Date(startDate);
      currentDate <= endDate;
      currentDate.setDate(currentDate.getDate() + 1)
    ) {
      const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 1 = Monday, etc.

      // --- CHECK IF THIS DAY IS INCLUDED IN THE TEMPLATE ---
      if (!template.daysOfWeek.includes(dayOfWeek)) {
        continue;
      }

      const dateString = formatDate(currentDate);

      // --- CHECK IF SCHEDULE ALREADY EXISTS FOR THIS DATE ---
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

      // --- CREATE OR UPDATE THE DAILY SCHEDULE ---
      let dailySchedule: ElasticScheduleEntity;

      if (existingSchedule && dto.overrideExisting) {
        // --- UPDATE EXISTING SCHEDULE WITH TEMPLATE VALUES ---
        existingSchedule.startTime = template.startTime;
        existingSchedule.endTime = template.endTime;
        existingSchedule.slotDuration = template.slotDuration;
        existingSchedule.bufferTime = template.bufferTime;
        existingSchedule.maxAppointments = template.maxAppointments;
        existingSchedule.recurringTemplateId = template.id;
        existingSchedule.isOverride = false; // Reset override flag
        dailySchedule = await this.elasticScheduleRepo.save(existingSchedule);
      } else {
        // --- CREATE NEW SCHEDULE ---
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

    // --- UPDATE THE LAST GENERATED DATE ---
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

  // --- REGENERATE FUTURE SCHEDULES FROM TODAY LOGIC ---
  async regenerateFutureSchedules(recurringId: string) {
    const template = await this.recurringScheduleRepo.findOne({
      where: { id: recurringId },
      relations: ['doctor'],
    });

    if (!template) {
      throw new NotFoundException('Recurring schedule template not found');
    }

    const today = getCurrentDate();

    // --- DELETE FUTURE SCHEDULES THAT WERE GENERATED FROM THIS TEMPLATE ---
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

  // --- GET UPCOMING SCHEDULES FROM TEMPLATE LOGIC ---
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

    // --- FILTER SCHEDULES THAT MATCH THIS TEMPLATE'S DAYS OF WEEK ---
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

  // --- CREATE ONE-TIME OVERRIDE FOR A SPECIFIC DATE LOGIC ---
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

    // --- VALIDATE TIME RESTRICTIONS FOR DATE OVERRIDES (EDGE CASE) ---
    if (!bypassTimeRestrictions) {
      this.validateOverrideTimeRestrictions(date, overrides, template);
    }

    // --- CHECK IF THE DATE MATCHES THE TEMPLATE'S DAYS OF WEEK ---
    const targetDate = new Date(date);
    const dayOfWeek = targetDate.getDay();

    if (!template.daysOfWeek.includes(dayOfWeek)) {
      throw new ConflictException(
        'Override date does not match template days of week',
      );
    }

    // --- FIND EXISTING SCHEDULE FOR THIS DATE ---
    let schedule = await this.elasticScheduleRepo.findOne({
      where: {
        doctor: { id: doctorId },
        date: date,
      },
    });

    if (schedule) {
      // --- UPDATE EXISTING SCHEDULE WITH OVERRIDES ---
      Object.assign(schedule, overrides);
      schedule.isOverride = true;
      if (reason) {
        schedule.overrideReason = reason;
      }
      schedule = await this.elasticScheduleRepo.save(schedule);
    } else {
      // --- CREATE NEW SCHEDULE WITH TEMPLATE DEFAULTS AND OVERRIDES ---
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

  // --- AUTO-GENERATE SCHEDULES FOR ALL ACTIVE TEMPLATES LOGIC ---
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

  // --- VALIDATE DATE OVERRIDE TIME RESTRICTIONS (2-HOUR RULE, FUTURE ONLY) ---
  private validateOverrideTimeRestrictions(
    date: string,
    overrides: Partial<ElasticScheduleEntity>,
    template: RecurringScheduleEntity,
  ) {
    const today = getCurrentLocalDate(); // Use local date for business logic

    // --- CHECK IF TRYING TO OVERRIDE PAST DATES ---
    if (date < today) {
      throw new ConflictException('Cannot create overrides for past dates');
    }

    // --- FOR TODAY'S OVERRIDE, CHECK 2-HOUR ADVANCE NOTICE ---
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

  // --- VALIDATE TEMPLATE UPDATE TIME RESTRICTIONS (2-HOUR RULE) ---
  private validateTemplateUpdateRestrictions(
    template: RecurringScheduleEntity,
    regenerateFuture: boolean,
    dto?: UpdateRecurringScheduleDto,
  ) {
    if (!regenerateFuture) return; // No validation needed if not regenerating

    const now = new Date();
    const today = getCurrentLocalDate(); // Use local date for business logic
    const currentDayOfWeek = now.getDay();

    // --- CHECK IF TODAY IS ONE OF THE TEMPLATE'S ACTIVE DAYS ---
    if (template.daysOfWeek.includes(currentDayOfWeek)) {
      const currentTime = getCurrentLocalTime(); // Use local time for business logic
      // --- USE NEW STARTTIME IF PROVIDED IN UPDATE, OTHERWISE USE TEMPLATE'S CURRENT STARTTIME ---
      const sessionStartTime = dto?.startTime || template.startTime;

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

  // --- CONVERTS TIME STRING (HH:MM) TO MINUTES SINCE MIDNIGHT ---
  private timeToMinutes(timeString: string): number {
    return timeToMinutes(timeString);
  }
}
