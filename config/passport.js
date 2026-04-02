const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const pool = require('./database');
const jwt = require('jsonwebtoken');

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
},
async (accessToken, refreshToken, profile, done) => {
    try {
        const email = profile.emails[0].value;
        const first_name = profile.name.givenName;
        const last_name = profile.name.familyName;

        // Validate email domain
        const studentEmailRegex = /^[^\s@]+@gbox\.ncf\.edu\.ph$/;
        const instructorEmailRegex = /^[^\s@]+@ncf\.edu\.ph$/;

        let role = null;
        if (studentEmailRegex.test(email)) role = 'student';
        else if (instructorEmailRegex.test(email)) role = 'instructor';
        else {
            return done(null, false, { message: 'Only NCF emails are allowed' });
        }

        // Check if user already exists
        const existingUser = await pool.query(
            `SELECT u.user_id, u.first_name, u.last_name, r.role_name
             FROM users u
             JOIN roles r ON u.role_id = r.role_id
             WHERE u.email = $1`,
            [email]
        );

        let user;

        if (existingUser.rows.length > 0) {
            // User exists — just login
            user = existingUser.rows[0];
        } else {
            // New user — auto register
            const roleResult = await pool.query(
                'SELECT role_id FROM roles WHERE role_name = $1', [role]
            );
            const role_id = roleResult.rows[0].role_id;

            const newUser = await pool.query(
                `INSERT INTO users (first_name, last_name, email, role_id)
                 VALUES ($1, $2, $3, $4)
                 RETURNING user_id, first_name, last_name`,
                [first_name, last_name, email, role_id]
            );
            const user_id = newUser.rows[0].user_id;

            // Insert into role table
            if (role === 'student') {
                await pool.query(
                    'INSERT INTO student (user_id) VALUES ($1)', [user_id]
                );
            } else if (role === 'instructor') {
                await pool.query(
                    'INSERT INTO instructor (user_id) VALUES ($1)', [user_id]
                );
            }

            user = { ...newUser.rows[0], role_name: role };
        }

        return done(null, user);

    } catch (error) {
        return done(error, null);
    }
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

module.exports = passport;