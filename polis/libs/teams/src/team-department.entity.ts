import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/** A team in one of its organization's departments. */
@Entity({ name: 'team_departments' })
// A department's teams.
@Index('ix_team_departments_department_id', ['departmentId'])
export class TeamDepartmentEntity {
  @PrimaryColumn({ type: 'uuid' })
  teamId: string;

  @PrimaryColumn({ type: 'uuid' })
  departmentId: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
