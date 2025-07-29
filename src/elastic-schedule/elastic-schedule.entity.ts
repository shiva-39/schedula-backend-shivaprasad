import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Doctor } from '../doctor/doctor.entity';

@Entity('elastic_schedule_entity')
export class ElasticScheduleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Doctor, { eager: true, nullable: false })
  doctor: Doctor;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'time' })
  startTime: string;

  @Column({ type: 'time' })
  endTime: string;

  @Column({ type: 'int' })
  slotDuration: number;

  @Column({ type: 'int', nullable: true })
  bufferTime?: number;

  @Column({ type: 'int', nullable: true })
  maxAppointments?: number;

  @Column({ type: 'varchar', nullable: true })
  recurringTemplateId?: string;

  @Column({ type: 'boolean', default: false })
  isOverride: boolean;

  @Column({ type: 'varchar', nullable: true })
  overrideReason?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
