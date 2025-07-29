export class UpdateElasticScheduleDto {
  date?: string;
  startTime?: string;
  endTime?: string;
  slotDuration?: number;
  bufferTime?: number;
  maxAppointments?: number;
  adjustExisting?: boolean; // New parameter for automatic appointment rescheduling
}
