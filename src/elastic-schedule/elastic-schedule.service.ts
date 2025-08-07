import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { ElasticScheduleEntity } from './elastic-schedule.entity';
import { RecurringScheduleEntity } from './recurring-schedule.entity';
import { Doctor } from '../doctor/doctor.entity';
import { Appointment } from '../appointment.entity';
import { CreateElasticScheduleDto } from './dto/create-elastic-schedule.dto';
import { UpdateElasticScheduleDto } from './dto/update-elastic-schedule.dto';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class ElasticScheduleService {
  constructor(
    @InjectRepository(ElasticScheduleEntity)
    private readonly elasticScheduleRepo: Repository<ElasticScheduleEntity>,
    @InjectRepository(RecurringScheduleEntity)
    private readonly recurringScheduleRepo: Repository<RecurringScheduleEntity>,
    @InjectRepository(Doctor)
    private readonly doctorRepo: Repository<Doctor>,
    @InjectRepository(Appointment)
    private readonly appointmentRepo: Repository<Appointment>,
    private readonly dataSource: DataSource,
    private readonly notificationService: NotificationService,
  ) {}

  // Create day-specific override schedule
  async createSchedule(doctorId: string, dto: CreateElasticScheduleDto, user: any) {
    const doctor = await this.doctorRepo.findOne({
      where: { id: doctorId },
      relations: ['user'],
    });

    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }

    if (doctor.user?.id !== user.sub) {
      throw new BadRequestException('You can only create schedules for yourself');
    }

    const elasticSchedule = this.elasticScheduleRepo.create({
      doctor: { id: doctorId },
      date: dto.date,
      startTime: dto.startTime,
      endTime: dto.endTime,
      slotDuration: dto.slotDuration,
      bufferTime: dto.bufferTime || 0,
      maxAppointments: dto.maxAppointments,
    });

    const savedSchedule = await this.elasticScheduleRepo.save(elasticSchedule);

    // Handle automatic appointment rescheduling if requested
    if (dto.adjustExisting) {
      await this.rescheduleExistingAppointments(doctorId, dto.date, savedSchedule);
    }

    return savedSchedule;
  }

  // Enhanced schedule shrinking with progressive duration reduction
  async rescheduleExistingAppointments(doctorId: string, date: string, newSchedule: any) {
    // Get all appointments for this doctor on this date
    const appointments = await this.appointmentRepo.find({
      where: {
        doctor: { id: doctorId },
        date: date,
        status: In(['scheduled', 'rescheduled']) // Include both statuses
      },
      relations: ['patient', 'patient.user', 'doctor'],
      order: { startTime: 'ASC' } // Sort by start time for FIFO processing
    });

    if (appointments.length === 0) {
      return { message: 'No appointments to reschedule', rescheduled: [] };
    }

    // Delegate to the new shrinking logic
    const shrinkResult = await this.handleScheduleShrinking(appointments, newSchedule, date);
    return shrinkResult;
  }

  // Get appointments for a specific date (helper method)
  async getAppointmentsForDate(doctorId: string, date: string) {
    return await this.appointmentRepo.find({
      where: {
        doctor: { id: doctorId },
        date: date,
        status: In(['scheduled', 'rescheduled', 'confirmed'])
      },
      relations: ['patient', 'patient.user', 'doctor'],
      order: { startTime: 'ASC' }
    });
  }

  // Progressive duration reduction logic: 25→20→15→10 minutes
  async handleScheduleShrinking(
    existingAppointments: Appointment[], 
    newSchedule: { startTime: string; endTime: string; maxAppointments?: number; bufferTime?: number }, 
    date: string
  ) {
    const MINIMUM_CONSULTATION_DURATION = 10; // 10 minutes minimum

    // Helper functions
    const toMinutes = (t: string) => { 
      const [h, m] = t.split(':').map(Number); 
      return h * 60 + m; 
    };
    const fromMinutes = (m: number) => { 
      const h = Math.floor(m / 60).toString().padStart(2, '0'); 
      const min = (m % 60).toString().padStart(2, '0'); 
      return `${h}:${min}`; 
    };

    const scheduleStartMin = toMinutes(newSchedule.startTime);
    const scheduleEndMin = toMinutes(newSchedule.endTime);
    const bufferTime = newSchedule.bufferTime || 0;

    // Calculate total available time in minutes
    const totalAvailableTime = scheduleEndMin - scheduleStartMin;
    const numberOfAppointments = existingAppointments.length;

    console.log(`FAIR PROGRESSIVE FITTING Analysis:
      - New schedule window: ${newSchedule.startTime}-${newSchedule.endTime} (${totalAvailableTime} minutes)
      - Number of appointments: ${numberOfAppointments}
      - Buffer time: ${bufferTime} minutes per appointment
      - Goal: Equal duration for ALL appointments`);

    const fullyFittedAppointments: Array<{ 
      appointmentId: string; 
      patientName: string; 
      oldTime: string; 
      newTime: string; 
      status: string 
    }> = [];

    const overflowAppointments: Array<Appointment> = [];

    // PROGRESSIVE DURATION REDUCTION: Try to fit ALL appointments first, then partial
    // Step 1: Try to fit ALL appointments with progressively reduced durations
    const progressiveDurations = [25, 20, 15, 10];
    let optimalDurationForAll = 0;
    let canFitAllAppointments = false;
    
    console.log(`🎯 STEP 1: Trying to fit ALL ${numberOfAppointments} appointments with reduced durations`);
    
    // Test if ALL appointments can fit with each progressive duration
    for (const testDuration of progressiveDurations) {
      // Calculate total time needed for ALL appointments
      const totalTimeNeeded = numberOfAppointments * testDuration + (numberOfAppointments - 1) * bufferTime;
      const maxAppointmentsAllowed = newSchedule.maxAppointments || numberOfAppointments;
      
      console.log(`📊 ${testDuration} min duration: Needs ${totalTimeNeeded} minutes for ALL ${numberOfAppointments} appointments, Available: ${totalAvailableTime} minutes`);
      
      if (totalTimeNeeded <= totalAvailableTime && numberOfAppointments <= maxAppointmentsAllowed && testDuration >= MINIMUM_CONSULTATION_DURATION) {
        optimalDurationForAll = testDuration;
        canFitAllAppointments = true;
        console.log(`✅ SUCCESS: ALL ${numberOfAppointments} appointments can fit with ${testDuration} min duration!`);
        break;
      } else {
        console.log(`❌ ${testDuration} min duration: Cannot fit ALL appointments`);
      }
    }
    
    if (canFitAllAppointments) {
      // SUCCESS: ALL appointments can fit with reduced duration - Apply uniformly to ALL
      console.log(`🎯 FITTING ALL: Using ${optimalDurationForAll} minutes uniformly for ALL ${numberOfAppointments} appointments`);
      
      let currentStartTime = scheduleStartMin;
      let fittedCount = 0;
      
      // Apply uniform duration to ALL appointments
      for (let i = 0; i < existingAppointments.length; i++) {
        const appointment = existingAppointments[i];
        
        const oldTime = appointment.startTime && appointment.endTime ? 
          `${appointment.startTime.toISOString().substring(11, 16)}-${appointment.endTime.toISOString().substring(11, 16)}` : 
          'Unknown';

        const appointmentEndTime = currentStartTime + optimalDurationForAll;
        const newStartTime = fromMinutes(currentStartTime);
        const newEndTime = fromMinutes(appointmentEndTime);

        // Update appointment times within shrunk window
        appointment.startTime = new Date(`${date}T${newStartTime}:00.000Z`);
        appointment.endTime = new Date(`${date}T${newEndTime}:00.000Z`);
        appointment.status = 'scheduled';
        await this.appointmentRepo.save(appointment);

        fullyFittedAppointments.push({
          appointmentId: appointment.id,
          patientName: appointment.patient?.name || 'Unknown',
          oldTime: oldTime,
          newTime: `${newStartTime}-${newEndTime}`,
          status: `all_fitted_${optimalDurationForAll}min_uniform_duration`
        });

        console.log(`✅ Appointment ${fittedCount + 1} fitted uniformly: ${newStartTime}-${newEndTime} (${optimalDurationForAll}min)`);
        currentStartTime += optimalDurationForAll + bufferTime;
        fittedCount++;
      }

      return {
        message: `Progressive fitting: ALL ${fittedCount} appointments fitted uniformly with ${optimalDurationForAll}min duration - Fair treatment achieved!`,
        fullyFittedAppointments,
        autoRescheduled: [],
        pendingReschedule: [],
        summary: {
          totalAppointments: numberOfAppointments,
          fittedWithOriginalDuration: 0,
          fittedWithProgressiveDuration: fittedCount,
          progressiveDurationUsed: `${optimalDurationForAll} minutes`,
          autoRescheduled: 0,
          pendingReschedule: 0,
          fittingMethod: `all_appointments_uniform_${optimalDurationForAll}min`,
          minimumDurationReached: optimalDurationForAll === 10,
          fairnessAchieved: true,
          overflowCount: 0
        }
      };
    } else {
      // STEP 2: Cannot fit ALL - Try to fit as many as possible with progressive durations
      console.log(`🎯 STEP 2: Cannot fit ALL appointments - trying to fit as many as possible`);
      
      let maxAppointmentsFittable = 0;
      let optimalDurationForPartial = 0;
      
      // Find the best duration that fits the maximum number of appointments
      for (const testDuration of progressiveDurations) {
        // Calculate how many appointments can fit with this duration
        const timePerAppointment = testDuration + bufferTime;
        const maxPossibleAppointments = Math.floor(totalAvailableTime / timePerAppointment);
        const actualFittable = Math.min(maxPossibleAppointments, numberOfAppointments, newSchedule.maxAppointments || numberOfAppointments);
        
        console.log(`📊 ${testDuration} min duration: Can fit ${actualFittable} appointments (max possible: ${maxPossibleAppointments})`);
        
        if (actualFittable > maxAppointmentsFittable && testDuration >= MINIMUM_CONSULTATION_DURATION) {
          optimalDurationForPartial = testDuration;
          maxAppointmentsFittable = actualFittable;
          console.log(`✅ NEW OPTIMAL: ${testDuration} min duration can fit ${actualFittable} appointments`);
        }
      }
      
      if (maxAppointmentsFittable > 0) {
        // PARTIAL SUCCESS: Fit as many appointments as possible
        console.log(`🎯 PARTIAL FITTING: Using ${optimalDurationForPartial} minutes to fit ${maxAppointmentsFittable} of ${numberOfAppointments} appointments`);
        
        let currentStartTime = scheduleStartMin;
        let fittedCount = 0;
        
        // Fit appointments in FIFO order (first booked, first fitted)
        for (let i = 0; i < existingAppointments.length && fittedCount < maxAppointmentsFittable; i++) {
          const appointment = existingAppointments[i];
          
          const oldTime = appointment.startTime && appointment.endTime ? 
            `${appointment.startTime.toISOString().substring(11, 16)}-${appointment.endTime.toISOString().substring(11, 16)}` : 
            'Unknown';

          const appointmentEndTime = currentStartTime + optimalDurationForPartial;
          const newStartTime = fromMinutes(currentStartTime);
          const newEndTime = fromMinutes(appointmentEndTime);

          // Update appointment times within shrunk window
          appointment.startTime = new Date(`${date}T${newStartTime}:00.000Z`);
          appointment.endTime = new Date(`${date}T${newEndTime}:00.000Z`);
          appointment.status = 'scheduled';
          await this.appointmentRepo.save(appointment);

          fullyFittedAppointments.push({
            appointmentId: appointment.id,
            patientName: appointment.patient?.name || 'Unknown',
            oldTime: oldTime,
            newTime: `${newStartTime}-${newEndTime}`,
            status: `partial_fitted_${optimalDurationForPartial}min_duration`
          });

          console.log(`✅ Appointment ${fittedCount + 1} fitted: ${newStartTime}-${newEndTime} (${optimalDurationForPartial}min)`);
          currentStartTime += optimalDurationForPartial + bufferTime;
          fittedCount++;
        }

        // Collect overflow appointments that couldn't fit
        for (let i = maxAppointmentsFittable; i < existingAppointments.length; i++) {
          const appointment = existingAppointments[i];
          appointment.status = 'cancelled'; // Mark for rescheduling
          await this.appointmentRepo.save(appointment);
          overflowAppointments.push(appointment);
        }

        // Handle overflow appointments with intelligent redistribution
        let redistributionResult: {
          autoRescheduled: Array<{
            appointmentId: string;
            patientName: string;
            oldTime: string;
            newTime: string;
            newDate: string;
            timeBucket: string;
            strategy: string;
          }>;
          pendingReschedule: Array<{
            appointmentId: string;
            patientName: string;
            oldTime: string;
            reason: string;
            suggestedAlternatives?: Array<{
              date: string;
              timeBucket: string;
              availableSlots: number;
            }>;
          }>;
        } = { autoRescheduled: [], pendingReschedule: [] };
        
        if (overflowAppointments.length > 0) {
          console.log(`🔄 OVERFLOW: ${overflowAppointments.length} appointments need rescheduling`);
          redistributionResult = await this.redistributeOverflowAppointments(
            overflowAppointments, 
            newSchedule, 
            date
          );
        }

        return {
          message: `Progressive fitting: ${fittedCount} fitted with ${optimalDurationForPartial}min duration, ${redistributionResult.autoRescheduled.length} auto-rescheduled, ${redistributionResult.pendingReschedule.length} pending`,
          fullyFittedAppointments,
          autoRescheduled: redistributionResult.autoRescheduled,
          pendingReschedule: redistributionResult.pendingReschedule,
          summary: {
            totalAppointments: numberOfAppointments,
            fittedWithOriginalDuration: 0,
            fittedWithProgressiveDuration: fittedCount,
            progressiveDurationUsed: `${optimalDurationForPartial} minutes`,
            autoRescheduled: redistributionResult.autoRescheduled.length,
            pendingReschedule: redistributionResult.pendingReschedule.length,
            fittingMethod: `partial_fitting_${optimalDurationForPartial}min`,
            minimumDurationReached: optimalDurationForPartial === 10,
            fairnessAchieved: fittedCount === numberOfAppointments,
            overflowCount: overflowAppointments.length
          }
        };
      } else {
        // COMPLETE FAILURE: Even minimum 10-minute duration cannot fit any appointments
        console.log(`⚠️ CRITICAL: Cannot fit any appointments even with 10-minute duration - rescheduling ALL`);
        
        // Mark all appointments as cancelled for rescheduling
        for (const appointment of existingAppointments) {
          appointment.status = 'cancelled';
          await this.appointmentRepo.save(appointment);
        }
        
        // Handle ALL appointments with intelligent redistribution
        const redistributionResult = await this.redistributeOverflowAppointments(
          existingAppointments, 
          newSchedule, 
          date
        );

        return {
          message: `Progressive fitting: 0 fitted (window too small), ${redistributionResult.autoRescheduled.length} auto-rescheduled, ${redistributionResult.pendingReschedule.length} pending`,
          fullyFittedAppointments: [],
          autoRescheduled: redistributionResult.autoRescheduled,
          pendingReschedule: redistributionResult.pendingReschedule,
          summary: {
            totalAppointments: numberOfAppointments,
            fittedWithOriginalDuration: 0,
            fittedWithProgressiveDuration: 0,
            autoRescheduled: redistributionResult.autoRescheduled.length,
            pendingReschedule: redistributionResult.pendingReschedule.length,
            fittingMethod: 'all_rescheduled_insufficient_space',
            minimumDurationReached: true,
            fairnessAchieved: true,
            reason: 'Window too small to fit any appointments even at 10-minute minimum'
          }
        };
      }
    }
  }

  // Enhanced overflow redistribution with intelligent time bucket scheduling
  async redistributeOverflowAppointments(
    overflowAppointments: Appointment[],
    currentSchedule: { startTime: string; endTime: string; bufferTime?: number },
    currentDate: string
  ) {
    console.log(`🔄 INTELLIGENT RESCHEDULING: Starting redistribution for ${overflowAppointments.length} appointments`);
    
    const autoRescheduled: Array<{
      appointmentId: string;
      patientName: string;
      oldTime: string;
      newTime: string;
      newDate: string;
      timeBucket: string;
      strategy: string;
    }> = [];

    const pendingReschedule: Array<{
      appointmentId: string;
      patientName: string;
      oldTime: string;
      reason: string;
      suggestedAlternatives?: Array<{
        date: string;
        timeBucket: string;
        availableSlots: number;
      }>;
    }> = [];

    // Define time buckets for intelligent scheduling
    const timeBuckets = [
      { name: 'morning', start: '09:00', end: '12:00', priority: 1 },
      { name: 'afternoon', start: '12:00', end: '17:00', priority: 2 },
      { name: 'evening', start: '17:00', end: '20:00', priority: 3 }
    ];

    // CRITICAL FIX: Track slots assigned during redistribution to prevent double-booking
    const assignedSlotsThisSession = new Map<string, Set<string>>(); // date -> Set of "startTime-endTime"

    // Get doctor ID from first appointment
    const doctorId = overflowAppointments[0]?.doctor?.id;
    if (!doctorId) {
      console.log('❌ No doctor ID found in appointments');
      return {
        autoRescheduled: [],
        pendingReschedule: overflowAppointments.map(appointment => ({
          appointmentId: appointment.id,
          patientName: appointment.patient?.name || 'Unknown',
          oldTime: 'Unknown',
          reason: 'Unable to determine doctor for rescheduling'
        })),
        summary: { rescheduledCount: 0, pendingCount: overflowAppointments.length }
      };
    }

    // Helper function to mark slot as assigned
    const markSlotAsAssigned = (date: string, startTime: string, endTime: string) => {
      if (!assignedSlotsThisSession.has(date)) {
        assignedSlotsThisSession.set(date, new Set());
      }
      assignedSlotsThisSession.get(date)!.add(`${startTime}-${endTime}`);
    };

    // Helper function to check if slot is already assigned in this session
    const isSlotAlreadyAssigned = (date: string, startTime: string, endTime: string): boolean => {
      const daySlots = assignedSlotsThisSession.get(date);
      return daySlots ? daySlots.has(`${startTime}-${endTime}`) : false;
    };

    // Try to reschedule each appointment across upcoming days and time buckets
    for (const appointment of overflowAppointments) {
      const oldTime = appointment.startTime && appointment.endTime ? 
        `${appointment.startTime.toISOString().substring(11, 16)}-${appointment.endTime.toISOString().substring(11, 16)}` : 
        'Unknown';

      let rescheduled = false;
      const suggestions: Array<{ date: string; timeBucket: string; availableSlots: number }> = [];

      // Try next 7 days
      for (let dayOffset = 1; dayOffset <= 7 && !rescheduled; dayOffset++) {
        const targetDate = new Date(currentDate);
        targetDate.setDate(targetDate.getDate() + dayOffset);
        const targetDateString = targetDate.toISOString().split('T')[0];

        console.log(`📅 Day ${dayOffset}: Checking ${targetDateString} for appointment ${appointment.id}`);

        // Try each time bucket (morning → afternoon → evening)
        for (const bucket of timeBuckets) {
          console.log(`⏰ Checking ${bucket.name} (${bucket.start}-${bucket.end}) on ${targetDateString}`);

          // Get available slots for this time bucket
          const availableSlots = await this.getAvailableSlotsInTimeBucket(
            doctorId, 
            targetDateString, 
            bucket.start, 
            bucket.end
          );

          if (availableSlots.length > 0) {
            // FIXED: Find first slot not already assigned in this session
            let selectedSlot: { startTime: string; endTime: string } | null = null;
            for (const slot of availableSlots) {
              if (!isSlotAlreadyAssigned(targetDateString, slot.startTime, slot.endTime)) {
                selectedSlot = { startTime: slot.startTime, endTime: slot.endTime };
                break;
              }
            }

            if (selectedSlot) {
              try {
                // CRITICAL: Mark slot as assigned BEFORE updating appointment
                markSlotAsAssigned(targetDateString, selectedSlot.startTime, selectedSlot.endTime);

                // Update appointment with new date and time
                appointment.startTime = new Date(`${targetDateString}T${selectedSlot.startTime}:00.000Z`);
                appointment.endTime = new Date(`${targetDateString}T${selectedSlot.endTime}:00.000Z`);
                appointment.date = targetDateString;
                appointment.status = 'rescheduled';
                
                await this.appointmentRepo.save(appointment);

                autoRescheduled.push({
                  appointmentId: appointment.id,
                  patientName: appointment.patient?.name || 'Unknown',
                  oldTime: oldTime,
                  newTime: `${selectedSlot.startTime}-${selectedSlot.endTime}`,
                  newDate: targetDateString,
                  timeBucket: bucket.name,
                  strategy: `auto_reschedule_day_${dayOffset}_${bucket.name}`
                });

                console.log(`✅ Successfully rescheduled appointment ${appointment.id} to ${targetDateString} ${selectedSlot.startTime}-${selectedSlot.endTime} (${bucket.name})`);
                rescheduled = true;
                break; // Found slot, move to next appointment

              } catch (error) {
                console.log(`❌ Failed to reschedule appointment ${appointment.id}: ${error.message}`);
                // Remove slot from assigned list if save failed
                const daySlots = assignedSlotsThisSession.get(targetDateString);
                if (daySlots) {
                  daySlots.delete(`${selectedSlot.startTime}-${selectedSlot.endTime}`);
                }
              }
            } else {
              console.log(`⚠️ All slots in ${bucket.name} on ${targetDateString} already assigned in this session`);
            }
          } else {
            // No slots available in this bucket, but record for suggestions
            suggestions.push({
              date: targetDateString,
              timeBucket: bucket.name,
              availableSlots: 0
            });
          }
        }
      }

      // If not rescheduled after trying all days and time buckets
      if (!rescheduled) {
        console.log(`⚠️ Could not auto-reschedule appointment ${appointment.id} - adding to pending list`);
        
        pendingReschedule.push({
          appointmentId: appointment.id,
          patientName: appointment.patient?.name || 'Unknown',
          oldTime: oldTime,
          reason: 'No available slots found in next 7 days across all time buckets',
          suggestedAlternatives: suggestions.slice(0, 5) // Top 5 suggestions
        });
      }
    }

    console.log(`🎯 RESCHEDULING COMPLETE: ${autoRescheduled.length} auto-rescheduled, ${pendingReschedule.length} pending manual intervention`);

    return {
      autoRescheduled,
      pendingReschedule,
      summary: {
        rescheduledCount: autoRescheduled.length,
        pendingCount: pendingReschedule.length,
        timeBucketsUsed: [...new Set(autoRescheduled.map(r => r.timeBucket))],
        daysSpread: [...new Set(autoRescheduled.map(r => r.newDate))].length,
        reschedulingStrategy: 'intelligent_time_bucket_redistribution'
      }
    };
  }

  // Helper method to get available slots within a specific time bucket
  private async getAvailableSlotsInTimeBucket(
    doctorId: string, 
    date: string, 
    bucketStart: string, 
    bucketEnd: string
  ) {
    try {
      // Get all available slots for the day
      const availableSlotsResult = await this.getAvailableSlots(doctorId, date);
      
      if (!availableSlotsResult.slots || availableSlotsResult.slots.length === 0) {
        return [];
      }

      // Helper to convert time to minutes for comparison
      const toMinutes = (time: string) => {
        const [h, m] = time.split(':').map(Number);
        return h * 60 + m;
      };

      const bucketStartMin = toMinutes(bucketStart);
      const bucketEndMin = toMinutes(bucketEnd);

      // Filter slots that fall within the time bucket
      const bucketSlots = availableSlotsResult.slots.filter((slot: any) => {
        const slotStartMin = toMinutes(slot.startTime);
        return slotStartMin >= bucketStartMin && slotStartMin < bucketEndMin;
      });

      console.log(`📊 Time bucket ${bucketStart}-${bucketEnd} on ${date}: ${bucketSlots.length} available slots`);
      return bucketSlots;

    } catch (error) {
      console.log(`❌ Error getting slots for time bucket ${bucketStart}-${bucketEnd} on ${date}: ${error.message}`);
      return [];
    }
  }

  // Get all elastic schedules for a doctor
  async getSchedulesByDoctor(doctorId: string) {
    const schedules = await this.elasticScheduleRepo.find({
      where: { doctor: { id: doctorId } },
      relations: ['doctor'],
      order: { date: 'ASC' }
    });

    return {
      message: 'Elastic schedules retrieved successfully',
      schedules
    };
  }

  // Get specific elastic schedule by ID
  async getScheduleById(doctorId: string, scheduleId: string) {
    const schedule = await this.elasticScheduleRepo.findOne({
      where: { 
        id: scheduleId, 
        doctor: { id: doctorId } 
      },
      relations: ['doctor']
    });

    if (!schedule) {
      throw new NotFoundException('Elastic schedule not found');
    }

    return {
      message: 'Elastic schedule retrieved successfully',
      schedule
    };
  }

  // Get elastic schedule by ID only (without doctor ID filter)
  async getScheduleByIdOnly(scheduleId: string) {
    const schedule = await this.elasticScheduleRepo.findOne({
      where: { id: scheduleId },
      relations: ['doctor']
    });

    if (!schedule) {
      throw new NotFoundException('Elastic schedule not found');
    }

    return {
      message: 'Elastic schedule retrieved successfully',
      schedule
    };
  }

  // Update elastic schedule
  async updateSchedule(doctorId: string, scheduleId: string, dto: UpdateElasticScheduleDto, user: any) {
    const schedule = await this.elasticScheduleRepo.findOne({
      where: { 
        id: scheduleId, 
        doctor: { id: doctorId } 
      },
      relations: ['doctor', 'doctor.user']
    });

    if (!schedule) {
      throw new NotFoundException('Elastic schedule not found');
    }

    if (schedule.doctor?.user?.id !== user.sub) {
      throw new BadRequestException('You can only update your own schedules');
    }

    // Update fields
    if (dto.date) schedule.date = dto.date;
    if (dto.startTime) schedule.startTime = dto.startTime;
    if (dto.endTime) schedule.endTime = dto.endTime;
    if (dto.slotDuration) schedule.slotDuration = dto.slotDuration;
    if (dto.bufferTime !== undefined) schedule.bufferTime = dto.bufferTime;
    if (dto.maxAppointments) schedule.maxAppointments = dto.maxAppointments;

    const updatedSchedule = await this.elasticScheduleRepo.save(schedule);

    // Handle automatic appointment rescheduling if requested
    if (dto.adjustExisting) {
      await this.rescheduleExistingAppointments(doctorId, updatedSchedule.date, updatedSchedule);
    }

    return {
      message: 'Elastic schedule updated successfully',
      schedule: updatedSchedule
    };
  }

  // Delete elastic schedule
  async deleteSchedule(doctorId: string, scheduleId: string, user: any) {
    const schedule = await this.elasticScheduleRepo.findOne({
      where: { 
        id: scheduleId, 
        doctor: { id: doctorId } 
      },
      relations: ['doctor', 'doctor.user']
    });

    if (!schedule) {
      throw new NotFoundException('Elastic schedule not found');
    }

    if (schedule.doctor?.user?.id !== user.sub) {
      throw new BadRequestException('You can only delete your own schedules');
    }

    await this.elasticScheduleRepo.remove(schedule);

    return {
      message: 'Elastic schedule deleted successfully'
    };
  }

  // Get elastic slots for a specific date
  async getElasticSlots(doctorId: string, date: string) {
    const schedule = await this.elasticScheduleRepo.findOne({
      where: { 
        doctor: { id: doctorId },
        date: date
      },
      relations: ['doctor']
    });

    if (!schedule) {
      // Check for recurring schedule as fallback
      const dayOfWeek = new Date(date).getDay();
      const recurringSchedules = await this.recurringScheduleRepo.find({
        where: { 
          doctor: { id: doctorId },
          isActive: true
        },
        relations: ['doctor']
      });

      // Find a recurring schedule that includes this day of week
      const recurringSchedule = recurringSchedules.find(schedule => 
        schedule.daysOfWeek.includes(dayOfWeek)
      );

      if (!recurringSchedule) {
        return {
          message: 'No schedule found for this date',
          slots: []
        };
      }

      // Generate slots from recurring schedule
      return this.generateSlotsFromSchedule(recurringSchedule, date);
    }

    // Generate slots from elastic schedule
    return this.generateSlotsFromSchedule(schedule, date);
  }

  // Get available slots (excluding booked appointments)
  async getAvailableSlots(doctorId: string, date: string) {
    const slotsResult = await this.getElasticSlots(doctorId, date);
    
    if (slotsResult.slots.length === 0) {
      return slotsResult;
    }

    // Get booked appointments for this date
    const bookedAppointments = await this.appointmentRepo.find({
      where: {
        doctor: { id: doctorId },
        date: date,
        status: In(['scheduled', 'confirmed'])
      }
    });

    // Filter out booked slots
    const availableSlots = slotsResult.slots.filter((slot: any) => {
      return !bookedAppointments.some(appointment => {
        const appointmentStart = appointment.startTime?.toISOString().substring(11, 16);
        return appointmentStart === slot.startTime;
      });
    });

    return {
      message: 'Available slots retrieved successfully',
      slots: availableSlots,
      totalSlots: slotsResult.slots.length,
      availableCount: availableSlots.length,
      bookedCount: bookedAppointments.length
    };
  }

  // Helper method to generate slots from schedule
  private generateSlotsFromSchedule(schedule: any, date: string) {
    const slots: Array<{
      slotNumber: number;
      startTime: string;
      endTime: string;
      duration: number;
      date: string;
      isAvailable: boolean;
    }> = [];
    
    // Helper functions
    const toMinutes = (t: string) => { 
      const [h, m] = t.split(':').map(Number); 
      return h * 60 + m; 
    };
    const fromMinutes = (m: number) => { 
      const h = Math.floor(m / 60).toString().padStart(2, '0'); 
      const min = (m % 60).toString().padStart(2, '0'); 
      return `${h}:${min}`; 
    };

    const startMinutes = toMinutes(schedule.startTime);
    const endMinutes = toMinutes(schedule.endTime);
    const slotDuration = schedule.slotDuration || 30;
    const bufferTime = schedule.bufferTime || 0;

    let currentTime = startMinutes;
    let slotNumber = 1;

    while (currentTime + slotDuration <= endMinutes) {
      const slotStart = fromMinutes(currentTime);
      const slotEnd = fromMinutes(currentTime + slotDuration);

      slots.push({
        slotNumber,
        startTime: slotStart,
        endTime: slotEnd,
        duration: slotDuration,
        date: date,
        isAvailable: true // Will be updated in getAvailableSlots
      });

      currentTime += slotDuration + bufferTime;
      slotNumber++;

      // Safety check for maxAppointments
      if (schedule.maxAppointments && slotNumber > schedule.maxAppointments) {
        break;
      }
    }

    return {
      message: 'Slots generated successfully',
      slots,
      schedule: {
        type: schedule.constructor.name === 'ElasticScheduleEntity' ? 'elastic' : 'recurring',
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        slotDuration: slotDuration,
        bufferTime: bufferTime,
        maxAppointments: schedule.maxAppointments
      }
    };
  }

  // Get alternative time slots for overflow appointments
  async getAlternativeSlots(doctorId: string, date: string) {
    // Get next 7 days of available slots
    const alternatives: Array<{
      date: string;
      dayName: string;
      availableSlots: any[];
      totalAvailable: number;
    }> = [];
    const currentDate = new Date(date);
    
    for (let i = 1; i <= 7; i++) {
      const nextDate = new Date(currentDate);
      nextDate.setDate(currentDate.getDate() + i);
      const dateString = nextDate.toISOString().split('T')[0];
      
      const availableSlots = await this.getAvailableSlots(doctorId, dateString);
      
      if (availableSlots.slots.length > 0) {
        alternatives.push({
          date: dateString,
          dayName: nextDate.toLocaleDateString('en-US', { weekday: 'long' }),
          availableSlots: availableSlots.slots.slice(0, 3), // First 3 slots
          totalAvailable: availableSlots.slots.length
        });
      }
    }

    return {
      message: 'Alternative slots retrieved successfully',
      originalDate: date,
      alternatives,
      totalAlternativeDays: alternatives.length
    };
  }
}