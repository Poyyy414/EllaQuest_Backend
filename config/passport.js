const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const pool = require('./database');
const bcrypt = require('bcrypt');

const studentEmailRegex = /^[^\s@]+@gbox\.ncf\.edu\.ph$/;
const instructorEmailRegex = /^[^\s@]+@ncf\.edu\.ph$/;

passport.use(new GoogleStrategy({
    clientID:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:  process.env.GOOGLE_CALLBACK_URL  // e.g. http://localhost:3000/api/auth/google/callback
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value;

      // ── Domain restriction ──────────────────────────────────────────────
      if (!studentEmailRegex.test(email) && !instructorEmailRegex.test(email)) {
        return done(null, false, {
          message: 'Only @gbox.ncf.edu.ph (students) or @ncf.edu.ph (instructors) emails are allowed.'
        });
      }

      // ── Determine role ──────────────────────────────────────────────────
      const role = studentEmailRegex.test(email) ? 'student' : 'instructor';

      // ── Check if user already exists ────────────────────────────────────
      const existing = await pool.query(
        `SELECT u.user_id, u.first_name, u.last_name, r.role_name
         FROM users u
         JOIN roles r ON u.role_id = r.role_id
         WHERE u.email = $1`,
        [email]
      );

      if (existing.rows.length > 0) {
        return done(null, existing.rows[0]);   // existing user → just log in
      }

      // ── Auto-register new user ──────────────────────────────────────────
      const first_name = profile.name?.givenName  || profile.displayName || 'User';
      const last_name  = profile.name?.familyName || '';

      // Random unguessable password (user will never log in with it)
      const hashedPassword = await bcrypt.hash(require('crypto').randomBytes(32).toString('hex'), 10);

      const roleResult = await pool.query(
        'SELECT role_id FROM roles WHERE role_name = $1', [role]
      );
      if (roleResult.rows.length === 0) return done(new Error('Role not found'));
      const role_id = roleResult.rows[0].role_id;

      const userResult = await pool.query(
        `INSERT INTO users (first_name, last_name, email, password, role_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING user_id, first_name, last_name`,
        [first_name, last_name, email, hashedPassword, role_id]
      );
      const newUser = userResult.rows[0];

      if (role === 'student') {
        await pool.query('INSERT INTO student (user_id) VALUES ($1)', [newUser.user_id]);
      } else {
        await pool.query('INSERT INTO instructor (user_id) VALUES ($1)', [newUser.user_id]);
      }

      return done(null, { ...newUser, role_name: role });

    } catch (err) {
      return done(err);
    }
  }
));

module.exports = passport;