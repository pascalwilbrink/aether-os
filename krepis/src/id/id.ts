export type Brand<T, B extends string> = T & { readonly __brand: B };

/** IDs every Aether-os service refers to. Service-specific IDs stay in the service. */
export type OrganizationId = Brand<string, 'OrganizationId'>;
export type ProjectId = Brand<string, 'ProjectId'>;
