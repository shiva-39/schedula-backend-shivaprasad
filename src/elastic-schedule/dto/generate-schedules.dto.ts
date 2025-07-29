import { IsString, IsOptional, IsBoolean, Matches } from 'class-validator';

export class GenerateSchedulesDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Start date must be in YYYY-MM-DD format'
  })
  startDate?: string; // YYYY-MM-DD format, defaults to today

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'End date must be in YYYY-MM-DD format'
  })
  endDate?: string; // YYYY-MM-DD format, defaults to weeksAhead from startDate

  @IsOptional()
  @IsBoolean()
  overrideExisting?: boolean; // Whether to override existing schedules
}
