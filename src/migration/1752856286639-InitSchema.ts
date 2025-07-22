import { MigrationInterface, QueryRunner } from "typeorm";

export class InitSchema1752856286639 implements MigrationInterface {
    name = 'InitSchema1752856286639'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "doctor" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "specialization" character varying NOT NULL, "yearsExperience" integer NOT NULL, "userId" uuid, CONSTRAINT "PK_ee6bf6c8de78803212c548fcb94" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "patient" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "gender" character varying NOT NULL, "age" integer NOT NULL, "phoneNumber" character varying NOT NULL, "userId" uuid, CONSTRAINT "PK_8dfa510bb29ad31ab2139fbfb99" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "user" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "passwordHash" character varying NOT NULL, "role" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_e12875dfb3b1d92d7d7c5377e22" UNIQUE ("email"), CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "availability_slot" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "startTime" TIMESTAMP NOT NULL, "endTime" TIMESTAMP NOT NULL, "mode" character varying NOT NULL, "doctorId" uuid, CONSTRAINT "PK_62a782c29fd83da5ba7c4ea55f7" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "elastic_schedule_entity" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "doctorId" uuid, "date" date NOT NULL, "startTime" time NOT NULL, "endTime" time NOT NULL, "slotDuration" integer NOT NULL, "bufferTime" integer, "maxAppointments" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_elastic_schedule_entity_id" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "elastic_schedule_entity" ADD CONSTRAINT "FK_elastic_schedule_doctor" FOREIGN KEY ("doctorId") REFERENCES "doctor"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`CREATE TABLE "appointment" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "status" character varying NOT NULL, "date" date, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "patientId" uuid, "doctorId" uuid, "slotId" uuid, "elasticScheduleId" uuid, CONSTRAINT "PK_e8be1a53027415e709ce8a2db74" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "doctor" ADD CONSTRAINT "FK_e573a17ab8b6eea2b7fe9905fa8" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "patient" ADD CONSTRAINT "FK_6636aefca0bdad8933c7cc3e394" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "availability_slot" ADD CONSTRAINT "FK_c755c86a717b01a8fdcf455fd92" FOREIGN KEY ("doctorId") REFERENCES "doctor"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "appointment" ADD CONSTRAINT "FK_5ce4c3130796367c93cd817948e" FOREIGN KEY ("patientId") REFERENCES "patient"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "appointment" ADD CONSTRAINT "FK_514bcc3fb1b8140f85bf1cde6e2" FOREIGN KEY ("doctorId") REFERENCES "doctor"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "appointment" ADD CONSTRAINT "FK_b463fce395ead7791607a5c33eb" FOREIGN KEY ("slotId") REFERENCES "availability_slot"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "appointment" ADD CONSTRAINT "FK_elasticSchedule_appointment" FOREIGN KEY ("elasticScheduleId") REFERENCES "elastic_schedule_entity"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "appointment" DROP CONSTRAINT "FK_elasticSchedule_appointment"`);
        await queryRunner.query(`ALTER TABLE "appointment" DROP CONSTRAINT "FK_b463fce395ead7791607a5c33eb"`);
        await queryRunner.query(`ALTER TABLE "appointment" DROP CONSTRAINT "FK_514bcc3fb1b8140f85bf1cde6e2"`);
        await queryRunner.query(`ALTER TABLE "appointment" DROP CONSTRAINT "FK_5ce4c3130796367c93cd817948e"`);
        await queryRunner.query(`ALTER TABLE "availability_slot" DROP CONSTRAINT "FK_c755c86a717b01a8fdcf455fd92"`);
        await queryRunner.query(`ALTER TABLE "patient" DROP CONSTRAINT "FK_6636aefca0bdad8933c7cc3e394"`);
        await queryRunner.query(`ALTER TABLE "doctor" DROP CONSTRAINT "FK_e573a17ab8b6eea2b7fe9905fa8"`);
        await queryRunner.query(`ALTER TABLE "elastic_schedule_entity" DROP CONSTRAINT "FK_elastic_schedule_doctor"`);
        await queryRunner.query(`DROP TABLE "elastic_schedule_entity"`);
        await queryRunner.query(`DROP TABLE "appointment"`);
        await queryRunner.query(`DROP TABLE "availability_slot"`);
        await queryRunner.query(`DROP TABLE "user"`);
        await queryRunner.query(`DROP TABLE "patient"`);
        await queryRunner.query(`DROP TABLE "doctor"`);
    }

}