import { SnakeNamingStrategy, snakeCase } from './snake-naming.strategy.js';

describe('SnakeNamingStrategy', () => {
  it.each([
    ['createdAt', 'created_at'],
    ['organizationId', 'organization_id'],
    ['id', 'id'],
    ['OrganizationEntity', 'organization_entity'],
    ['apiURLValue', 'api_url_value'],
  ])('snake-cases %s', (input, expected) => {
    expect(snakeCase(input)).toBe(expected);
  });

  it('names columns and tables, keeping explicit names', () => {
    const strategy = new SnakeNamingStrategy();

    expect(strategy.columnName('createdBy', undefined, [])).toBe('created_by');
    expect(strategy.columnName('x', 'customName', [])).toBe('custom_name');
    expect(strategy.columnName('city', undefined, ['homeAddress'])).toBe(
      'home_address_city',
    );
    expect(strategy.tableName('ProjectEntity', 'projects')).toBe('projects');
    expect(strategy.joinColumnName('ownerUser', 'id')).toBe('owner_user_id');
  });
});
