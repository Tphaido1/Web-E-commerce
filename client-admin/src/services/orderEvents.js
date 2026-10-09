const NEW_ORDER_EVENT = 'admin:new-order';

export function publishNewOrder(order) {
  window.dispatchEvent(new CustomEvent(NEW_ORDER_EVENT, { detail: order }));
}

export function subscribeToNewOrders(callback) {
  const listener = (event) => callback(event.detail);
  window.addEventListener(NEW_ORDER_EVENT, listener);
  return () => window.removeEventListener(NEW_ORDER_EVENT, listener);
}
