const mongoose = require('mongoose');

const runCancellationTransaction = async (work) => {
  const deployment = await mongoose.connection.db.admin().command({ hello: 1 });
  const isReplicaSet = Boolean(deployment.setName);
  const isSharded = deployment.msg === 'isdbgrid';
  const minWireVersion = isSharded ? 8 : 7;
  if ((!isReplicaSet && !isSharded) || deployment.logicalSessionTimeoutMinutes == null || deployment.maxWireVersion < minWireVersion) {
    throw Object.assign(new Error('Hủy đơn an toàn cần MongoDB replica set hoặc sharded cluster hỗ trợ transaction'), { statusCode: 503 });
  }
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(() => work(session), {
      readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' },
    });
  } finally { await session.endSession(); }
};

module.exports = { runCancellationTransaction };
