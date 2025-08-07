
import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Appointment } from './appointment.entity';
import { ElasticScheduleEntity } from './elastic-schedule/elastic-schedule.entity';
import { RecurringScheduleEntity } from './elastic-schedule/recurring-schedule.entity';
import { Patient } from './patient/patient.entity';
import { Doctor } from './doctor/doctor.entity';
import { AvailabilitySlot } from './availability_slot.entity';

@Injectable()
export class AppointmentService {



  /**
   * Returns overflow appointments after a schedule shrink, sorted FIFO, with time-of-day bucket and search priority.
   * Uses the same logic as getElasticScheduleOverflowAppointments but adds priority sorting.
   * @param elasticScheduleId The ID of the updated elastic schedule
   * @returns Array of { appointment, bucket, searchPriority }
   */
  async getElasticScheduleOverflowWithPriority(elasticScheduleId: string) {
    const elasticSchedule = await this.elasticScheduleRepo.findOne({ 
      where: { id: elasticScheduleId },
      relations: ['doctor']
    });
    if (!elasticSchedule) throw new NotFoundException('Elastic schedule not found');

    // Get all appointments for this schedule's doctor and date, regardless of status
    const appointments = await this.appointmentRepository.find({
      where: {
        doctor: { id: elasticSchedule.doctor.id },
        date: elasticSchedule.date
      },
      relations: ['doctor', 'patient', 'elasticSchedule', 'slot'],
      order: { startTime: 'ASC' }
    });

    // Convert schedule start/end to minutes
    const toMinutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const scheduleStartMin = toMinutes(elasticSchedule.startTime);
    const scheduleEndMin = toMinutes(elasticSchedule.endTime);

    // Separate appointments by status
    const cancelledAppts = appointments.filter(appt => appt.status === 'cancelled');
    const rescheduledAppts = appointments.filter(appt => appt.status === 'rescheduled');
    const scheduledAppts = appointments.filter(appt => appt.status === 'scheduled');

    // All cancelled/rescheduled appointments are considered overflow from shrink
    const definiteOverflow = [...cancelledAppts, ...rescheduledAppts];

    console.log(`[OVERFLOW DEBUG] Elastic schedule: ${elasticSchedule.startTime}-${elasticSchedule.endTime} (${scheduleStartMin}-${scheduleEndMin} minutes)`);
    console.log(`[OVERFLOW DEBUG] Found ${scheduledAppts.length} scheduled appointments to check for overflow`);

    // For scheduled appointments, check if they fit within new constraints
    const scheduledWithinTimeRange = scheduledAppts.filter(appt => {
      if (!appt.startTime || !appt.endTime) return false;
      
      // Convert appointment times to minutes for comparison
      const apptStartTime = new Date(appt.startTime);
      const apptEndTime = new Date(appt.endTime);
      
      const apptStartHour = apptStartTime.getUTCHours();
      const apptStartMin = apptStartTime.getUTCMinutes();
      const apptEndHour = apptEndTime.getUTCHours();
      const apptEndMin = apptEndTime.getUTCMinutes();
      
      const apptStartTotalMin = apptStartHour * 60 + apptStartMin;
      const apptEndTotalMin = apptEndHour * 60 + apptEndMin;
      
      // Appointment fits if it's completely within the time boundaries
      const fitsInTimeRange = apptStartTotalMin >= scheduleStartMin && apptEndTotalMin <= scheduleEndMin;
      
      console.log(`[OVERFLOW DEBUG] Appointment ${appt.id}: ${apptStartTotalMin}-${apptEndTotalMin} vs schedule ${scheduleStartMin}-${scheduleEndMin} = ${fitsInTimeRange ? 'FITS' : 'OVERFLOW'}`);
      
      return fitsInTimeRange;
    });

    console.log(`[OVERFLOW DEBUG] ${scheduledWithinTimeRange.length} appointments fit within time range`);

    // Check capacity constraints: if we have more appointments than maxAppointments allows
    const capacityOverflow: Appointment[] = [];
    if (elasticSchedule.maxAppointments && scheduledWithinTimeRange.length > elasticSchedule.maxAppointments) {
      // Keep the first maxAppointments (by start time), mark the rest as overflow
      const excessAppointments = scheduledWithinTimeRange.slice(elasticSchedule.maxAppointments);
      capacityOverflow.push(...excessAppointments);
      console.log(`[OVERFLOW DEBUG] Capacity overflow: ${excessAppointments.length} appointments exceed maxAppointments(${elasticSchedule.maxAppointments})`);
    }

    // Appointments outside time boundaries are also overflow
    const timeOverflow = scheduledAppts.filter(appt => {
      if (!appt.startTime || !appt.endTime) return false;
      
      // Convert appointment times to minutes for comparison
      const apptStartTime = new Date(appt.startTime);
      const apptEndTime = new Date(appt.endTime);
      
      const apptStartHour = apptStartTime.getUTCHours();
      const apptStartMin = apptStartTime.getUTCMinutes();
      const apptEndHour = apptEndTime.getUTCHours();
      const apptEndMin = apptEndTime.getUTCMinutes();
      
      const apptStartTotalMin = apptStartHour * 60 + apptStartMin;
      const apptEndTotalMin = apptEndHour * 60 + apptEndMin;
      
      // Appointment is outside if it's not completely within the time boundaries
      const isOutside = apptStartTotalMin < scheduleStartMin || apptEndTotalMin > scheduleEndMin;
      
      console.log(`[OVERFLOW DEBUG] Time check appointment ${appt.id}: ${apptStartTotalMin}-${apptEndTotalMin} vs schedule ${scheduleStartMin}-${scheduleEndMin} = ${isOutside ? 'OUTSIDE' : 'INSIDE'}`);
      
      return isOutside;
    });

    // Combine all overflow appointments
    const overflowAppointments = [...definiteOverflow, ...capacityOverflow, ...timeOverflow];

    // Remove duplicates (in case an appointment is in multiple categories)
    const uniqueOverflow = overflowAppointments.filter((appt, index, arr) => 
      arr.findIndex(a => a.id === appt.id) === index
    );

    // Sort FIFO by createdAt
    uniqueOverflow.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    // Determine time-of-day bucket for the updated session
    const sessionStart = elasticSchedule.startTime;
    const [sessionHour] = sessionStart.split(':').map(Number);
    let bucket: 'morning' | 'afternoon' | 'evening';
    if (sessionHour < 12) bucket = 'morning';
    else if (sessionHour < 17) bucket = 'afternoon';
    else bucket = 'evening';

    // Assign search priority sequence
    let searchPriority: string[] = [];
    if (bucket === 'morning') {
      searchPriority = ['same-day afternoon', 'same-day evening', 'next day'];
    } else if (bucket === 'afternoon') {
      searchPriority = ['same-day evening', 'next day'];
    } else {
      searchPriority = ['next day'];
    }

    // Return overflow appointments with bucket and search priority
    return uniqueOverflow.map(appt => ({
      appointment: appt,
      bucket,
      searchPriority,
      overflowReason: cancelledAppts.includes(appt) || rescheduledAppts.includes(appt) 
        ? 'cancelled_by_shrink' 
        : capacityOverflow.includes(appt) 
          ? 'exceeds_capacity' 
          : 'outside_time_range',
      needsReschedule: appt.status === 'cancelled' ? 'pending' : 'completed'
    }));
  }


