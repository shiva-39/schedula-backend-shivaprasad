import { Controller, Get, Patch, Param, Body, UseGuards, Req } from '@nestjs/common';
import { PatientService } from './patient.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('api/patients')
export class PatientController {
  constructor(private readonly patientService: PatientService) {}

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getPatient(@Param('id') id: string, @Req() req) {
    // patient-only guard logic can be added here
    return this.patientService.getPatient(id, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async updatePatient(@Param('id') id: string, @Body() body: any, @Req() req) {
    // patient-only guard logic can be added here
    return this.patientService.updatePatient(id, body, req.user);
  }
} 