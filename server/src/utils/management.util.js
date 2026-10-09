const pagination = (query) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
};
const escapeRegex = (value) => String(value || '').trim().slice(0, 200).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const httpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });
module.exports = { pagination, escapeRegex, httpError };
