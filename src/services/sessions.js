const sessions = new Map();

function getSession(userId) {
  const now = Date.now();
  const TTL = 60 * 60 * 1000; // 1 hora

  const s = sessions.get(userId);
  if (!s || now - s.updatedAt > TTL) {
    const fresh = { messages: [], lastProduct: null, updatedAt: now };
    sessions.set(userId, fresh);
    return fresh;
  }

  s.updatedAt = now;
  return s;
}

module.exports = { getSession };
