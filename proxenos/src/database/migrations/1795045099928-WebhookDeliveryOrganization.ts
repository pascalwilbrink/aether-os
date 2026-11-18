import { MigrationInterface, QueryRunner } from 'typeorm';

export class WebhookDeliveryOrganization1795045099928 implements MigrationInterface {
  name = 'WebhookDeliveryOrganization1795045099928';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "webhook_deliveries"
            ADD "organization_id" uuid
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "webhook_deliveries" DROP COLUMN "organization_id"
        `);
  }
}
