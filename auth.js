const passportSocketIo = require('passport.socketio');
const cookieParser = require('cookie-parser');
const config = require('config');
const passport = require('passport');
const session = require('express-session');
const GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;
const MySQLStore = require('connect-mysql')(session);
const debug = require('debug')('shodan:auth');

function auth(app, io) {

  const store = new MySQLStore({config: config.db.connection});

  app.use(cookieParser());
  app.use(session({
    resave: true,
    saveUninitialized: true,
    secret: config.auth.secret,
    store,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 31,
    },
  }));

  app.use(passport.initialize());
  app.use(passport.session());
  passport.serializeUser((user, done) => {
    done(null, user);
  });

  passport.deserializeUser((user, done) => {
    done(null, user);
  });
  passport.use(new GoogleStrategy(
    {
      clientID: config.auth.google.id,
      clientSecret: config.auth.google.secret,
      callbackURL: `http://${config.host}:${config.port}/auth/google/callback`,
    },
    ((accessToken, refreshToken, profile, done) => {

      debug(`User ${profile.displayName} is logging in`);
      // eslint-disable-next-line no-underscore-dangle
      const profileJson = profile._json;
      if (profileJson.domain !== config.auth.google.domain) {
        debug(`wrong domain ${profileJson.domain}`);
        done(new Error(`Wrong domain ${profileJson.domain}!`));
      } else {
        done(null, profile);
        debug('Login ok');
      }
    }),
  ));

  app.get('/auth/google', passport.authenticate('google', {
    hd: config.auth.google.domain,
    prompt: 'select_account',
    scope: [
      'https://www.googleapis.com/auth/plus.login',
      'https://www.googleapis.com/auth/plus.profile.emails.read'],
  }));

  app.get('/auth/google/callback', passport.authenticate('google', {failureRedirect: '/login'}), (req, res) => res.redirect('/'));
  app.use((req, res, next) => {
    if (!req.user) {
      debug('user not authorized, redirecting');
      res.redirect('/auth/google');
      return;
    }
    next();
  });


  io.use(passportSocketIo.authorize({
    key: 'connect.sid',
    secret: config.auth.secret,
    store,
    passport,
    cookieParser,
  }));
}

module.exports = auth;
