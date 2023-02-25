const router = require('express').Router();

const logins = require('../controllers/login.controller.js');
const cognito = require('../config/cognito.js');

module.exports = app => {
  // login
  router.post('/token', logins.login);

  // refresh token
  router.post('/token/refresh', logins.refresh);

  // verify refresh token
  router.post('/token/verify', logins.verify);

  // logout
  router.get('/logout', cognito.authMiddleware, logins.logout);

  app.use('/api/auth', router);
};
