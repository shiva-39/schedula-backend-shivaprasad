export class CreateElasticScheduleDto {
  doctorId: string;
  date: string;
  startTime: string;
  endTime: string;
  slotDuration: number;
  bufferTime?: number;
  maxAppointments?: number;
}
