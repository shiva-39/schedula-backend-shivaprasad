import { Controller, Post, Get, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { UpdateElasticScheduleDto } from './dto/update-elastic-schedule.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RoleGuard, Roles } from '../auth/role.guard';
import { ElasticScheduleService } from './elastic-schedule.service';
import { CreateElasticScheduleDto } from './dto/create-elastic-schedule.dto';

@Controller('api/doctors/:id')
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles('doctor')
export class ElasticScheduleController {
  constructor(private readonly elasticScheduleService: ElasticScheduleService) {}

  @Post('elastic-schedule')
  async createElasticSchedule(
    @Param('id') doctorId: string,
    @Body() dto: CreateElasticScheduleDto
  ) {
    return this.elasticScheduleService.createSchedule(doctorId, dto);
  }

  @Get('elastic-slots')
  async getElasticSlots(
    @Param('id') doctorId: string,
    @Query('date') date: string
  ) {
    return this.elasticScheduleService.getAvailableSlots(doctorId, date);
  }

  @Patch('elastic-schedule/:scheduleId')
  async updateElasticSchedule(
    @Param('id') doctorId: string,
    @Param('scheduleId') scheduleId: string,
    @Body() dto: UpdateElasticScheduleDto
  ) {
    return this.elasticScheduleService.updateSchedule(doctorId, scheduleId, dto);
  }
}
