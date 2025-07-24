import { Controller, Post, Get, Param, Body, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RoleGuard } from '../auth/role.guard';
import { ElasticScheduleService } from './elastic-schedule.service';
import { CreateElasticScheduleDto } from './dto/create-elastic-schedule.dto';

@Controller('api/doctors/:id')
@UseGuards(JwtAuthGuard)
@UseGuards(new RoleGuard('doctor'))
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
}
