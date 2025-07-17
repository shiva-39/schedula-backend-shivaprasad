import { MigrationInterface, QueryRunner } from "typeorm";

export class InitSchema1752746330820 implements MigrationInterface {
    name = 'InitSchema1752746330820'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "availability_slot" DROP CONSTRAINT "FK_doctor_availability"
        `);
        await queryRunner.query(`
            CREATE TABLE "appointment" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "status" character varying NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                "patientId" uuid,
                "doctorId" uuid,
                "slotId" uuid,
                CONSTRAINT "PK_e8be1a53027415e709ce8a2db74" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            ALTER TABLE "availability_slot"
            ALTER COLUMN "doctorId" DROP NOT NULL
        `);
        await queryRunner.query(`
            ALTER TABLE "availability_slot"
            ADD CONSTRAINT "FK_c755c86a717b01a8fdcf455fd92" FOREIGN KEY ("doctorId") REFERENCES "doctor"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "appointment"
            ADD CONSTRAINT "FK_5ce4c3130796367c93cd817948e" FOREIGN KEY ("patientId") REFERENCES "patient"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "appointment"
            ADD CONSTRAINT "FK_514bcc3fb1b8140f85bf1cde6e2" FOREIGN KEY ("doctorId") REFERENCES "doctor"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "appointment"
            ADD CONSTRAINT "FK_b463fce395ead7791607a5c33eb" FOREIGN KEY ("slotId") REFERENCES "availability_slot"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "appointment" DROP CONSTRAINT "FK_b463fce395ead7791607a5c33eb"
        `);
        await queryRunner.query(`
            ALTER TABLE "appointment" DROP CONSTRAINT "FK_514bcc3fb1b8140f85bf1cde6e2"
        `);
        await queryRunner.query(`
            ALTER TABLE "appointment" DROP CONSTRAINT "FK_5ce4c3130796367c93cd817948e"
        `);
        await queryRunner.query(`
            ALTER TABLE "availability_slot" DROP CONSTRAINT "FK_c755c86a717b01a8fdcf455fd92"
        `);
        await queryRunner.query(`
            ALTER TABLE "availability_slot"
            ALTER COLUMN "doctorId"
            SET NOT NULL
        `);
        await queryRunner.query(`
            DROP TABLE "appointment"
        `);
        await queryRunner.query(`
            ALTER TABLE "availability_slot"
            ADD CONSTRAINT "FK_doctor_availability" FOREIGN KEY ("doctorId") REFERENCES "doctor"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    }

}
