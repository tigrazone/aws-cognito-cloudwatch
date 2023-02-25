/* eslint-disable no-plusplus */
/* eslint-disable camelcase */
/* eslint-disable no-shadow */
/* eslint-disable prefer-promise-reject-errors */

require('dotenv').config();

// Load aws module.
const AmazonCognitoId = require('amazon-cognito-identity-js');

// eslint-disable-next-line no-unused-vars
const AWS = require('aws-sdk');
const request = require('request');
const jwkToPem = require('jwk-to-pem');
const jwt = require('jsonwebtoken');

const CognitoExpress = require('cognito-express');

// Setup CognitoExpress
const cognitoExpress = new CognitoExpress({
  region: process.env.AWS_COGNITO_REGION,
  cognitoUserPoolId: process.env.AWS_COGNITO_USER_POOL_ID,
  tokenUse: 'access',
  tokenExpiration: 3600,
});

// Set fetch, because aws cognito lib was created for browsers.
global.fetch = require('node-fetch');

// Set user pool credentials.
const poolData = {
  UserPoolId: process.env.AWS_COGNITO_USER_POOL_ID,
  ClientId: process.env.AWS_COGNITO_CLIENT_ID,
};

const awsCognitoRegion = process.env.AWS_COGNITO_REGION;

// Get user pool.
const userPool = new AmazonCognitoId.CognitoUserPool(poolData);

// Auth in cognito
const login = (name, password) => new Promise((resolve, reject) => {
  try {
    const authenticationDetails = new AmazonCognitoId.AuthenticationDetails({
      Username: name,
      Password: password,
    });

    const userData = {
      Username: name,
      Pool: userPool,
    };

    const cognitoUser = new AmazonCognitoId.CognitoUser(userData);

    cognitoUser.authenticateUser(authenticationDetails, {
      onSuccess: result => {
        resolve({
          accesToken: result.getAccessToken().getJwtToken(),
          idToken: result.getIdToken().getJwtToken(),
          refreshToken: result.getRefreshToken().getToken(),
        });
      },
      onFailure: err => {
        reject(err);
      },
    });
  } catch (err) {
    reject(err);
  }
});

// Download jwsk.
// eslint-disable-next-line no-unused-vars
const downloadJwk = token => {
  const urlJwk = `https://cognito-idp.${awsCognitoRegion}.amazonaws.com/${poolData.UserPoolId}/.well-known/jwks.json`;

  return new Promise((resolve, reject) => {
    request({ url: urlJwk, json: true }, (error, response, body) => {
      if (!error && response.statusCode === 200) {
        resolve(body);
      } else {
        reject(error);
      }
    });
  });
};

// Verify token.
const verify = token => new Promise((resolve, reject) => {
  // Download jwkt from aws.
  downloadJwk(token).then(body => {
    const pems = {};
    const { keys } = body;

    for (let i = 0; i < keys.length; i++) {
      // Convert each key to PEM
      const key_id = keys[i].kid;
      const modulus = keys[i].n;
      const exponent = keys[i].e;
      const key_type = keys[i].kty;
      const jwk = { kty: key_type, n: modulus, e: exponent };
      const pem = jwkToPem(jwk);

      pems[key_id] = pem;
    }

    // validate the token
    const decodedJwt = jwt.decode(token, { complete: true });

    // If is not valid.
    if (!decodedJwt) reject({ error: 'Not a valid JWT token' });

    const { kid } = decodedJwt.header;
    const pem = pems[kid];

    if (!pem) reject({ error: 'Invalid token' });

    jwt.verify(token, pem, (err, payload) => {
      if (err) reject({ error: 'Invalid token' });
      else resolve(payload);
    });
  }).catch(err => {
    reject(err);
  });
});

// Renew token.
const renew = (token, name) => new Promise((resolve, reject) => {
  const RefreshToken = new AmazonCognitoId.CognitoRefreshToken({ RefreshToken: token });
  const userPool = new AmazonCognitoId.CognitoUserPool(poolData);

  const userData = {
    Username: name,
    Pool: userPool,
  };

  const cognitoUser = new AmazonCognitoId.CognitoUser(userData);

  cognitoUser.refreshSession(RefreshToken, (err, session) => {
    if (err) { reject(err); } else {
      const retObj = {
        access_token: session.accessToken.jwtToken,
        id_token: session.idToken.jwtToken,
        refresh_token: session.refreshToken.token,
      };

      resolve(retObj);
    }
  });
});

// signOut
const signOut = name => new Promise((resolve, reject) => {
  const userPool = new AmazonCognitoId.CognitoUserPool(poolData);

  const userData = {
    Username: name,
    Pool: userPool,
  };

  const cognitoUser = new AmazonCognitoId.CognitoUser(userData);
  if (cognitoUser != null) {
    cognitoUser.signOut();
    resolve({ message: 'OK' });
  } else {
    reject({ error: 'Invalid username' });
  }
});

module.exports.logIn = login;
module.exports.verify = verify;
module.exports.reNew = renew;
module.exports.signOut = signOut;

const { QueryTypes } = require('sequelize');
const db = require('../models');

module.exports.authMiddleware = function authMiddleware(req, res, next) {
  // Check that the request contains a token
  if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer') {
    // Validate the token
    const token = req.headers.authorization.split(' ')[1];
    cognitoExpress.validate(token, async err => {
      if (err) {
        // If there was an error, return a 401 Unauthorized along with the error
        res.status(401).json({ message: err.message });
      } else {
        // Else API has been authenticated. Proceed.
        const decodedJwt = jwt.decode(token, { complete: true });
        if (!decodedJwt) {
          res.status(401).json({ message: 'Invalid token' });
        } else {
          req.username = decodedJwt.payload.username || '';
          req.usersite = '';
          if (req.username !== '') {
            const query = `SELECT site FROM report.username_site WHERE username = '${req.username}'`;
            let result = [];
            try {
              result = await db.sequelize.query(query, { type: QueryTypes.SELECT });
            } catch (err) {
              res.status(500).send({
                message: err.message || 'Some SQL error occurred',
              });
              return;
            }
            if (result.length === 1) {
              req.usersite = result[0].site;
            } else {
              res.status(401).json({ message: 'Invalid token. No user site data in DB' });
            }
          }
        }
        next();
      }
    });
  } else {
    // If there is no token, respond appropriately
    res.status(401).json({ message: 'No token provided' });
  }
};
