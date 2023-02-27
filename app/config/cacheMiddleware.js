const NodeCache = require('node-cache');

const myCache = new NodeCache();

module.exports.cache = duration => (req, res, next) => {
  const cacheKey = `_cache_${req.username || ''} | ${req.originalUrl || req.url}`;

  // header Cache-Control: no-cache   clean up cached data
  const cacheControl = req.headers['cache-control'] || '';
  if (cacheControl === 'no-cache') {
    console.log('*** cache Middleware. flush cache ***');
    myCache.flushAll();
  }

  console.log('*** Cache stats ***', myCache.getStats());

  const value = myCache.get(cacheKey);
  if (value === undefined) {
    res.sendResponse = res.send;
    res.send = body => {
      myCache.set(cacheKey, body, duration);
      const ct = res.getHeader('Content-Type') || '';
      res.sendResponse(body);
      if (ct !== '') {
        myCache.set(`${cacheKey}#Content-Type`, ct, duration);
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
