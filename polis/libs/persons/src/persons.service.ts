import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, type Repository } from 'typeorm';

import {
  AccessControl,
  findPage,
  isUniqueViolation,
  OnDomainEvent,
  PolisEvents,
  Transactional,
  type DomainEvent,
  type Page,
  type PageRequest,
} from '@polis/core';
import { OrganizationsService } from '@polis/organizations';
import { UsersService, type UserSnapshot } from '@polis/users';

import type { PersonRequest } from './dto/person.request.js';
import type { PersonResponse } from './dto/person.response.js';
import { PersonDepartmentsService } from './person-departments.service.js';
import { PersonEntity } from './person.entity.js';
import { PersonEmailTakenError } from './person.errors.js';
import { PersonMapper, personFields } from './person.mapper.js';

/**
 * The people of an organization: their name, email address, description,
 * role (job title) and gender, the departments they're in, and the Pistis
 * user they are. A person and a user are linked one to one, by email
 * address: when exactly one user has the person's address and no other
 * person of the organization is linked to that user, on creation, on a new
 * address, or when such a user is created later (Pistis's `user.created`).
 * Persons grant nothing; roles stay on memberships.
 */
@Injectable()
export class PersonsService {
  constructor(
    @InjectRepository(PersonEntity)
    private readonly persons: Repository<PersonEntity>,
    private readonly mapper: PersonMapper,
    private readonly organizations: OrganizationsService,
    private readonly departments: PersonDepartmentsService,
    private readonly users: UsersService,
    private readonly events: PolisEvents,
    private readonly access: AccessControl,
  ) {}

  @Transactional()
  async create(
    organizationId: string,
    dto: PersonRequest,
  ): Promise<PersonResponse> {
    await this.organizations.assertAcceptsWrites(organizationId);
    const entity = this.mapper.toEntity(
      dto,
      organizationId,
      this.access.principal().sub,
      new Date(),
    );
    entity.userId = await this.userFor(organizationId, entity.email, entity.id);
    try {
      await this.persons.insert(entity);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new PersonEmailTakenError(entity.email);
      }
      throw error;
    }
    const { departmentIds } = await this.departments.set(
      organizationId,
      entity.id,
      dto.departmentIds ?? [],
    );
    await this.emitChanged('person.created', entity, departmentIds);

