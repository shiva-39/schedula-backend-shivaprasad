import { MigrationInterface, QueryRunner } from "typeorm";

export class InitSchema1752659380216 implements MigrationInterface {
    name = 'InitSchema1752659380216'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "doctor" DROP CONSTRAINT "FK_e573a17ab8b6eea2b7fe9905fa8"`);
        await queryRunner.query(`ALTER TABLE "patient" DROP CONSTRAINT "FK_6636aefca0bdad8933c7cc3e394"`);
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "passwordHash"`);
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "role"`);
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "createdAt"`);
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "updatedAt"`);
        await queryRunner.query(`ALTER TABLE "doctor" DROP COLUMN "specialty"`);
        await queryRunner.query(`ALTER TABLE "doctor" DROP COLUMN "fullName"`);
        await queryRunner.query(`ALTER TABLE "doctor" DROP COLUMN "bio"`);
        await queryRunner.query(`ALTER TABLE "doctor" DROP COLUMN "profileImage"`);
        await queryRunner.query(`ALTER TABLE "doctor" DROP COLUMN "experience"`);
        await queryRunner.query(`ALTER TABLE "doctor" DROP COLUMN "createdAt"`);
        await queryRunner.query(`ALTER TABLE "doctor" DROP COLUMN "updatedAt"`);
        await queryRunner.query(`ALTER TABLE "doctor" DROP COLUMN "userId"`);
        await queryRunner.query(`ALTER TABLE "patient" DROP COLUMN "fullName"`);
        await queryRunner.query(`ALTER TABLE "patient" DROP COLUMN "age"`);
        await queryRunner.query(`ALTER TABLE "patient" DROP COLUMN "gender"`);
        await queryRunner.query(`ALTER TABLE "patient" DROP COLUMN "place"`);
        await queryRunner.query(`ALTER TABLE "patient" DROP COLUMN "createdAt"`);
        await queryRunner.query(`ALTER TABLE "patient" DROP COLUMN "updatedAt"`);
        await queryRunner.query(`ALTER TABLE "patient" DROP COLUMN "userId"`);
        await queryRunner.query(`ALTER TABLE "user" ADD "name" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "user" ADD "password" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "doctor" ADD "name" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "doctor" ADD "specialization" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "doctor" ADD "email" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "doctor" ADD CONSTRAINT "UQ_bf6303ac911efaab681dc911f54" UNIQUE ("email")`);
        await queryRunner.query(`ALTER TABLE "patient" ADD "name" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "patient" ADD "dateOfBirth" TIMESTAMP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "patient" ADD "email" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "patient" ADD CONSTRAINT "UQ_2c56e61f9e1afb07f28882fcebb" UNIQUE ("email")`);
        await queryRunner.query(`ALTER TABLE "user" DROP CONSTRAINT "PK_cace4a159ff9f2512dd42373760"`);
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "id"`);
        await queryRunner.query(`ALTER TABLE "user" ADD "id" SERIAL NOT NULL`);
        await queryRunner.query(`ALTER TABLE "user" ADD CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id")`);
        await queryRunner.query(`ALTER TABLE "doctor" DROP CONSTRAINT "PK_ee6bf6c8de78803212c548fcb94"`);
        await queryRunner.query(`ALTER TABLE "doctor" DROP COLUMN "id"`);
        await queryRunner.query(`ALTER TABLE "doctor" ADD "id" SERIAL NOT NULL`);
        await queryRunner.query(`ALTER TABLE "doctor" ADD CONSTRAINT "PK_ee6bf6c8de78803212c548fcb94" PRIMARY KEY ("id")`);
        await queryRunner.query(`ALTER TABLE "patient" DROP CONSTRAINT "PK_8dfa510bb29ad31ab2139fbfb99"`);
        await queryRunner.query(`ALTER TABLE "patient" DROP COLUMN "id"`);
        await queryRunner.query(`ALTER TABLE "patient" ADD "id" SERIAL NOT NULL`);
        await queryRunner.query(`ALTER TABLE "patient" ADD CONSTRAINT "PK_8dfa510bb29ad31ab2139fbfb99" PRIMARY KEY ("id")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "patient" DROP CONSTRAINT "PK_8dfa510bb29ad31ab2139fbfb99"`);
        await queryRunner.query(`ALTER TABLE "patient" DROP COLUMN "id"`);
        await queryRunner.query(`ALTER TABLE "patient" ADD "id" uuid NOT NULL DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "patient" ADD CONSTRAINT "PK_8dfa510bb29ad31ab2139fbfb99" PRIMARY KEY ("id")`);
        await queryRunner.query(`ALTER TABLE "doctor" DROP CONSTRAINT "PK_ee6bf6c8de78803212c548fcb94"`);
        await queryRunner.query(`ALTER TABLE "doctor" DROP COLUMN "id"`);
        await queryRunner.query(`ALTER TABLE "doctor" ADD "id" uuid NOT NULL DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "doctor" ADD CONSTRAINT "PK_ee6bf6c8de78803212c548fcb94" PRIMARY KEY ("id")`);
        await queryRunner.query(`ALTER TABLE "user" DROP CONSTRAINT "PK_cace4a159ff9f2512dd42373760"`);
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "id"`);
        await queryRunner.query(`ALTER TABLE "user" ADD "id" uuid NOT NULL DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "user" ADD CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id")`);
        await queryRunner.query(`ALTER TABLE "patient" DROP CONSTRAINT "UQ_2c56e61f9e1afb07f28882fcebb"`);
        await queryRunner.query(`ALTER TABLE "patient" DROP COLUMN "email"`);
        await queryRunner.query(`ALTER TABLE "patient" DROP COLUMN "dateOfBirth"`);
        await queryRunner.query(`ALTER TABLE "patient" DROP COLUMN "name"`);
        await queryRunner.query(`ALTER TABLE "doctor" DROP CONSTRAINT "UQ_bf6303ac911efaab681dc911f54"`);
        await queryRunner.query(`ALTER TABLE "doctor" DROP COLUMN "email"`);
        await queryRunner.query(`ALTER TABLE "doctor" DROP COLUMN "specialization"`);
        await queryRunner.query(`ALTER TABLE "doctor" DROP COLUMN "name"`);
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "password"`);
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "name"`);
        await queryRunner.query(`ALTER TABLE "patient" ADD "userId" uuid`);
        await queryRunner.query(`ALTER TABLE "patient" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "patient" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "patient" ADD "place" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "patient" ADD "gender" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "patient" ADD "age" integer NOT NULL`);
        await queryRunner.query(`ALTER TABLE "patient" ADD "fullName" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "doctor" ADD "userId" uuid`);
        await queryRunner.query(`ALTER TABLE "doctor" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "doctor" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "doctor" ADD "experience" integer NOT NULL`);
        await queryRunner.query(`ALTER TABLE "doctor" ADD "profileImage" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "doctor" ADD "bio" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "doctor" ADD "fullName" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "doctor" ADD "specialty" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "user" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "user" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "user" ADD "role" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "user" ADD "passwordHash" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "patient" ADD CONSTRAINT "FK_6636aefca0bdad8933c7cc3e394" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "doctor" ADD CONSTRAINT "FK_e573a17ab8b6eea2b7fe9905fa8" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}