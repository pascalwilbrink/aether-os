import { DefaultNamingStrategy, type NamingStrategyInterface } from 'typeorm';

/** `createdAt` → `created_at`, `OrganizationEntity` → `organization_entity`. */
export function snakeCase(value: string): string {
  return value
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z\d])/g, '$1_$2')
    .toLowerCase();
}

/**
 * Database names in `snake_case`, derived from the `camelCase` properties
 * (docs/engineering.md). Explicit names given to `@Entity` / `@Column` win.
 */
export class SnakeNamingStrategy
  extends DefaultNamingStrategy
  implements NamingStrategyInterface
{
  override tableName(targetName: string, userSpecifiedName?: string): string {
    return userSpecifiedName ?? snakeCase(targetName);
  }

  override columnName(
    propertyName: string,
    customName: string | undefined,
    embeddedPrefixes: string[],
  ): string {
    return snakeCase(
      [...embeddedPrefixes, customName ?? propertyName].join('_'),
    );
  }

  override relationName(propertyName: string): string {
    return snakeCase(propertyName);
  }

  override joinColumnName(
    relationName: string,
    referencedColumnName: string,
  ): string {
    return snakeCase(`${relationName}_${referencedColumnName}`);
  }

  override joinTableColumnName(
    tableName: string,
    propertyName: string,
    columnName?: string,
  ): string {
    return snakeCase(`${tableName}_${columnName ?? propertyName}`);
  }
}
