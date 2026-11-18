import { MigrationInterface, QueryRunner } from 'typeorm';

/** An organization's members of one kind (users, service accounts), for keyset pagination. */
export class MembershipsBySubjectType1795000000000 implements MigrationInterface {
  name = 'MembershipsBySubjectType1795000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE INDEX "ix_memberships_organization_id_subject_type_created_at_id" ON "memberships" (
                "organization_id",
                "subject_type",
                "created_at",
                "id"
            )
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "public"."ix_memberships_organization_id_subject_type_created_at_id"
        `);
  }
}
