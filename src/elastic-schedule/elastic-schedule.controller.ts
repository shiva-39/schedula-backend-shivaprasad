import { Controller, Post, Get, Param, Body, UseGuards, Req, Query, Patch, Delete } from '@nestjs/common';
import { ElasticScheduleService } from './elastic-schedule.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateElasticScheduleDto } from './dto/create-elastic-schedule.dto';
import { UpdateElasticScheduleDto } from './dto/update-elastic-schedule.dto';

// Optional: import RolesGuard and Roles decorator if you have role-based guards
// import { RolesGuard } from '../auth/roles.guard';
// import { Roles } from '../auth/roles.decorator';

@Controller('api/doctors/:id')
export class ElasticScheduleController {
  constructor(private readonly elasticScheduleService: ElasticScheduleService) {}

  @UseGuards(JwtAuthGuard)
  @Post('elastic-schedule')
  async createElasticSchedule(
    @Param('id') doctorId: string,
    @Body() dto: CreateElasticScheduleDto,
    @Req() req
  ) {
    return this.elasticScheduleService.createSchedule(doctorId, dto, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('elastic-schedule')
  async getAllElasticSchedules(@Param('id') doctorId: string) {
    return this.elasticScheduleService.getSchedulesByDoctor(doctorId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('elastic-schedule/:scheduleId')
  async getElasticSchedule(
    @Param('id') doctorId: string,
    @Param('scheduleId') scheduleId: string
  ) {
    return this.elasticScheduleService.getScheduleById(doctorId, scheduleId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('elastic-schedule/:scheduleId')
  async updateElasticSchedule(
    @Param('id') doctorId: string,
    @Param('scheduleId') scheduleId: string,
    @Body() dto: UpdateElasticScheduleDto,
    @Req() req
  ) {
    return this.elasticScheduleService.updateSchedule(doctorId, scheduleId, dto, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('elastic-schedule/:scheduleId')
  async deleteElasticSchedule(
    @Param('id') doctorId: string,
    @Param('scheduleId') scheduleId: string,
    @Req() req
  ) {
    return this.elasticScheduleService.deleteSchedule(doctorId, scheduleId, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('elastic-slots')
  async getElasticSlots(
    @Param('id') doctorId: string, 
    @Query('date') date: string
  ) {
    return this.elasticScheduleService.getElasticSlots(doctorId, date);
  }

  @UseGuards(JwtAuthGuard)
  @Get('available-slots')
  async getAvailableSlots(
    @Param('id') doctorId: string, 
    @Query('date') date: string
  ) {
    return this.elasticScheduleService.getAvailableSlots(doctorId, date);
  }

  @UseGuards(JwtAuthGuard)
  @Post('reschedule-appointments')
  async rescheduleAppointments(
    @Param('id') doctorId: string,
    @Body() body: { date: string; newStartTime: string; newEndTime: string },
    @Req() req
  ) {
    // Create a temporary schedule object for rescheduling
    const newSchedule = {
      startTime: body.newStartTime,
      endTime: body.newEndTime,
      slotDuration: 30, // Default slot duration
      bufferTime: 5     // Default buffer time
    };
    
    return this.elasticScheduleService.rescheduleExistingAppointments(doctorId, body.date, newSchedule);
  }

  @UseGuards(JwtAuthGuard)
  @Post('shrink-schedule')
  async shrinkSchedule(
    @Param('id') doctorId: string,
    @Body() body: { 
      date: string; 
      newStartTime: string; 
      newEndTime: string; 
      bufferTime?: number; 
      maxAppointments?: number;
    },
    @Req() req
  ) {
    // Get existing appointments for this doctor and date
    const appointments = await this.elasticScheduleService.getAppointmentsForDate(doctorId, body.date);
    
    if (appointments.length === 0) {
      return {
        message: 'No appointments found for the specified date',
        appointments: []
      };
    }

    // Create new schedule object for shrinking
    const newSchedule = {
      startTime: body.newStartTime,
      endTime: body.newEndTime,
      bufferTime: body.bufferTime || 5,
      maxAppointments: body.maxAppointments
    };
    
    // Apply progressive fitting algorithm with automatic overflow handling
    return this.elasticScheduleService.handleScheduleShrinking(appointments, newSchedule, body.date);
  }
}
