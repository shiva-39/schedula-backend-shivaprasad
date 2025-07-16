import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Patient } from './patient/patient.entity';
import { Doctor } from './doctor/doctor.entity';
import { AvailabilitySlot } from './availability_slot.entity';

@Entity()
export class Appointment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Patient, (patient) => patient.id)
  patient: Patient;

  @ManyToOne(() => Doctor, (doctor) => doctor.id)
  doctor: Doctor;

  @ManyToOne(() => AvailabilitySlot, (slot) => slot.id)
  slot: AvailabilitySlot;

  @Column()
  status: string; // scheduled, rescheduled, cancelled

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
} 