import { Controller, Get, Param, Patch, Body, UseGuards, Req } from '@nestjs/common';
import { DoctorService } from './doctor.service';
import { JwtAuthGuard } from './auth/jwt-auth.guard';

@Controller('api/doctors')
export class DoctorController {
  constructor(private readonly doctorService: DoctorService) {}

  @Get()
  async getDoctors() {
    return this.doctorService.getDoctors();
  }

  @Get(':id')
  async getDoctor(@Param('id') id: string) {
    return this.doctorService.getDoctor(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async updateDoctor(@Param('id') id: string, @Body() body: any, @Req() req) {
    // doctor-only guard logic can be added here
    return this.doctorService.updateDoctor(id, body, req.user);
  }
} 