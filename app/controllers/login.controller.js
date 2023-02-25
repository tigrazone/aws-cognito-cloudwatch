const jwt = require('jsonwebtoken');
const cognito = require('../config/cognito.js');

// login
exports.login = async (req, res) => {
  const { body } = req;

  // Validate request format.
  if (body.email && body.password) {
    const { email, password } = body;

    try {
      // Send to cognito the signup request.
      const result = await cognito.logIn(email, password);
      const decodedJwt = jwt.decode(result.idToken, { complete: true });

      res.status(200).json({
        user: decodedJwt.payload,
        access: result.accesToken,
        refresh: result.refreshToken,
      });
    } catch (err) {
      res.status(400).json({ message: err });
    }
  } else {
    res.status(400).json({ message: 'bad format' });
  }
};

// refresh token
exports.refresh = async (req, res) => {
  const { body } = req;

  // Validate request format.
  if (body.email && body.token) {
    const { email, token } = body;

    try {
      // Send to cognito the renew token request.
      const result = await cognito.reNew(token, email);

      const decodedJwt = jwt.decode(result.id_token, { complete: true });

      res.status(200).json({
        user: decodedJwt.payload,
        access: result.access_token,
        refresh: result.refresh_token,
      });
    } catch (err) {
      res.status(400).json({ message: err });
    }
  } else {
    res.status(400).json({ message: 'bad format' });
  }
};

// verify refresh token
exports.verify = async (req, res) => {
  const { body } = req;

  // Validate
  if (body.token) {
    const { token } = body;

    try {
      // Verify token.
      const result = await cognito.verify(token);

      res.status(200).json({ result });
    } catch (err) {
      res.status(400).json({ message: err });
    }
  } else {
    res.status(400).json({ message: 'bad format' });
  }
};

// logout
exports.logout = async (req, res) => {
  try {
    const result = await cognito.signOut(req.username);

    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ message: err });
  }
};
