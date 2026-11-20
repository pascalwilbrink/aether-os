import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { GenericContainer, Wait } from 'testcontainers';

/** The S3-compatible store tests run against: the one in docker-compose.yml. */
export const RUSTFS_TEST_IMAGE =
  process.env.RUSTFS_TEST_IMAGE ?? 'rustfs/rustfs:1.0.5';

export const TEST_BUCKET = 'loculus-test';
export const TEST_ACCESS_KEY = 'loculus';
export const TEST_SECRET_KEY = 'loculus-test-secret';

/** A throwaway RustFS with the test bucket, for a run's global setup. */
export async function startTestStorage(): Promise<{
  endpoint: string;
  stop(): Promise<void>;
}> {
  const container = await new GenericContainer(RUSTFS_TEST_IMAGE)
    .withEnvironment({
      RUSTFS_ACCESS_KEY: TEST_ACCESS_KEY,
      RUSTFS_SECRET_KEY: TEST_SECRET_KEY,
    })
    .withCommand(['/data'])
    .withExposedPorts(9000)
    .withWaitStrategy(Wait.forListeningPorts())
    .start();
  const endpoint = `http://${container.getHost()}:${container.getMappedPort(9000)}`;
  const s3 = new S3Client({
    endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: TEST_ACCESS_KEY,
      secretAccessKey: TEST_SECRET_KEY,
    },
  });
  // Listening isn't ready: retry making the bucket for a while.
  for (let attempt = 1; ; attempt++) {
    try {
      await s3.send(new CreateBucketCommand({ Bucket: TEST_BUCKET }));
      break;
    } catch (error) {
      if (attempt >= 30) {
        await container.stop();
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  s3.destroy();
  return {
    endpoint,
    stop: async () => {
      await container.stop();
    },
  };
}
