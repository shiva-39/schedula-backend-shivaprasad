import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAvailabilitySlotTable1752792000000 implements MigrationInterface {
    name = 'CreateAvailabilitySlotTable1752792000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "availability_slot" (
                "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
                "doctorId" uuid NOT NULL,
                "startTime" TIMESTAMP NOT NULL,
                "endTime" TIMESTAMP NOT NULL,
                "mode" VARCHAR NOT NULL,
                CONSTRAINT "FK_doctor_availability" FOREIGN KEY ("doctorId") REFERENCES "doctor"("id") ON DELETE CASCADE
            )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "availability_slot"`);
    }
}