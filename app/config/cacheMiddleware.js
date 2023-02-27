const NodeCache = require('node-cache');

const myCache = new NodeCache({ stdTTL: 3600, checkperiod: 3600 });

// eslint-disable-next-line no-unused-vars
module.exports.cache = duration => (req, res, next) => {
  const cacheKey = `_cache_${req.username || ''} | ${req.originalUrl || req.url}`;

  const value = myCache.get(cacheKey);
  if (value === undefined) {
    res.sendResponse = res.send;
    res.send = body => {
      myCache.set(cacheKey, body);
      const ct = res.getHeader('Content-Type') || '';
      res.sendResponse(body);
      if (ct !== '') {
        myCache.set(`${cacheKey}#Content-Type`, ct);
      }
    };
    next();
  } else {
    console.log('*** taken from CACHE ***');
    const ct = myCache.get(`${cacheKey}#Content-Type`);
    if (ct !== undefined) {
      res.setHeader('Content-Type', ct);
    }
    res.send(value);
  }
};
