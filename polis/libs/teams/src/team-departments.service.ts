import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, type Repository } from 'typeorm';

import { DepartmentsService } from '@polis/departments';

import { TeamDepartmentEntity } from './team-department.entity.js';

/**
 * Which of their organization's departments each team is in. A team joins
 * only active departments (`DEPARTMENT_ARCHIVED`, a 404 for another
 * organization's); staying in one that was archived since is fine.
 */
@Injectable()
export class TeamDepartmentsService {
  constructor(
    @InjectRepository(TeamDepartmentEntity)
    private readonly links: Repository<TeamDepartmentEntity>,
    private readonly departments: DepartmentsService,
  ) {}

  /** Puts the team in exactly these departments; returns them sorted, and whether anything changed. */
  async set(
    organizationId: string,
    teamId: string,
    departmentIds: readonly string[],
  ): Promise<{ departmentIds: string[]; changed: boolean }> {
    const wanted = [...new Set(departmentIds)].sort();
    const current = (await this.of([teamId])).get(teamId) ?? [];
    const joining = wanted.filter((id) => !current.includes(id));
    const leaving = current.filter((id) => !wanted.includes(id));
    for (const departmentId of joining) {
      await this.departments.assertActive(organizationId, departmentId);
    }
    if (leaving.length > 0) {
      await this.links.delete({ teamId, departmentId: In(leaving) });
    }
    if (joining.length > 0) {
      const now = new Date();
      await this.links.insert(
        joining.map((departmentId) => ({
          teamId,
          departmentId,
          organizationId,
          createdAt: now,
        })),
      );
    }
    return {
      departmentIds: wanted,
      changed: joining.length > 0 || leaving.length > 0,
    };
  }

  /** Each team's departments, sorted. */
  async of(teamIds: readonly string[]): Promise<Map<string, string[]>> {
    const byTeam = new Map<string, string[]>(teamIds.map((id) => [id, []]));
    if (teamIds.length === 0) {
      return byTeam;
    }
    const rows = await this.links.find({
      where: { teamId: In([...teamIds]) },
      order: { departmentId: 'ASC' },
    });
    for (const row of rows) {
      byTeam.get(row.teamId)?.push(row.departmentId);
    }
    return byTeam;
  }

  /** The teams in a department of the organization (404 for another's). */
  async teamIdsIn(
    organizationId: string,
    departmentId: string,
  ): Promise<string[]> {
    await this.departments.assertExists(organizationId, departmentId);
    const rows = await this.links.find({
      where: { organizationId, departmentId },
      select: { teamId: true },
    });
    return rows.map((row) => row.teamId);
  }
}
