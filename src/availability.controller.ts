import { Controller, Get, Post, Delete, Param, Body, UseGuards, Req } from '@nestjs/common';
import { AvailabilityService } from './availability.service';
import { JwtAuthGuard } from './auth/jwt-auth.guard';

@Controller('api/doctors/:id/slots')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get()
  async getSlots(@Param('id') doctorId: string) {
    return this.availabilityService.getSlots(doctorId);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async addSlot(@Param('id') doctorId: string, @Body() body: any, @Req() req) {
    // doctor-only guard logic can be added here
    return this.availabilityService.addSlot(doctorId, body, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':slotId')
  async deleteSlot(@Param('id') doctorId: string, @Param('slotId') slotId: string, @Req() req) {
    // doctor-only guard logic can be added here
    return this.availabilityService.deleteSlot(doctorId, slotId, req.user);
  }
} 