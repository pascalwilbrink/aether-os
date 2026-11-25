import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Seshat's copy of the department each project is in (Polis's
 * `project.created` and `project.department-changed`, or Polis's API the
 * first time a project comes up): a project sees its department's
 * knowledge.
 */
@Entity({ name: 'project_departments' })
export class ProjectDepartmentEntity {
  @PrimaryColumn({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid', nullable: true })
  departmentId: string | null;

  /** The project's version in Polis this is from: older news changes nothing. */
  @Column({ type: 'integer' })
  version: number;

  @Column({ type: 'timestamptz' })
  updatedAt: Date;
}
