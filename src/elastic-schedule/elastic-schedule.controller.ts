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
}
