import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, type Repository } from 'typeorm';

import { DepartmentsService } from '@polis/departments';

import { PersonDepartmentEntity } from './person-department.entity.js';

/**
 * Which of their organization's departments each person is in. A person
 * joins only active departments (`DEPARTMENT_ARCHIVED`, a 404 for another
 * organization's); staying in one that was archived since is fine.
 */
@Injectable()
export class PersonDepartmentsService {
  constructor(
    @InjectRepository(PersonDepartmentEntity)
    private readonly links: Repository<PersonDepartmentEntity>,
    private readonly departments: DepartmentsService,
  ) {}

  /**
   * Puts the person in exactly these departments; returns them sorted, and
   * whether anything changed.
   */
  async set(
    organizationId: string,
    personId: string,
    departmentIds: readonly string[],
  ): Promise<{ departmentIds: string[]; changed: boolean }> {
    const wanted = [...new Set(departmentIds)].sort();
    const current = (await this.of([personId])).get(personId) ?? [];
    const joining = wanted.filter((id) => !current.includes(id));
    const leaving = current.filter((id) => !wanted.includes(id));
    for (const departmentId of joining) {
      await this.departments.assertActive(organizationId, departmentId);
    }
    if (leaving.length > 0) {
      await this.links.delete({ personId, departmentId: In(leaving) });
    }
    if (joining.length > 0) {
      const now = new Date();
      await this.links.insert(
        joining.map((departmentId) => ({
          personId,
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

  /** Each person's departments, sorted. */
  async of(personIds: readonly string[]): Promise<Map<string, string[]>> {
    const byPerson = new Map<string, string[]>(personIds.map((id) => [id, []]));
    if (personIds.length === 0) {
      return byPerson;
    }
    const rows = await this.links.find({
      where: { personId: In([...personIds]) },
      order: { departmentId: 'ASC' },
    });
    for (const row of rows) {
      byPerson.get(row.personId)?.push(row.departmentId);
    }
    return byPerson;
  }

  /** The persons in a department of the organization (404 for another's). */
  async personIdsIn(
    organizationId: string,
    departmentId: string,
  ): Promise<string[]> {
    await this.departments.assertExists(organizationId, departmentId);
    const rows = await this.links.find({
      where: { organizationId, departmentId },
      select: { personId: true },
    });
    return rows.map((row) => row.personId);
  }

  async removeAll(personId: string): Promise<void> {
    await this.links.delete({ personId });
  }
}
