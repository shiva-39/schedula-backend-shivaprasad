import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Doctor } from './doctor/doctor.entity';
import { Patient } from './patient/patient.entity';

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  passwordHash: string;

  @Column()
  role: string;  // 'doctor' | 'patient'

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  @OneToMany(() => Doctor, (doctor) => doctor.user)
  doctors: Doctor[];

  @OneToMany(() => Patient, (patient) => patient.user)
  patients: Patient[];
} 