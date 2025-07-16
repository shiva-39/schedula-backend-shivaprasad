import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('hello') // GET /hello
  getHello(): {message: string} {
    return this.appService.getHello();
  }
}
import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('hello') // GET /hello
  getHello(): {message: string} {
    return this.appService.getHello();
  }
}