  constructor(
    @InjectRepository(Appointment)
    private readonly appointmentRepository: Repository<Appointment>,
    @InjectRepository(Patient)
    private readonly patientRepository: Repository<Patient>,
    @InjectRepository(Doctor)
    private readonly doctorRepository: Repository<Doctor>,
    @InjectRepository(AvailabilitySlot)
    private readonly slotRepository: Repository<AvailabilitySlot>,
    private readonly dataSource: DataSource,
    @InjectRepository(ElasticScheduleEntity)
    private readonly elasticScheduleRepo: Repository<ElasticScheduleEntity>,
    @InjectRepository(RecurringScheduleEntity)
    private readonly recurringScheduleRepo: Repository<RecurringScheduleEntity>,
  ) {}

  // --- ELASTIC SCHEDULE BOOKING LOGIC ---
  async createAppointment(data: any, user: any) {
    // --- ELASTIC SCHEDULE BOOKING LOGIC ---
    if (data.elasticScheduleId) {
      // Elastic slot booking
      return await this.dataSource.transaction(async manager => {
        const patient = await this.patientRepository.findOne({ where: { user: { id: user.sub } } });
        const doctor = await this.doctorRepository.findOne({ where: { id: data.doctorId } });
        const elasticSchedule = await this.elasticScheduleRepo.findOne({ where: { id: data.elasticScheduleId } });
        if (!patient || !doctor || !elasticSchedule) throw new NotFoundException('Invalid patient, doctor, or elastic schedule');

        // Use direct slot calculation here for atomicity
        const slotDuration = elasticSchedule.slotDuration;
        const buffer = elasticSchedule.bufferTime || 0;
        const start = elasticSchedule.startTime;
        const end = elasticSchedule.endTime;
        const toMinutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
        const fromMinutes = (m: number) => { const h = Math.floor(m / 60).toString().padStart(2, '0'); const min = (m % 60).toString().padStart(2, '0'); return `${h}:${min}`; };
        let current = toMinutes(start);
        const endMin = toMinutes(end);
        // Get all active appointments for doctor on that date (excluding cancelled)
        const appointments = await manager.find(Appointment, { 
          where: { 
            doctor: { id: doctor.id }, 
            date: elasticSchedule.date,
            status: In(['scheduled', 'rescheduled']) // Exclude cancelled appointments
          } 
        });
        const bookedSlots = new Set<string>();
        for (const appt of appointments) {
          // Extract time from UTC timestamp for comparison
          const startTimeStr = appt.startTime ? appt.startTime.toISOString().substring(11, 16) : '';
          const endTimeStr = appt.endTime ? appt.endTime.toISOString().substring(11, 16) : '';
          if (startTimeStr && endTimeStr) {
            bookedSlots.add(`${startTimeStr}-${endTimeStr}`);
          }
        }
        let assignedSlot: { startTime: string; endTime: string } | null = null;
        if (data.startTime && data.endTime) {
          const requestedStartMin = toMinutes(data.startTime);
          const requestedEndMin = toMinutes(data.endTime);
          if (requestedEndMin <= requestedStartMin) {
            throw new ConflictException(`End time must be after start time. Requested: ${data.startTime}-${data.endTime}`);
          }
          const scheduleStartMin = toMinutes(start);
          const scheduleEndMin = toMinutes(end);
          if (requestedStartMin < scheduleStartMin || requestedEndMin > scheduleEndMin) {
            throw new ConflictException(`Requested time ${data.startTime}-${data.endTime} is outside doctor's available hours ${start}-${end}`);
          }
          for (const appt of appointments) {
            if (appt.startTime && appt.endTime) {
              const existingStartMin = toMinutes(appt.startTime.toISOString().substring(11, 16));
              const existingEndMin = toMinutes(appt.endTime.toISOString().substring(11, 16));
              const hasOverlap = (
                (requestedStartMin < existingEndMin) && (requestedEndMin > existingStartMin)
              );
              if (hasOverlap) {
                const existingTimeStr = `${appt.startTime.toISOString().substring(11, 16)}-${appt.endTime.toISOString().substring(11, 16)}`;
                throw new ConflictException(
                  `Requested time ${data.startTime}-${data.endTime} conflicts with existing appointment ${existingTimeStr}. ` +
                  `Please choose a different time slot.`
                );
              }
            }
          }
          assignedSlot = { startTime: data.startTime, endTime: data.endTime };
        } else {
          while (current + slotDuration <= endMin) {
            const slotStart = fromMinutes(current);
            const slotEnd = fromMinutes(current + slotDuration);
            if (!bookedSlots.has(`${slotStart}-${slotEnd}`)) {
              assignedSlot = { startTime: slotStart, endTime: slotEnd };
              break;
            }
            current += slotDuration + buffer;
          }
        }
        if (!assignedSlot) throw new ConflictException('No available slot in elastic schedule');
        const appointmentDate = data.date || elasticSchedule.date;
        const startTimestamp = new Date(`${appointmentDate}T${assignedSlot.startTime}:00.000Z`);
        const endTimestamp = new Date(`${appointmentDate}T${assignedSlot.endTime}:00.000Z`);
        const appointment = manager.create(Appointment, {
          patient,
          doctor,
          status: 'scheduled',
          startTime: startTimestamp,
          endTime: endTimestamp,
          elasticSchedule,
          date: elasticSchedule.date,
        });
        await manager.save(Appointment, appointment);
        return appointment;
      });
    } else if (data.recurringScheduleId && data.startTime && data.endTime && data.date) {
      // Recurring schedule booking with specific time slots
      return await this.dataSource.transaction(async manager => {
        const patient = await this.patientRepository.findOne({ where: { user: { id: user.sub } } });
        const doctor = await this.doctorRepository.findOne({ where: { id: data.doctorId } });
        if (!patient || !doctor) throw new NotFoundException('Invalid patient or doctor');
        const recurringSchedule = await this.recurringScheduleRepo.findOne({ 
          where: { id: data.recurringScheduleId } 
        });
        if (!recurringSchedule) throw new NotFoundException('Recurring schedule not found');
        const toMinutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
        const requestedStartMin = toMinutes(data.startTime);
        const requestedEndMin = toMinutes(data.endTime);
        if (requestedEndMin <= requestedStartMin) {
          throw new ConflictException(`End time must be after start time. Requested: ${data.startTime}-${data.endTime}`);
        }
        const requestDate = new Date(data.date);
        const dayOfWeek = requestDate.getDay();
        if (!recurringSchedule.daysOfWeek.includes(dayOfWeek)) {
          const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          const availableDays = recurringSchedule.daysOfWeek.map(d => dayNames[d]).join(', ');
          throw new ConflictException(`Doctor is not available on ${dayNames[dayOfWeek]}. Available days: ${availableDays}`);
        }
        const scheduleStartMin = toMinutes(recurringSchedule.startTime);
        const scheduleEndMin = toMinutes(recurringSchedule.endTime);
        if (requestedStartMin < scheduleStartMin || requestedEndMin > scheduleEndMin) {
          throw new ConflictException(`Requested time ${data.startTime}-${data.endTime} is outside doctor's available hours ${recurringSchedule.startTime}-${recurringSchedule.endTime}`);
        }
        const appointments = await manager.find(Appointment, { 
          where: { 
            doctor: { id: doctor.id }, 
            date: data.date,
            status: In(['scheduled', 'rescheduled'])
          } 
        });
        for (const appt of appointments) {
          if (appt.startTime && appt.endTime) {
            const existingStartMin = toMinutes(appt.startTime.toISOString().substring(11, 16));
            const existingEndMin = toMinutes(appt.endTime.toISOString().substring(11, 16));
            const hasOverlap = (
              (requestedStartMin < existingEndMin) && (requestedEndMin > existingStartMin)
            );
            if (hasOverlap) {
              const existingTimeStr = `${appt.startTime.toISOString().substring(11, 16)}-${appt.endTime.toISOString().substring(11, 16)}`;
              throw new ConflictException(
                `Requested time ${data.startTime}-${data.endTime} conflicts with existing appointment ${existingTimeStr}. ` +
                `Please choose a different time slot.`
              );
            }
          }
        }
        const startTimestamp = new Date(`${data.date}T${data.startTime}:00.000Z`);
        const endTimestamp = new Date(`${data.date}T${data.endTime}:00.000Z`);
        const appointment = manager.create(Appointment, {
          patient,
          doctor,
          status: 'scheduled',
          startTime: startTimestamp,
          endTime: endTimestamp,
          date: data.date,
        });
        await manager.save(Appointment, appointment);
        return appointment;
      });
    } else {
      // Traditional slot booking
      const patient = await this.patientRepository.findOne({ where: { user: { id: user.sub } } });
      const doctor = await this.doctorRepository.findOne({ where: { id: data.doctorId } });
      const slot = await this.slotRepository.findOne({ where: { id: data.slotId } });
      if (!patient || !doctor || !slot) throw new NotFoundException('Invalid patient, doctor, or slot');
      const appointment = this.appointmentRepository.create({ patient, doctor, slot, status: 'scheduled' });
      await this.appointmentRepository.save(appointment);
      return appointment;
    }
  }

