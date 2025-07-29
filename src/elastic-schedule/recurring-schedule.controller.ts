import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RoleGuard, Roles } from '../auth/role.guard';
import { RecurringScheduleService } from './recurring-schedule.service';
import { CreateRecurringScheduleDto } from './dto/create-recurring-schedule.dto';
import { UpdateRecurringScheduleDto } from './dto/update-recurring-schedule.dto';
import { CreateDateOverrideDto } from './dto/create-date-override.dto';
import { GenerateSchedulesDto } from './dto/generate-schedules.dto';

@Controller('api/doctors/:doctorId/recurring-schedules')
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles('doctor')
export class RecurringScheduleController {
  constructor(
    private readonly recurringScheduleService: RecurringScheduleService,
  ) {}

  /**
   * Create a new recurring schedule template
   * POST /api/doctors/:doctorId/recurring-schedules
   */
  @Post()
  async createRecurringSchedule(
    @Param('doctorId') doctorId: string,
    @Body() dto: CreateRecurringScheduleDto,
  ) {
    return this.recurringScheduleService.createRecurringSchedule(doctorId, dto);
  }

  /**
   * Get all recurring schedules for a doctor
   * GET /api/doctors/:doctorId/recurring-schedules
   */
  @Get()
  async getRecurringSchedules(@Param('doctorId') doctorId: string) {
    return this.recurringScheduleService.getRecurringSchedules(doctorId);
  }

  /**
   * Get a specific recurring schedule
   * GET /api/doctors/:doctorId/recurring-schedules/:recurringId
   */
  @Get(':recurringId')
  async getRecurringSchedule(
    @Param('doctorId') doctorId: string,
    @Param('recurringId') recurringId: string,
  ) {
    return this.recurringScheduleService.getRecurringSchedule(
      doctorId,
      recurringId,
    );
  }

  /**
   * Update a recurring schedule template
   * PATCH /api/doctors/:doctorId/recurring-schedules/:recurringId
   */
  @Patch(':recurringId')
  async updateRecurringSchedule(
    @Param('doctorId') doctorId: string,
    @Param('recurringId') recurringId: string,
    @Body() dto: UpdateRecurringScheduleDto,
  ) {
    return this.recurringScheduleService.updateRecurringSchedule(
      doctorId,
      recurringId,
      dto,
    );
  }

  /**
   * Delete a recurring schedule template
   * DELETE /api/doctors/:doctorId/recurring-schedules/:recurringId
   */
  @Delete(':recurringId')
  async deleteRecurringSchedule(
    @Param('doctorId') doctorId: string,
    @Param('recurringId') recurringId: string,
    @Query('deleteFuture') deleteFuture?: string,
  ) {
    const deleteFutureSchedules = deleteFuture === 'true';
    return this.recurringScheduleService.deleteRecurringSchedule(
      doctorId,
      recurringId,
      deleteFutureSchedules,
    );
  }

  /**
   * Manually generate schedules from a template
   * POST /api/doctors/:doctorId/recurring-schedules/:recurringId/generate
   */
  @Post(':recurringId/generate')
  async generateSchedules(
    @Param('doctorId') doctorId: string,
    @Param('recurringId') recurringId: string,
    @Body() dto: GenerateSchedulesDto,
  ) {
    return this.recurringScheduleService.generateSchedulesFromTemplate(
      recurringId,
      dto,
    );
  }

  /**
   * Get generated schedules from a template
   * GET /api/doctors/:doctorId/recurring-schedules/:recurringId/schedules
   */
  @Get(':recurringId/schedules')
  async getGeneratedSchedules(
    @Param('doctorId') doctorId: string,
    @Param('recurringId') recurringId: string,
    @Query('days') days?: string,
  ) {
    const daysCount = days ? parseInt(days, 10) : 30;
    return this.recurringScheduleService.getGeneratedSchedules(
      doctorId,
      recurringId,
      daysCount,
    );
  }

  /**
   * Create a one-time override for a specific date
   * POST /api/doctors/:doctorId/recurring-schedules/:recurringId/override
   */
  @Post(':recurringId/override')
  async createDateOverride(
    @Param('doctorId') doctorId: string,
    @Param('recurringId') recurringId: string,
    @Body() createDateOverrideDto: CreateDateOverrideDto,
  ) {
    return this.recurringScheduleService.createDateOverride(
      doctorId,
      recurringId,
      createDateOverrideDto,
    );
  }

  /**
   * Run auto-generation for all active templates (admin/cron endpoint)
   * POST /api/doctors/admin/auto-generate-all
   */
  @Post('/admin/auto-generate-all')
  @Roles('admin', 'doctor') // Allow admin or any doctor to trigger this
  async autoGenerateAll() {
    return this.recurringScheduleService.autoGenerateAllSchedules();
  }
}
