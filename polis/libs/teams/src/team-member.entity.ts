import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';

/** A person of the organization in one of its teams. */
@Entity({ name: 'team_members' })
@Unique('uq_team_members_team_id_person_id', ['teamId', 'personId'])
// Keyset pagination of a team's members.
@Index('ix_team_members_team_id_added_at_id', ['teamId', 'addedAt', 'id'])
// A person's teams.
@Index('ix_team_members_person_id', ['personId'])
export class TeamMemberEntity {
  /** The membership's own ID: its events' aggregate. */
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  teamId: string;

  @Column({ type: 'uuid' })
  personId: string;

  @Column({ type: 'text' })
  addedBy: string;

  @Column({ type: 'timestamptz' })
  addedAt: Date;
}