  async rescheduleAppointment(id: string, data: any, user: any) {
    const appointment = await this.appointmentRepository.findOne({ 
      where: { id }, 
      relations: ['patient', 'patient.user', 'elasticSchedule', 'doctor', 'slot'] 
    });
    if (!appointment) throw new NotFoundException('Appointment not found');
    if (!appointment.patient || !appointment.patient.user) throw new NotFoundException('Patient or user not found');
    if (appointment.patient.user.id !== user.sub) throw new ForbiddenException('You can only reschedule your own appointments');
    if (data.slotId) {
      const newSlot = await this.slotRepository.findOne({ where: { id: data.slotId } });
      if (!newSlot) throw new NotFoundException('Slot not found');
      appointment.elasticSchedule = undefined;
      appointment.startTime = undefined;
      appointment.endTime = undefined;
      appointment.slot = newSlot;
      appointment.status = 'rescheduled';
      await this.appointmentRepository.save(appointment);
      return appointment;
    }
    if (appointment.elasticSchedule) {
      if (data.getAvailableSlots) {
        const elasticSchedule = appointment.elasticSchedule;
        const appointments = await this.appointmentRepository.find({ 
          where: { 
            doctor: { id: appointment.doctor.id }, 
            date: elasticSchedule.date,
            status: In(['scheduled', 'rescheduled'])
          } 
        });
        const bookedSlots = new Set<string>();
        for (const appt of appointments) {
          if (appt.id === appointment.id) continue;
          const startTimeStr = appt.startTime ? appt.startTime.toISOString().substring(11, 16) : '';
          const endTimeStr = appt.endTime ? appt.endTime.toISOString().substring(11, 16) : '';
          if (startTimeStr && endTimeStr) {
            bookedSlots.add(`${startTimeStr}-${endTimeStr}`);
          }
        }
        const availableSlots: { startTime: string; endTime: string }[] = [];
        const slotDuration = elasticSchedule.slotDuration;
        const buffer = elasticSchedule.bufferTime || 0;
        const start = elasticSchedule.startTime;
        const end = elasticSchedule.endTime;
        const toMinutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
        const fromMinutes = (m: number) => { const h = Math.floor(m / 60).toString().padStart(2, '0'); const min = (m % 60).toString().padStart(2, '0'); return `${h}:${min}`; };
        let current = toMinutes(start);
        const endMin = toMinutes(end);
        while (current + slotDuration <= endMin) {
          const slotStart = fromMinutes(current);
          const slotEnd = fromMinutes(current + slotDuration);
          if (!bookedSlots.has(`${slotStart}-${slotEnd}`)) {
            availableSlots.push({ startTime: slotStart, endTime: slotEnd });
          }
          current += slotDuration + buffer;
        }
        return { availableSlots, elasticSchedule: elasticSchedule };
      }
      const elasticSchedule = appointment.elasticSchedule;
      if (data.startTime && data.endTime) {
        const requestedStart = data.startTime;
        const requestedEnd = data.endTime;
        const appointments = await this.appointmentRepository.find({ 
          where: { 
            doctor: { id: appointment.doctor.id }, 
            date: elasticSchedule.date,
            status: In(['scheduled', 'rescheduled'])
          } 
        });
        const bookedSlots = new Set<string>();
        for (const appt of appointments) {
          if (appt.id === appointment.id) continue;
          const startTimeStr = appt.startTime ? appt.startTime.toISOString().substring(11, 16) : '';
          const endTimeStr = appt.endTime ? appt.endTime.toISOString().substring(11, 16) : '';
          if (startTimeStr && endTimeStr) {
            bookedSlots.add(`${startTimeStr}-${endTimeStr}`);
          }
        }
        if (bookedSlots.has(`${requestedStart}-${requestedEnd}`)) {
          throw new ConflictException('Requested slot is already booked');
        }
        const appointmentDate = elasticSchedule.date;
        const startTimestamp = new Date(`${appointmentDate}T${requestedStart}:00`);
        const endTimestamp = new Date(`${appointmentDate}T${requestedEnd}:00`);
        appointment.startTime = startTimestamp;
        appointment.endTime = endTimestamp;
        appointment.status = 'rescheduled';
        await this.appointmentRepository.save(appointment);
        return appointment;
      } else {
        throw new Error('For elastic schedule appointments, startTime and endTime are required for rescheduling');
      }
    } else {
      if (!data.slotId) {
        throw new Error('For traditional slot appointments, slotId is required for rescheduling');
      }
      const newSlot = await this.slotRepository.findOne({ where: { id: data.slotId } });
      if (!newSlot) throw new NotFoundException('Slot not found');
      appointment.slot = newSlot;
      appointment.status = 'rescheduled';
      await this.appointmentRepository.save(appointment);
      return appointment;
    }
  }

