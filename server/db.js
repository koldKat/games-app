// Stable repository API; every module shares the same connection.
module.exports = {
  ...require('./db/connection'),
  ...require('./db/normalize'),
  ...require('./db/library'),
  ...require('./db/mutations'),
  ...require('./db/integrations'),
  ...require('./db/enrichment'),
  ...require('./db/summary'),
};
