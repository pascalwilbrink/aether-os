import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/** A person in one of their organization's departments. */
@Entity({ name: 'person_departments' })
// A department's persons.
@Index('ix_person_departments_department_id', ['departmentId'])
export class PersonDepartmentEntity {
  @PrimaryColumn({ type: 'uuid' })
  personId: string;

  @PrimaryColumn({ type: 'uuid' })
  departmentId: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
