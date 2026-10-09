// Remember bounded event history per authenticated login, including token refreshes.
export function createNotificationHistory(limit = 250) {
  let sessionId = null;
  const ids = new Set();
  const queue = [];
  return {
    setSession(nextSessionId) {
      if (sessionId === nextSessionId) return false;
      sessionId = nextSessionId;
      ids.clear();
      queue.length = 0;
      return true;
    },
    accept(order) {
      const id = String(order?.orderId || order?.orderCode || '');
      if (!id || ids.has(id)) return false;
      ids.add(id);
      queue.push(id);
      if (queue.length > limit) ids.delete(queue.shift());
      return true;
    },
  };
}
