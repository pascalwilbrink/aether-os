import type { MigrationInterface, QueryRunner } from 'typeorm';

/** A council's plan waiting for review (`plan_review_requested`). */
export class PlanReviewNotifications1795520000000 implements MigrationInterface {
  name = 'PlanReviewNotifications1795520000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "notifications" DROP CONSTRAINT "ck_notifications_type"
        `);
    await queryRunner.query(`
            ALTER TABLE "notifications"
            ADD CONSTRAINT "ck_notifications_type" CHECK (
                    type IN (
                        'review_requested',
                        'task_failed',
                        'task_succeeded',
                        'task_paused',
                        'budget_threshold',
                        'membership_granted',
                        'plan_review_requested'
                    )
                )
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "notifications" DROP CONSTRAINT "ck_notifications_type"
        `);
    await queryRunner.query(`
            ALTER TABLE "notifications"
            ADD CONSTRAINT "ck_notifications_type" CHECK (
                    type IN (
                        'review_requested',
                        'task_failed',
                        'task_succeeded',
                        'task_paused',
                        'budget_threshold',
                        'membership_granted'
                    )
                )
        `);
  }
}
