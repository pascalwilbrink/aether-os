import { Check, Column, Entity, PrimaryColumn, Unique } from 'typeorm';

/**
 * A pull request on a connected repository, as GitHub's webhooks last
 * described it; `version` orders its `git.pull-request.updated` events.
 */
@Entity({ name: 'pull_requests' })
@Unique('uq_pull_requests_repository_id_number', ['repositoryId', 'number'])
@Check('ck_pull_requests_state', `state IN ('open', 'closed', 'merged')`)
export class PullRequestEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  repositoryId: string;

  @Column({ type: 'integer' })
  number: number;

  @Column({ type: 'text' })
  url: string;

  @Column({ type: 'text' })
  state: 'open' | 'closed' | 'merged';

  @Column({ type: 'text' })
  branch: string;

  @Column({ type: 'text' })
  baseBranch: string;

  @Column({ type: 'text' })
  headSha: string;

  @Column({ type: 'timestamptz', nullable: true })
  mergedAt: Date | null;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'integer', default: 1 })
  version: number;
}
