import { IsDateString, IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateAvailabilitySlotDto {
  @IsDateString()
  startTime: string;

  @IsDateString()
  endTime: string;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean = true;

  @IsOptional()
  @IsString()
  mode?: string = 'available';
}
