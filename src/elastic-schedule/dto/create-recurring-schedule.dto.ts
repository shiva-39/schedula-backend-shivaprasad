import { IsString, IsNumber, IsOptional, IsArray, IsBoolean, Matches, ArrayNotEmpty, Min, Max } from 'class-validator';

export class CreateRecurringScheduleDto {
  @IsString()
  name: string;

  @IsString()
  @Matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'Start time must be in HH:MM format (24-hour)'
  })
  startTime: string; // e.g., "09:00"

  @IsString()
  @Matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'End time must be in HH:MM format (24-hour)'
  })
  endTime: string; // e.g., "17:00"

  @IsNumber()
  @Min(1)
  slotDuration: number; // in minutes

  @IsOptional()
  @IsNumber()
  @Min(0)
  bufferTime?: number; // in minutes

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxAppointments?: number;

  @IsArray()
  @ArrayNotEmpty()
  @IsNumber({}, { each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek: number[]; // Array of day numbers (0 = Sunday, 1 = Monday, etc.)

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(52)
  weeksAhead?: number; // How many weeks ahead to generate (default: 4)

  @IsOptional()
  @IsBoolean()
  allowOverrides?: boolean; // Allow specific date overrides (default: true)

  @IsOptional()
  @IsBoolean()
  autoGenerate?: boolean; // Auto-generate daily schedules (default: true)
}
