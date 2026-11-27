// Sets up the local Uptime Kuma (docker-compose.yml, `uptime-kuma-setup`):
// the admin account on first run, then a monitor for every Aether-os
// service's /health and for the infrastructure next to it. Monitors that
// exist already (by name) are left as they are, so edits made in the UI
// stay; delete one there to have it made again. Runs in Uptime Kuma's own
// image, with its socket.io client (NODE_PATH=/app/node_modules).
'use strict';

const { io } = require('socket.io-client');

const KUMA_URL = process.env.KUMA_URL ?? 'http://uptime-kuma:3001';
const USERNAME = process.env.KUMA_USERNAME ?? 'admin';
const PASSWORD = process.env.KUMA_PASSWORD ?? 'aether-dev-kuma-1';
/** Where the services run: on the host, outside compose. */
const HOST = process.env.SERVICES_HOST ?? 'host.docker.internal';

/** Aether-os's services and their default ports (`../../CLAUDE.md`). */
const SERVICES = [
  ['Iris', Number(process.env.IRIS_PORT ?? 3010)],
  ['Polis', 3001],
  ['Hephaestus', 3002],
  ['Pistis', 3003],
  ['Proxenos', 3004],
  ['Kairos', 3005],
  ['Kerykes', 3006],
  ['Loculus', 3007],
  ['Agora', 3008],
  ['Seshat', 3009],
  ['Pylon', 3011],
  ['Ergon', 3013],
  ['Episteme', 3014],
  ['Atlas', Number(process.env.ATLAS_PORT ?? 3012)],
];

const SERVICES_GROUP = 'Aether-os services';
const INFRA_GROUP = 'Infrastructure';
const MARK = 'Provisioned by infra/uptime-kuma/provision.cjs';

/** The fields Uptime Kuma's own form sends for a new monitor. */
const DEFAULTS = {
  type: 'http',
  parent: null,
  description: MARK,
  method: 'GET',
  interval: 60,
  retryInterval: 30,
  resendInterval: 0,
  maxretries: 1,
  timeout: 10,
  notificationIDList: {},
  ignoreTls: false,
  upsideDown: false,
  expiryNotification: false,
  maxredirects: 10,
  accepted_statuscodes: ['200-299'],
  saveResponse: false,
  saveErrorResponse: true,
  responseMaxLength: 1024,
  dns_resolve_type: 'A',
  dns_resolve_server: '1.1.1.1',
  proxyId: null,
  httpBodyEncoding: 'json',
  kafkaProducerBrokers: [],
  kafkaProducerSaslOptions: { mechanism: 'None' },
  rabbitmqNodes: [],
  rabbitmqUsername: '',
  rabbitmqPassword: '',
  conditions: [],
  accepted_statuscodes_json: undefined,
};

/**
 * A service's `/health`: up only when it's `ok`. A `degraded` or `down`
 * one (also its `503`) is down here, the message naming the failed checks,
 * e.g. "degraded: pistis".
 */
const serviceMonitor = (name, port, parent) => ({
  ...DEFAULTS,
  type: 'json-query',
  name,
  parent,
  url: `http://${HOST}:${port}/health`,
  accepted_statuscodes: ['200-299', '503'],
  jsonPath:
    'status = "ok" ? "ok" : status & ": " & $join($keys($sift(checks, function($v) { $v.status = "down" })), ", ")',
  jsonPathOperator: '==',
  expectedValue: 'ok',
});

const httpMonitor = (name, url, parent, extra = {}) => ({
  ...DEFAULTS,
  name,
  parent,
  url,
  ...extra,
});

const INFRASTRUCTURE = (parent) => [
  {
    ...DEFAULTS,
    type: 'postgres',
    name: 'Postgres',
    parent,
    databaseConnectionString: 'postgres://aether:aether@postgres:5432/aether',
    databaseQuery: 'SELECT 1',
  },
  {
    ...DEFAULTS,
    type: 'rabbitmq',
    name: 'RabbitMQ',
    parent,
    rabbitmqNodes: ['http://rabbitmq:15672'],
    rabbitmqUsername: 'aether',
    rabbitmqPassword: 'aether',
  },
  // 200 when unsealed and active (dev mode always is).
  httpMonitor('OpenBao', 'http://openbao:8200/v1/sys/health', parent),
  httpMonitor('OPA', 'http://opa:8181/health', parent),
  httpMonitor('RustFS', 'http://rustfs:9000/health', parent),
  httpMonitor('Mailpit', 'http://mailpit:8025/livez', parent),
  httpMonitor('OTel Collector', 'http://otel-collector:13133/', parent),
  httpMonitor('Jaeger', 'http://jaeger:16686/', parent),
  httpMonitor('Loki', 'http://loki:3100/ready', parent),
  httpMonitor('Grafana', 'http://grafana:3000/api/health', parent),
  httpMonitor('Langfuse', 'http://langfuse-web:3000/api/public/health', parent),
];

function emit(socket, event, ...args) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${event}: no answer in 15 s`)),
      15_000,
    );
    socket.emit(event, ...args, (answer) => {
      clearTimeout(timer);
      resolve(answer);
    });
  });
}

async function connect() {
  // Uptime Kuma may still be starting (migrations on first run).
  for (let attempt = 1; ; attempt++) {
    const socket = io(KUMA_URL, { reconnection: false, timeout: 5000 });
    try {
      await new Promise((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
      });
      return socket;
    } catch (error) {
      socket.close();
      if (attempt === 60) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

async function main() {
  const socket = await connect();
  const monitorList = new Promise((resolve) =>
    socket.once('monitorList', resolve),
  );

  if (await emit(socket, 'needSetup')) {
    const answer = await emit(socket, 'setup', USERNAME, PASSWORD);
    if (!answer.ok) throw new Error(`Setting up the admin failed: ${answer.msg}`);
    console.log(`Created the admin account (${USERNAME})`);
  }
  const login = await emit(socket, 'login', {
    username: USERNAME,
    password: PASSWORD,
    token: '',
  });
  if (!login.ok) {
    throw new Error(
      `Signing in as ${USERNAME} failed (${login.msg}): set KUMA_USERNAME and KUMA_PASSWORD to the account you made`,
    );
  }

  const existing = new Map(
    Object.values(await monitorList).map((monitor) => [monitor.name, monitor]),
  );
  let added = 0;
  const ensure = async (monitor) => {
    const found = existing.get(monitor.name);
    if (found) return found.id;
    const answer = await emit(socket, 'add', monitor);
    if (!answer.ok) {
      throw new Error(`Adding the monitor ${monitor.name} failed: ${answer.msg}`);
    }
    added++;
    existing.set(monitor.name, { id: answer.monitorID, name: monitor.name });
    return answer.monitorID;
  };
  const group = (name) =>
    ensure({ ...DEFAULTS, type: 'group', name, url: undefined });

  const services = await group(SERVICES_GROUP);
  for (const [name, port] of SERVICES) {
    await ensure(serviceMonitor(name, port, services));
  }
  const infrastructure = await group(INFRA_GROUP);
  for (const monitor of INFRASTRUCTURE(infrastructure)) {
    await ensure(monitor);
  }

  console.log(
    `Uptime Kuma is set up: ${added} monitor(s) added, ${existing.size - added} there already. Open http://localhost:${process.env.KUMA_HOST_PORT ?? 3400} (${USERNAME} / ${PASSWORD}).`,
  );
  socket.close();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
