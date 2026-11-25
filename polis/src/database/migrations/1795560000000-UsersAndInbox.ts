import { MigrationInterface, QueryRunner } from 'typeorm';

/** Polis's copy of Pistis's users, and the inbox for the events it consumes. */
export class UsersAndInbox1795560000000 implements MigrationInterface {
  name = 'UsersAndInbox1795560000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "inbox" (
                "event_id" uuid NOT NULL,
                "source" text NOT NULL,
                "event_type" text NOT NULL,
                "received_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "PK_9b85eb4cab41c7c6023b1e579d0" PRIMARY KEY ("event_id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "users" (
                "id" uuid NOT NULL,
                "display_name" text NOT NULL,
                "email" text,
                "status" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "received_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "ck_users_status" CHECK (status IN ('active', 'disabled')),
                CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id")
            )
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP TABLE "users"
        `);
    await queryRunner.query(`
            DROP TABLE "inbox"
        `);
  }
}
