import { Controller, Post, Get, Param, Body, UseGuards, Req } from '@nestjs/common';
import { ElasticScheduleService } from './elastic-schedule.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateElasticScheduleDto } from './dto/create-elastic-schedule.dto';

// Optional: import RolesGuard and Roles decorator if you have role-based guards
// import { RolesGuard } from '../auth/roles.guard';
// import { Roles } from '../auth/roles.decorator';

@Controller('api/doctors/:id')
export class ElasticScheduleController {
  constructor(private readonly elasticScheduleService: ElasticScheduleService) {}

  @UseGuards(JwtAuthGuard)
  // @UseGuards(RolesGuard)
  // @Roles('doctor')
  @Post('elastic-schedule')
  async createElasticSchedule(
    @Param('id') doctorId: string,
    @Body() dto: CreateElasticScheduleDto,
    @Req() req
  ) {
    // doctor-only guard logic can be added here
    return this.elasticScheduleService.createSchedule(doctorId, dto, req.user);
  }

  @UseGuards(JwtAuthGuard)
  // @UseGuards(RolesGuard)
  // @Roles('doctor')
  @Get('elastic-slots')
  async getElasticSlots(@Param('id') doctorId: string, @Body('date') date: string) {
    return this.elasticScheduleService.getElasticSlots(doctorId, date);
  }
}
