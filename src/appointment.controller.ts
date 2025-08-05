

import { Controller, Post, Patch, Delete, Get, Param, Body, UseGuards, Req } from '@nestjs/common';
import { AppointmentService } from './appointment.service';
import { JwtAuthGuard } from './auth/jwt-auth.guard';

@Controller('api/appointments')
export class AppointmentController {
  constructor(private readonly appointmentService: AppointmentService) {}

  @UseGuards(JwtAuthGuard)
  @Get('elastic-schedule/:elasticScheduleId/overflow-with-priority')
  async getElasticScheduleOverflowWithPriority(
    @Param('elasticScheduleId') elasticScheduleId: string,
    @Req() req
  ) {
    return this.appointmentService.getElasticScheduleOverflowWithPriority(elasticScheduleId);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async createAppointment(@Body() body: any, @Req() req) {
    return this.appointmentService.createAppointment(body, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/reschedule')
  async rescheduleAppointment(@Param('id') id: string, @Body() body: any, @Req() req) {
    return this.appointmentService.rescheduleAppointment(id, body, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async cancelAppointment(@Param('id') id: string, @Req() req) {
    return this.appointmentService.cancelAppointment(id, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('patient/:id')
  async getPatientAppointments(@Param('id') patientId: string, @Req() req) {
    return this.appointmentService.getPatientAppointments(patientId, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('doctor/:id')
  async getDoctorAppointments(@Param('id') doctorId: string, @Req() req) {
    return this.appointmentService.getDoctorAppointments(doctorId, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('elastic-schedule/:elasticScheduleId/overflow')
  async getElasticScheduleOverflowAppointments(@Param('elasticScheduleId') elasticScheduleId: string, @Req() req) {
    return this.appointmentService.getElasticScheduleOverflowAppointments(elasticScheduleId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('elastic-schedule/:elasticScheduleId/redistribute-overflow')
  async redistributeOverflowAppointments(@Param('elasticScheduleId') elasticScheduleId: string, @Body() body: any, @Req() req) {
    // Get overflow appointments with priority
    const overflowWithPriority = await this.appointmentService.getElasticScheduleOverflowWithPriority(elasticScheduleId);
    
    // Redistribute them
    const result = await this.appointmentService.rescheduleOverflowAppointments(overflowWithPriority);
    
    return {
      message: 'Overflow appointments redistribution completed',
      ...result
    };
  }
}