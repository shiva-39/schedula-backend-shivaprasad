import { Body, Controller, Post, Get, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PatientRegisterDto } from './dto/patient-register.dto';
import { DoctorRegisterDto } from './dto/doctor-register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('patient/register')
  async registerPatient(@Body() dto: PatientRegisterDto) {
    return this.authService.registerPatient(dto);
  }

  @Post('doctor/register')
  async registerDoctor(@Body() dto: DoctorRegisterDto) {
    return this.authService.registerDoctor(dto);
  }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('logout')
  async logout(@Req() req) {
    return this.authService.logout(req);
  }

  @UseGuards(JwtAuthGuard)
  @Get('/profile')
  async getProfile(@Req() req) {
    return this.authService.getProfile(req.user);
  }
}