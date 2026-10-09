let mockMongoose;
let previousVercel;

beforeEach(() => {
  jest.resetModules();
  previousVercel = process.env.VERCEL;
  process.env.VERCEL = '1';
  mockMongoose = {
    connection: { readyState: 0, on: jest.fn() },
    connect: jest.fn(),
  };
  jest.doMock('mongoose', () => mockMongoose);
  jest.doMock('../src/config/env', () => ({ MONGO_URI: 'mongodb://isolated-test-only' }));
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  if (previousVercel === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = previousVercel;
  jest.restoreAllMocks();
});

test('reuses a fully connected database without opening another connection', async () => {
  mockMongoose.connection.readyState = 1;
  const connectDB = require('../src/config/db');
  expect(await connectDB()).toBe(mockMongoose.connection);
  expect(mockMongoose.connect).not.toHaveBeenCalled();
});

test('all concurrent cold-start requests wait for one database connection', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  mockMongoose.connect.mockImplementation(() => {
    mockMongoose.connection.readyState = 2;
    return gate;
  });
  const connectDB = require('../src/config/db');
  let resolved = false;
  const first = connectDB().then(value => { resolved = true; return value; });
  const second = connectDB();
  await Promise.resolve();
  expect(resolved).toBe(false);
  expect(mockMongoose.connect).toHaveBeenCalledTimes(1);
  const connection = { connection: { host: 'isolated-test-host' } };
  release(connection);
  expect(await Promise.all([first, second])).toEqual([connection, connection]);
});

test('disconnecting state is not treated as a usable cached connection', async () => {
  mockMongoose.connection.readyState = 3;
  const connection = { connection: { host: 'isolated-test-host' } };
  mockMongoose.connect.mockResolvedValue(connection);
  const connectDB = require('../src/config/db');
  expect(await connectDB()).toBe(connection);
  expect(mockMongoose.connect).toHaveBeenCalledTimes(1);
});

test('a failed cold start can retry and reconnect without duplicating listeners', async () => {
  const connection = { connection: { host: 'isolated-test-host' } };
  mockMongoose.connect.mockRejectedValueOnce(new Error('connection unavailable'))
    .mockResolvedValue(connection);
  const connectDB = require('../src/config/db');
  await expect(connectDB()).rejects.toThrow('connection unavailable');
  expect(await connectDB()).toBe(connection);
  expect(await connectDB()).toBe(connection);
  expect(mockMongoose.connect).toHaveBeenCalledTimes(3);
  expect(mockMongoose.connection.on).toHaveBeenCalledTimes(2);
});

test('serverless dispatch waits for database readiness', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const app = jest.fn(() => 'handled');
  jest.doMock('../src/app', () => app);
  jest.doMock('../src/config/db', () => jest.fn(() => gate));
  const handler = require('../api/index');
  const req = {};
  const res = {};
  const result = handler(req, res);
  await Promise.resolve();
  expect(app).not.toHaveBeenCalled();
  release();
  expect(await result).toBe('handled');
  expect(app).toHaveBeenCalledWith(req, res);
});

test('serverless database failure returns 503 without dispatch or leaking details', async () => {
  const app = jest.fn();
  jest.doMock('../src/app', () => app);
  jest.doMock('../src/config/db', () => jest.fn().mockRejectedValue(new Error('private-db-credentials')));
  const handler = require('../api/index');
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  await handler({}, res);
  expect(res.status).toHaveBeenCalledWith(503);
  expect(res.json.mock.calls[0][0].status).toBe('error');
  expect(res.json.mock.calls[0][0].message).not.toContain('private-db-credentials');
  expect(app).not.toHaveBeenCalled();
});
