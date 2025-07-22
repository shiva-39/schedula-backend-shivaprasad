export class UpdateElasticScheduleDto {
  date?: string;
  startTime?: string;
  endTime?: string;
  slotDuration?: number;
  bufferTime?: number;
  maxAppointments?: number;
}
