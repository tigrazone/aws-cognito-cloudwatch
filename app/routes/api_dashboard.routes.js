/* eslint-disable max-len */
const router = require('express').Router();

const dashboards = require('../controllers/dashboard.controller.js');
const cognito = require('../config/cognito.js');
const cacheMW = require('../config/cacheMiddleware.js');

module.exports = app => {
  // get all filters
  router.get('/filters', cognito.authMiddleware, cacheMW.cache(3600), dashboards.filters);

  // get table default columns
  router.get('/table-events/columns', cognito.authMiddleware, cacheMW.cache(3600), dashboards.tableColumns);

  // get charts
  router.get('/charts', cognito.authMiddleware, cacheMW.cache(3600), dashboards.charts);

  // get events
  router.get('/table-events', cognito.authMiddleware, cacheMW.cache(3600), dashboards.events);

  // get ONE event
  router.get('/table-events/details', cognito.authMiddleware, cacheMW.cache(3600), dashboards.eventGetOne);

  app.use('/api/dashboard', router);
};
