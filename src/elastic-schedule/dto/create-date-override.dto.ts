export class CreateDateOverrideDto {
  date: string;
  reason?: string;
  startTime?: string;
  endTime?: string;
  slotDuration?: number;
  bufferTime?: number;
  maxAppointments?: number;
  // Admin override to bypass time restrictions (use with caution)
  bypassTimeRestrictions?: boolean;
}
