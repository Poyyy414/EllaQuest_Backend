const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

passport.use(new GoogleStrategy({
    clientID:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:  process.env.GOOGLE_CALLBACK_URL,
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email      = profile.emails?.[0]?.value;
      const first_name = profile.name?.givenName  || '';
      const last_name  = profile.name?.familyName || '';

      const studentEmailRegex    = /^[^\s@]+@gbox\.ncf\.edu\.ph$/;
      const instructorEmailRegex = /^[^\s@]+@ncf\.edu\.ph$/;

      if (!studentEmailRegex.test(email) && !instructorEmailRegex.test(email)) {
        return done(null, false, {
          message: 'Only @gbox.ncf.edu.ph or @ncf.edu.ph emails are allowed.'
        });
      }

      // Just pass profile — no DB here
      return done(null, { email, first_name, last_name });

    } catch (err) {
      return done(err);
    }
  }
));

module.exports = passport;