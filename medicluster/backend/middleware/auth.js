/**
 * backend/middleware/auth.js
 * JWT session tokens for clinician accounts.
 */

const jwt = require("jsonwebtoken");

const TOKEN_TTL = "12h";

function secret() {
  const value = process.env.JWT_SECRET;
  // Fail closed: never sign or accept tokens with a missing or trivially short secret.
  if (!value || value.length < 32) {
    const err = new Error("Authentication is not configured (JWT_SECRET must be at least 32 characters)");
    err.status = 503;
    throw err;
  }
  return value;
}

function signToken(user) {
  return jwt.sign({ sub: String(user._id) }, secret(), { expiresIn: TOKEN_TTL });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Sign in required" });

  let key;
  try {
    key = secret();
  } catch (err) {
    return next(err);
  }

  try {
    req.userId = jwt.verify(token, key).sub;
    return next();
  } catch {
    return res.status(401).json({ error: "Session expired. Sign in again." });
  }
}

module.exports = { signToken, requireAuth };
