const store = new Map(); // userId -> [{role, content, ts}]

function getHistory(userId, limit = 8) {
  const arr = store.get(userId) || [];
  return arr.slice(-limit).map(({ role, content }) => ({ role, content }));
}

function append(userId, role, content) {
  if (!userId) return;
  const arr = store.get(userId) || [];
  arr.push({ role, content, ts: Date.now() });
  // podés recortar para no crecer infinito
  store.set(userId, arr.slice(-30));
}

module.exports = { getHistory, append };
