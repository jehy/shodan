const passportSocketIo = require('passport.socketio');
const cookieParser = require('cookie-parser');
const config = require('config');
const passport = require('passport');
const session = require('express-session');
//const GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;
const KnexSessionStore = require('connect-session-knex')(session);
const GoogleStrategy = require('passport-google-oauth20').Strategy;
// const debug = require('debug')('shodan:auth');
const bunyan = require('bunyan');

const log = bunyan.createLogger({name: 'shodan:auth'});

function auth(app, io, knex) {
  const store = new KnexSessionStore({
    knex,
  });
  app.use(cookieParser());
  app.use(session({
    resave: true,
    saveUninitialized: true,
    secret: config.ui.auth.secret,
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
      clientID: config.ui.auth.google.id,
      clientSecret: config.ui.auth.google.secret,
      callbackURL: `http${config.ui.externalHttps && 's'}://${config.ui.host}:${config.ui.externalPort
      || config.ui.port}/auth/google/callback`,
    },
    ((accessToken, refreshToken, profile, done) => {

      log.info(`User ${profile.displayName} is logging in`);
	console.log(profile);
      // eslint-disable-next-line no-underscore-dangle
      const profileJson = profile._json;
      if (profileJson.hd !== config.ui.auth.google.domain) {
        log.warn(`wrong domain ${profileJson.hd}`);
        done(new Error(`Wrong domain ${profileJson.hd}!`));
      } else {
        done(null, profile);
        log.info('Login ok');
      }
    }),
  ));
/*
  app.get('/auth/google', passport.authenticate('google', {
    hd: config.ui.auth.google.domain,
    prompt: 'select_account',
    scope: [
      //'https://www.googleapis.com/auth/plus.login',
      //'https://www.googleapis.com/auth/plus.profile.emails.read'
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/user.emails.read'
    ],
  })); */
  app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
  app.get('/auth/google/callback', passport.authenticate('google', {failureRedirect: '/login'}), (req, res) => res.redirect('/'));
  app.use((req, res, next) => {
    if (!req.user) {
      log.warn('user not authorized, redirecting');
      res.redirect('/auth/google');
      return;
    }
    next();
  });


  io.use(passportSocketIo.authorize({
    key: 'connect.sid',
    secret: config.ui.auth.secret,
    store,
    passport,
    cookieParser,
  }));
}

module.exports = auth;