    return this.mapper.toResponse(entity, departmentIds);
  }

  async list(
    organizationId: string,
    query: PageRequest & { departmentId?: string; userId?: string },
  ): Promise<Page<PersonResponse>> {
    await this.organizations.assertExists(organizationId);
    const { departmentId, userId, ...page } = query;
    let ids: string[] | undefined;
    if (departmentId) {
      ids = await this.departments.personIdsIn(organizationId, departmentId);
      if (ids.length === 0) {
        return { items: [], nextCursor: null };
      }
    }
    const entities = await findPage(
      this.persons,
      {
        where: {
          organizationId,
          ...(userId ? { userId } : {}),
          ...(ids ? { id: ids } : {}),
        },
        sortBy: 'createdAt',
        direction: 'DESC',
      },
      page,
    );
    const departments = await this.departments.of(
      entities.items.map((entity) => entity.id),
    );

    return {
      items: entities.items.map((entity) =>
        this.mapper.toResponse(entity, departments.get(entity.id) ?? []),
      ),
      nextCursor: entities.nextCursor,
    };
  }

  async findById(
    organizationId: string,
    personId: string,
  ): Promise<PersonResponse> {
    await this.organizations.assertExists(organizationId);
    return this.response(await this.load(organizationId, personId));
  }

  /**
   * For putting a person somewhere (a team): 404 unless they're a person of
   * the organization. Locks the row (shared) until the transaction ends, so
   * they can't be deleted halfway.
   */
  @Transactional()
  async assertExists(organizationId: string, personId: string): Promise<void> {
    const entity = await this.persons.findOne({
      where: { id: personId, organizationId },
      lock: { mode: 'pessimistic_read' },
    });
    if (!entity) {
      throw new NotFoundException(`Person ${personId} not found`);
    }
  }

  /**
   * PUT: every field and the departments. A new email address links the
   * person anew. Unchanged → no new version, no event.
   */
  @Transactional()
  async update(
    organizationId: string,
    personId: string,
    dto: PersonRequest,
  ): Promise<PersonResponse> {
    await this.organizations.assertAcceptsWrites(organizationId);
    const entity = await this.load(organizationId, personId, true);
    const fields = personFields(dto);
    const fieldsChanged = (Object.keys(fields) as (keyof typeof fields)[]).some(
      (key) => entity[key] !== fields[key],
    );
    if (fields.email !== entity.email) {
      entity.userId = await this.userFor(
        organizationId,
        fields.email,
        entity.id,
      );
    }
    Object.assign(entity, fields);
    const { departmentIds, changed } = await this.departments.set(
      organizationId,
      entity.id,
      dto.departmentIds ?? [],
    );
    if (!fieldsChanged && !changed) {
      return this.mapper.toResponse(entity, departmentIds);
    }
    entity.updatedAt = new Date();
    entity.version += 1;
    try {
      await this.persons.save(entity);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new PersonEmailTakenError(entity.email);
      }
      throw error;
    }
    await this.emitChanged('person.updated', entity, departmentIds);

    return this.mapper.toResponse(entity, departmentIds);
  }

  @Transactional()
  async delete(organizationId: string, personId: string): Promise<void> {
    await this.organizations.assertAcceptsWrites(organizationId);
    const entity = await this.load(organizationId, personId, true);
    const version = entity.version + 1;
    await this.departments.removeAll(entity.id);
    await this.persons.delete({ id: entity.id });
    await this.events.emit({
      eventType: 'person.deleted',
      aggregateId: personId,
      aggregateVersion: version,
      organizationId,
      payload: { personId },
    });
  }

  /**
   * Keeps persons linked to the user with their email address as Pistis's
   * users come and change (`user.created`, `.updated`; `.disabled` and
   * `.enabled` change no address, and leave links as they are). The user is
   * recorded first (`UsersService.record`), so this sees them as the event
   * has them whichever handler runs first.
   */
  @OnDomainEvent('pistis.user.created')
  onUserCreated(event: DomainEvent<UserSnapshot>): Promise<void> {
    return this.onUserChanged(event);
  }

  @OnDomainEvent('pistis.user.updated')
  onUserUpdated(event: DomainEvent<UserSnapshot>): Promise<void> {
    return this.onUserChanged(event);
  }

  @OnDomainEvent('pistis.user.disabled')
  onUserDisabled(event: DomainEvent<UserSnapshot>): Promise<void> {
    return this.onUserChanged(event);
  }

  @OnDomainEvent('pistis.user.enabled')
  onUserEnabled(event: DomainEvent<UserSnapshot>): Promise<void> {
    return this.onUserChanged(event);
  }

  /**
   * After a user event: persons linked to the user whose address is no
   * longer the user's are unlinked (and linked to the one other user with
   * their address, if there is one); persons waiting with the user's
   * address are linked to them when they're the only user with it. Works
   * from Polis's copy of the user (the newest event), so an older event
   * arriving late changes nothing.
   */
  private async onUserChanged(event: DomainEvent<UserSnapshot>): Promise<void> {
    await this.users.record(event);
    const user = await this.users.find(event.payload.userId);
    if (!user) {
      return;
    }
    const email = user.email?.trim().toLowerCase() ?? null;

    const linked = await this.persons.find({
      where: { userId: user.id },
      lock: { mode: 'pessimistic_write' },
    });
    for (const entity of linked) {
      if (entity.email === email) {
        continue;
      }
      entity.userId = null;
      entity.userId = await this.userFor(
        entity.organizationId,
        entity.email,
        entity.id,
      );
      await this.saveLinkChange(entity);
    }

    if (!email || (await this.users.idsWithEmail(email)).length !== 1) {
      return;
    }
    const waiting = await this.persons.find({
      where: { email, userId: IsNull() },
      lock: { mode: 'pessimistic_write' },
    });
    for (const entity of waiting) {
      if (await this.isLinked(entity.organizationId, user.id, entity.id)) {
        continue;
      }
      entity.userId = user.id;
      await this.saveLinkChange(entity);
    }
  }

  /** A person whose linked user changed: a new version and `person.updated`. */
  private async saveLinkChange(entity: PersonEntity): Promise<void> {
    entity.updatedAt = new Date();
    entity.version += 1;
    await this.persons.save(entity);
    const departments = await this.departments.of([entity.id]);
    await this.emitChanged(
      'person.updated',
      entity,
      departments.get(entity.id) ?? [],
    );
  }

  /**
   * The user to link a person with this address to: the one user with it,
   * unless another person of the organization is linked to them already.
   */
  private async userFor(
    organizationId: string,
    email: string,
    personId: string,
  ): Promise<string | null> {
    const ids = await this.users.idsWithEmail(email);
    if (ids.length !== 1) {
      return null;
    }
    return (await this.isLinked(organizationId, ids[0], personId))
      ? null
      : ids[0];
  }

  private isLinked(
    organizationId: string,
    userId: string,
    exceptPersonId: string,
  ): Promise<boolean> {
    return this.persons.existsBy({
      organizationId,
      userId,
      id: Not(exceptPersonId),
    });
  }

  private async emitChanged(
    eventType: 'person.created' | 'person.updated',
    entity: PersonEntity,
    departmentIds: string[],
  ): Promise<void> {
    await this.events.emit({
      eventType,
      aggregateId: entity.id,
      aggregateVersion: entity.version,
      organizationId: entity.organizationId,
      payload: { personId: entity.id, userId: entity.userId, departmentIds },
    });
  }

  private async response(entity: PersonEntity): Promise<PersonResponse> {
    const departments = await this.departments.of([entity.id]);
    return this.mapper.toResponse(entity, departments.get(entity.id) ?? []);
  }

  /** Scoped to the organization: another organization's person is a 404. */
  private async load(
    organizationId: string,
    personId: string,
    forUpdate = false,
  ): Promise<PersonEntity> {
    const entity = await this.persons.findOne({
      where: { id: personId, organizationId },
      ...(forUpdate ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!entity) {
      throw new NotFoundException(`Person ${personId} not found`);
    }
    return entity;
  }
}
