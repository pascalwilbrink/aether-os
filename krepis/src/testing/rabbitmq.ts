import { RabbitMQContainer } from '@testcontainers/rabbitmq';

/** The RabbitMQ version tests run against: the one in docker-compose.yml. */
export const RABBITMQ_TEST_IMAGE =
  process.env.RABBITMQ_TEST_IMAGE ?? 'rabbitmq:4.1-management';

export interface TestRabbitMq {
  url: string;
  stop(): Promise<void>;
}

/** Starts a throwaway RabbitMQ in a container (Testcontainers). */
export async function startTestRabbitMq(): Promise<TestRabbitMq> {
  const container = await new RabbitMQContainer(RABBITMQ_TEST_IMAGE).start();

  return {
    url: container.getAmqpUrl(),
    stop: async () => {
      await container.stop();
    },
  };
}
