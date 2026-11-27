import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Work assigned and work waiting for review, from Ergon (`work_assigned`, `work_review_requested`). */
export class WorkNotifications1795770693035 implements MigrationInterface {
  name = 'WorkNotifications1795770693035';

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
                        'plan_review_requested',
                        'work_assigned',
                        'work_review_requested'
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
                        'membership_granted',
                        'plan_review_requested'
                    )
                )
        `);
  }
}
