import { MigrationInterface, QueryRunner } from 'typeorm';

export class Initial1795138973918 implements MigrationInterface {
  name = 'Initial1795138973918';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "files" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "project_id" uuid NOT NULL,
                "object_key" text NOT NULL,
                "file_name" text NOT NULL,
                "content_type" text NOT NULL,
                "size_bytes" bigint NOT NULL,
                "sha256" text NOT NULL,
                "status" text NOT NULL,
                "created_by" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "completed_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "UQ_6c57037b6168cbed8f265636656" UNIQUE ("object_key"),
                CONSTRAINT "ck_files_size_bytes" CHECK (size_bytes >= 0),
                CONSTRAINT "ck_files_status" CHECK (status IN ('pending', 'available')),
                CONSTRAINT "PK_6c16b9093a142e0e7613b04a3d9" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_files_project_status_created" ON "files" (
                "organization_id",
                "project_id",
                "status",
                "created_at",
                "id"
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_files_project_created" ON "files" (
                "organization_id",
                "project_id",
                "created_at",
                "id"
            )
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "public"."ix_files_project_created"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_files_project_status_created"
        `);
    await queryRunner.query(`
            DROP TABLE "files"
        `);
  }
}