  async cancelAppointment(id: string, user: any) {
    const appointment = await this.appointmentRepository.findOne({ where: { id }, relations: ['patient', 'patient.user'] });
    if (!appointment) throw new NotFoundException('Appointment not found');
    if (!appointment.patient || !appointment.patient.user) throw new NotFoundException('Patient or user not found');
    if (appointment.patient.user.id !== user.sub) throw new ForbiddenException('You can only cancel your own appointments');
    appointment.status = 'cancelled';
    await this.appointmentRepository.save(appointment);
    return { message: 'Appointment cancelled' };
  }

  async getPatientAppointments(patientId: string, user: any) {
    const patient = await this.patientRepository.findOne({ where: { id: patientId }, relations: ['user'] });
    if (!patient) throw new NotFoundException('Patient not found');
    if (!patient.user) throw new NotFoundException('User not found for patient');
    if (patient.user.id !== user.sub) throw new ForbiddenException('You can only view your own appointments');
    return this.appointmentRepository.find({ 
      where: { patient: { id: patientId } },
      relations: ['doctor', 'elasticSchedule', 'slot']
    });
  }

  async getDoctorAppointments(doctorId: string, user: any) {
    const doctor = await this.doctorRepository.findOne({ where: { id: doctorId }, relations: ['user'] });
    if (!doctor) throw new NotFoundException('Doctor not found');
    if (!doctor.user) throw new NotFoundException('User not found for doctor');
    if (doctor.user.id !== user.sub) throw new ForbiddenException('You can only view your own appointments');
    return this.appointmentRepository.find({ 
      where: { doctor: { id: doctorId } },
      relations: ['patient', 'elasticSchedule', 'slot']
    });
  }

