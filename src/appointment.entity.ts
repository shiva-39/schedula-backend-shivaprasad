import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Patient } from './patient/patient.entity';
import { Doctor } from './doctor/doctor.entity';
import { AvailabilitySlot } from './availability_slot.entity';
import { ElasticScheduleEntity } from './elastic-schedule/elastic-schedule.entity';

@Entity()
export class Appointment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Patient, (patient) => patient.id)
  patient: Patient;

  @ManyToOne(() => Doctor, (doctor) => doctor.id)
  doctor: Doctor;

  @ManyToOne(() => AvailabilitySlot, (slot) => slot.id, { nullable: true })
  slot?: AvailabilitySlot;

  // Elastic scheduling support
  @ManyToOne(() => ElasticScheduleEntity, { nullable: true })
  elasticSchedule?: ElasticScheduleEntity;

  @Column({ type: 'date', nullable: true })
  date?: string;

  @Column({ type: 'time', nullable: true })
  startTime?: string;

  @Column({ type: 'time', nullable: true })
  endTime?: string;

  @Column()
  status: string; // scheduled, rescheduled, cancelled

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
} 