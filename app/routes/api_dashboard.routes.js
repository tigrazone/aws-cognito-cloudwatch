const router = require('express').Router();

const dashboards = require('../controllers/dashboard.controller.js');
const cognito = require('../config/cognito.js');

module.exports = app => {
  // get all filters
  router.get('/filters', cognito.authMiddleware, dashboards.filters);

  // get table default columns
  router.get('/table-events/columns', cognito.authMiddleware, dashboards.tableColumns);

  // get charts
  router.get('/charts', cognito.authMiddleware, dashboards.charts);

  // get events
  router.get('/table-events', cognito.authMiddleware, dashboards.events);

  // get ONE event
  router.get('/table-events/details', cognito.authMiddleware, dashboards.eventGetOne);

  app.use('/api/dashboard', router);
};
