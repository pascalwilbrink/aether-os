import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExecutionEvents1795165184112 implements MigrationInterface {
  name = 'ExecutionEvents1795165184112';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "execution_events" (
                "id" uuid NOT NULL,
                "execution_id" uuid NOT NULL,
                "sequence" integer NOT NULL,
                "type" text NOT NULL,
                "level" text NOT NULL,
                "message" text NOT NULL,
                "tool_name" text,
                "input" text,
                "output" text,
                "text" text,
                "input_tokens" integer,
                "output_tokens" integer,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "ck_execution_events_level" CHECK (level IN ('info', 'warn', 'error')),
                CONSTRAINT "ck_execution_events_type" CHECK (type IN ('log', 'model_call', 'tool_call')),
                CONSTRAINT "PK_7696142eac15159f499be26321d" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_execution_events_execution_id_sequence" ON "execution_events" ("execution_id", "sequence")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "public"."uq_execution_events_execution_id_sequence"
        `);
    await queryRunner.query(`
            DROP TABLE "execution_events"
        `);
  }
}
