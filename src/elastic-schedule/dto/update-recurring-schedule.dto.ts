export class UpdateRecurringScheduleDto {
  name?: string;
  startTime?: string;
  endTime?: string;
  slotDuration?: number;
  bufferTime?: number;
  maxAppointments?: number;
  daysOfWeek?: number[];
  weeksAhead?: number;
  isActive?: boolean;
  allowOverrides?: boolean;
  autoGenerate?: boolean;
  // Whether to regenerate future schedules with new settings
  regenerateFuture?: boolean;
  // Admin override to bypass time restrictions (use with caution)
  bypassTimeRestrictions?: boolean;
}
