import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Doctor } from '../doctor/doctor.entity';

@Entity()
export class RecurringScheduleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Doctor, { eager: true })
  doctor: Doctor;

  @Column()
  name: string; // e.g., "Monday Evening Slots"

  @Column({ type: 'time' })
  startTime: string;

  @Column({ type: 'time' })
  endTime: string;

  @Column()
  slotDuration: number; // in minutes

  @Column({ nullable: true })
  bufferTime: number; // in minutes

  @Column({ nullable: true })
  maxAppointments: number;

  // Days of the week this schedule applies to (0 = Sunday, 1 = Monday, etc.)
  @Column('int', { array: true })
  daysOfWeek: number[];

  // How many weeks ahead to generate schedules
  @Column({ default: 4 })
  weeksAhead: number;

  // Whether this template is active
  @Column({ default: true })
  isActive: boolean;

  // Allow overrides on specific dates
  @Column({ default: true })
  allowOverrides: boolean;

  // Auto-generation settings
  @Column({ default: true })
  autoGenerate: boolean;

  // Last date when schedules were auto-generated
  @Column({ type: 'date', nullable: true })
  lastGeneratedDate: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