  /**
   * Returns a list of appointments that are truly overflow due to elastic schedule constraints.
   * An appointment is considered overflow if:
   * 1. It was cancelled/rescheduled due to shrink operation
   * 2. It's outside the new time boundaries AND cannot fit within capacity
   * 3. It exceeds the maxAppointments limit even if within time boundaries
   * @param elasticScheduleId The ID of the updated elastic schedule
   * @returns Array of overflow appointments
   */
  async getElasticScheduleOverflowAppointments(elasticScheduleId: string) {
    const elasticSchedule = await this.elasticScheduleRepo.findOne({ 
      where: { id: elasticScheduleId },
      relations: ['doctor']
    });
    if (!elasticSchedule) throw new NotFoundException('Elastic schedule not found');

    // Get all appointments for this schedule's doctor and date, regardless of status
    // This includes appointments that were cancelled/rescheduled during the shrink operation
    const appointments = await this.appointmentRepository.find({
      where: {
        doctor: { id: elasticSchedule.doctor.id },
        date: elasticSchedule.date
      },
      relations: ['doctor', 'patient', 'elasticSchedule', 'slot'],
      order: { startTime: 'ASC' }
    });

    // Convert schedule start/end to minutes
    const toMinutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const scheduleStartMin = toMinutes(elasticSchedule.startTime);
    const scheduleEndMin = toMinutes(elasticSchedule.endTime);

    // Separate appointments by status
    const cancelledAppts = appointments.filter(appt => appt.status === 'cancelled');
    const rescheduledAppts = appointments.filter(appt => appt.status === 'rescheduled');
    const scheduledAppts = appointments.filter(appt => appt.status === 'scheduled');

    // All cancelled/rescheduled appointments are considered overflow from shrink
    const definiteOverflow = [...cancelledAppts, ...rescheduledAppts];

    // For scheduled appointments, check if they fit within new constraints
    const scheduledWithinTimeRange = scheduledAppts.filter(appt => {
      if (!appt.startTime || !appt.endTime) return false;
      const apptStart = appt.startTime.toISOString().substring(11, 16);
      const apptEnd = appt.endTime.toISOString().substring(11, 16);
      const apptStartMin = toMinutes(apptStart);
      const apptEndMin = toMinutes(apptEnd);
      // Appointment fits if it's completely within the time boundaries
      return apptStartMin >= scheduleStartMin && apptEndMin <= scheduleEndMin;
    });

    // Check capacity constraints: if we have more appointments than maxAppointments allows
    const capacityOverflow: Appointment[] = [];
    if (elasticSchedule.maxAppointments && scheduledWithinTimeRange.length > elasticSchedule.maxAppointments) {
      // Keep the first maxAppointments (by start time), mark the rest as overflow
      const excessAppointments = scheduledWithinTimeRange.slice(elasticSchedule.maxAppointments);
      capacityOverflow.push(...excessAppointments);
    }

    // Appointments outside time boundaries are also overflow
    const timeOverflow = scheduledAppts.filter(appt => {
      if (!appt.startTime || !appt.endTime) return false;
      const apptStart = appt.startTime.toISOString().substring(11, 16);
      const apptEnd = appt.endTime.toISOString().substring(11, 16);
      const apptStartMin = toMinutes(apptStart);
      const apptEndMin = toMinutes(apptEnd);
      // Appointment is outside if it's not completely within the time boundaries
      return apptStartMin < scheduleStartMin || apptEndMin > scheduleEndMin;
    });

    // Combine all overflow appointments
    const overflowAppointments = [...definiteOverflow, ...capacityOverflow, ...timeOverflow];

    // Remove duplicates (in case an appointment is in multiple categories)
    const uniqueOverflow = overflowAppointments.filter((appt, index, arr) => 
      arr.findIndex(a => a.id === appt.id) === index
    );

    // Mark each as overflowed for clarity and add pending reschedule status
    return uniqueOverflow.map(appt => ({
      ...appt,
      overflowed: true,
      overflowReason: cancelledAppts.includes(appt) || rescheduledAppts.includes(appt) 
        ? 'cancelled_by_shrink' 
        : capacityOverflow.includes(appt) 
          ? 'exceeds_capacity' 
          : 'outside_time_range',
      needsReschedule: appt.status === 'cancelled' ? 'pending' : 'completed'
    }));
  }
  /**
   * Attempts to reschedule overflow appointments using prioritized search buckets.
   * For each appointment, finds the earliest available slot in recurring or elastic schedules.
   * Updates status and returns a summary of rescheduled and pending appointments.
   * FIXED: Now properly tracks slot assignments in real-time to prevent double-booking.
   * @param overflowAppointmentsWithPriority Array of { appointment, bucket, searchPriority }
   * @returns { rescheduled: [...], pending: [...] }
   */
  async rescheduleOverflowAppointments(overflowAppointmentsWithPriority: Array<{ appointment: Appointment, bucket: string, searchPriority: string[] }>) {
    const rescheduled: Array<{ id: string, oldStartTime: Date | undefined, oldEndTime: Date | undefined, newStartTime: Date, newEndTime: Date, status: string }> = [];
    const pending: Array<{ id: string, oldStartTime: Date | undefined, oldEndTime: Date | undefined, status: string }> = [];
    const notifications: Array<{ appointmentId: string, oldTime: { start: Date | undefined, end: Date | undefined }, newTime?: { start: Date, end: Date }, status: string, reason: string }> = [];
    
    // CRITICAL FIX: Track slots assigned during this redistribution process
    const assignedSlotsThisSession = new Map<string, Set<string>>(); // date -> Set of "startTime-endTime"
    
    // Helper to get all schedules for a doctor on a date
    const getSchedules = async (doctorId: string, date: string) => {
      const elastic = await this.elasticScheduleRepo.find({ where: { doctor: { id: doctorId }, date: date || '' } });
      const recurring = await this.recurringScheduleRepo.find({ where: { doctor: { id: doctorId } } });
      return { elastic, recurring };
    };

    // Helper to check if a slot is available (considering both DB and current session assignments)
    const isSlotAvailable = async (doctorId: string, targetDate: string, slotStart: string, slotEnd: string) => {
      // Check database for existing appointments
      const existingAppointments = await this.appointmentRepository.find({
        where: { doctor: { id: doctorId }, date: targetDate, status: In(['scheduled', 'rescheduled']) },
      });
      
      const dbBookedSlots = new Set<string>();
      for (const appt of existingAppointments) {
        const startTimeStr = appt.startTime ? appt.startTime.toISOString().substring(11, 16) : '';
        const endTimeStr = appt.endTime ? appt.endTime.toISOString().substring(11, 16) : '';
        if (startTimeStr && endTimeStr) {
          dbBookedSlots.add(`${startTimeStr}-${endTimeStr}`);
        }
      }
      
      // Check session assignments for this date
      const sessionSlots = assignedSlotsThisSession.get(targetDate) || new Set();
      
      const slotKey = `${slotStart}-${slotEnd}`;
      return !dbBookedSlots.has(slotKey) && !sessionSlots.has(slotKey);
    };

    // Helper to mark a slot as assigned in current session
    const markSlotAsAssigned = (targetDate: string, slotStart: string, slotEnd: string) => {
      if (!assignedSlotsThisSession.has(targetDate)) {
        assignedSlotsThisSession.set(targetDate, new Set());
      }
      assignedSlotsThisSession.get(targetDate)!.add(`${slotStart}-${slotEnd}`);
    };

    // Dummy notification function (replace with real notification logic)
    const notifyPatient = async (patient: Patient, appointment: Appointment, newStart?: Date, newEnd?: Date, pending: boolean = false) => {
      // You can replace this with email, SMS, or in-app notification logic
      if (pending) {
        console.log(`Notify patient ${patient.id}: Your appointment could not be automatically rescheduled. Please pick a new slot from available schedules.`);
      } else if (newStart && newEnd) {
        console.log(`Notify patient ${patient.id}: Your appointment has been rescheduled to ${newStart.toISOString()} - ${newEnd.toISOString()}`);
      }
    };

    // Sort by original booking time (FIFO)
    const sortedOverflow = [...overflowAppointmentsWithPriority].sort((a, b) => {
      const aTime = a.appointment.createdAt ? new Date(a.appointment.createdAt).getTime() : 0;
      const bTime = b.appointment.createdAt ? new Date(b.appointment.createdAt).getTime() : 0;
      return aTime - bTime;
    });

    for (const { appointment, bucket, searchPriority } of sortedOverflow) {
      let foundSlot: { startTime: string; endTime: string } | null = null;
      let newStart: Date | undefined = undefined;
      let newEnd: Date | undefined = undefined;
      let newScheduleType: 'elastic' | 'recurring' | undefined = undefined;
      let newScheduleId: string | undefined = undefined;
      let targetDateForSlot: string = '';
      
      // Try each search priority in order
      for (const priority of searchPriority) {
        // Parse priority, e.g., 'same-day afternoon', 'next day'
        let targetDate: string = appointment.date || '';
        let targetBucket: string | undefined = undefined;
        if (priority.startsWith('same-day')) {
          const parts = priority.split(' ');
          targetBucket = parts.length > 1 ? parts[1] : undefined;
        } else if (priority === 'next day') {
          if (appointment.date) {
            const d = new Date(appointment.date);
            d.setDate(d.getDate() + 1);
            targetDate = d.toISOString().substring(0, 10);
          }
        }
        
        // Get all schedules for doctor on targetDate
        const { elastic, recurring } = await getSchedules(appointment.doctor.id, targetDate);
        
        // Try elastic schedules first
        for (const sched of elastic) {
          // Check bucket if specified
          if (targetBucket) {
            const [h] = sched.startTime.split(':').map(Number);
            if ((targetBucket === 'morning' && h >= 12) || (targetBucket === 'afternoon' && (h < 12 || h >= 17)) || (targetBucket === 'evening' && h < 17)) continue;
          }
          
          // Find available slot using improved availability check
          const slotDuration = sched.slotDuration;
          const buffer = sched.bufferTime || 0;
          const toMinutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
          const fromMinutes = (m: number) => { const h = Math.floor(m / 60).toString().padStart(2, '0'); const min = (m % 60).toString().padStart(2, '0'); return `${h}:${min}`; };
          let current = toMinutes(sched.startTime);
          const endMin = toMinutes(sched.endTime);
          
          while (current + slotDuration <= endMin) {
            const slotStart = fromMinutes(current);
            const slotEnd = fromMinutes(current + slotDuration);
            
            // FIXED: Use improved availability check that considers current session
            if (await isSlotAvailable(appointment.doctor.id, targetDate, slotStart, slotEnd)) {
              foundSlot = { startTime: slotStart, endTime: slotEnd };
              newStart = new Date(`${targetDate}T${slotStart}:00.000Z`);
              newEnd = new Date(`${targetDate}T${slotEnd}:00.000Z`);
              newScheduleType = 'elastic';
              newScheduleId = sched.id;
              targetDateForSlot = targetDate;
              break;
            }
            current += slotDuration + buffer;
          }
          if (foundSlot) break;
        }
        if (foundSlot) break;
        
        // Try recurring schedules (if not found in elastic)
        for (const sched of recurring) {
          // Check if schedule is available on targetDate
          if (!targetDate) continue;
          const d = new Date(targetDate);
          const dayOfWeek = d.getDay();
          if (!sched.daysOfWeek.includes(dayOfWeek)) continue;
          
          // Check bucket if specified
          const [h] = sched.startTime.split(':').map(Number);
          if (targetBucket) {
            if ((targetBucket === 'morning' && h >= 12) || (targetBucket === 'afternoon' && (h < 12 || h >= 17)) || (targetBucket === 'evening' && h < 17)) continue;
          }
          
          const toMinutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
          const fromMinutes = (m: number) => { const h = Math.floor(m / 60).toString().padStart(2, '0'); const min = (m % 60).toString().padStart(2, '0'); return `${h}:${min}`; };
          let current = toMinutes(sched.startTime);
          const endMin = toMinutes(sched.endTime);
          
          while (current + sched.slotDuration <= endMin) {
            const slotStart = fromMinutes(current);
            const slotEnd = fromMinutes(current + sched.slotDuration);
            
            // FIXED: Use improved availability check that considers current session
            if (await isSlotAvailable(appointment.doctor.id, targetDate, slotStart, slotEnd)) {
              foundSlot = { startTime: slotStart, endTime: slotEnd };
              newStart = new Date(`${targetDate}T${slotStart}:00.000Z`);
              newEnd = new Date(`${targetDate}T${slotEnd}:00.000Z`);
              newScheduleType = 'recurring';
              newScheduleId = sched.id;
              targetDateForSlot = targetDate;
              break;
            }
            current += sched.slotDuration + (sched.bufferTime || 0);
          }
          if (foundSlot) break;
        }
        if (foundSlot) break;
      }
      
      if (foundSlot && newStart && newEnd && newScheduleType && newScheduleId) {
        // CRITICAL FIX: Mark slot as assigned before updating appointment
        markSlotAsAssigned(targetDateForSlot, foundSlot.startTime, foundSlot.endTime);
        
        // Update appointment
        const oldStartTime = appointment.startTime;
        const oldEndTime = appointment.endTime;
        appointment.startTime = newStart;
        appointment.endTime = newEnd;
        appointment.status = 'rescheduled';
        if (newScheduleType === 'elastic') {
          const elasticSchedule = await this.elasticScheduleRepo.findOne({ where: { id: newScheduleId } });
          appointment.elasticSchedule = elasticSchedule || undefined;
          appointment.slot = undefined;
        } else if (newScheduleType === 'recurring') {
          appointment.elasticSchedule = undefined;
          appointment.slot = undefined;
        }
        await this.appointmentRepository.save(appointment);
        
        // Notify patient of new timing
        if (appointment.patient) {
          await notifyPatient(appointment.patient, appointment, newStart, newEnd);
        }
        rescheduled.push({
          id: appointment.id,
          oldStartTime,
          oldEndTime,
          newStartTime: newStart,
          newEndTime: newEnd,
          status: 'rescheduled',
        });
        notifications.push({
          appointmentId: appointment.id,
          oldTime: { start: oldStartTime, end: oldEndTime },
          newTime: { start: newStart, end: newEnd },
          status: 'rescheduled',
          reason: 'Appointment automatically rescheduled to next available slot.'
        });
      } else {
        const oldStartTime = appointment.startTime;
        const oldEndTime = appointment.endTime;
        appointment.status = 'pending-reschedule';
        await this.appointmentRepository.save(appointment);
        // Notify patient to manually pick a new slot
        if (appointment.patient) {
          await notifyPatient(appointment.patient, appointment, undefined, undefined, true);
        }
        pending.push({
          id: appointment.id,
          oldStartTime,
          oldEndTime,
          status: 'pending-reschedule',
        });
        notifications.push({
          appointmentId: appointment.id,
          oldTime: { start: oldStartTime, end: oldEndTime },
          status: 'pending-reschedule',
          reason: 'No suitable slot found. Patient must manually pick a new slot.'
        });
      }
    }
    return { rescheduled, pending, notifications };
  }
}
