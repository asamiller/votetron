var express = require('express'),
	exphbs  = require('express3-handlebars'),
	passport = require('passport'),
	GitHubStrategy = require('passport-github').Strategy,
	moment = require('moment');

// keep our functions in a seperate file for cleanlienes
var votes = require('./functions.js');

var app = express();

// Passport session setup.
//   To support persistent login sessions, Passport needs to be able to
//   serialize users into and deserialize users out of the session.  Typically,
//   this will be as simple as storing the user ID when serializing, and finding
//   the user by ID when deserializing.  However, since this example does not
//   have a database of user records, the complete GitHub profile is serialized
//   and deserialized.
passport.serializeUser(function(user, done) {
	done(null, user);
});

passport.deserializeUser(function(obj, done) {
	done(null, obj);
});



// Use the GitHubStrategy within Passport.
//   Strategies in Passport require a `verify` function, which accept
//   credentials (in this case, an accessToken, refreshToken, and GitHub
//   profile), and invoke a callback with a user object.
passport.use(new GitHubStrategy(
	{
		clientID: process.env.GITHUB_CLIENT_ID,
		clientSecret: process.env.GITHUB_CLIENT_SECRET,
		callbackURL: process.env.GITHUB_CALLBACK
	},
	function(accessToken, refreshToken, profile, done) {
		// call our db to create or auth the user
		votes.authUser(profile)
		// then tell express of the new user
		.then(function (user) {
			done(null, user);
		});
	}
));


// Simple route middleware to ensure user is authenticated.
//   Use this route middleware on any resource that needs to be protected.  If
//   the request is authenticated (typically via a persistent login session),
//   the request will proceed.  Otherwise, the user will be redirected to the
//   login page.
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  req.session.error = 'Please sign in!';
  res.redirect('/signin');
}



// configure Express
app.use(express.logger());
app.use(express.cookieParser());
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(express.session({ secret: 'cookie monster' }));
app.use(passport.initialize());
app.use(passport.session());

// Session-persisted message middleware
app.use(function(req, res, next){
	var err = req.session.error,
		msg = req.session.notice,
		success = req.session.success;

	delete req.session.error;
	delete req.session.success;
	delete req.session.notice;

	if (err) res.locals.error = err;
  	if (msg) res.locals.notice = msg;
  	if (success) res.locals.success = success;

	next();
});

app.use(app.router);

var hbs = exphbs.create({
    defaultLayout: 'main',
    // helpers: helpers
});
app.engine('handlebars', hbs.engine);
app.set('view engine', 'handlebars');

hbs.handlebars.registerHelper('dateFormat', function(context, block) {
	if (moment) {
		var f = block || "MMM Do, YYYY";
		return moment(context).format(f);
	}else{
		return context;
	};
});

hbs.handlebars.registerHelper('pluralize', function(number, single, plural) {
	return (number === 1) ? single : plural;
});




// ------------------------------------------------------------
// SINGLE PROJECT
// ------------------------------------------------------------
app.get('/project/:id',  function(req, res){
	votes.getProject(req.params.id)
	.then(function (response) {
		res.render('project', {
			project: response.data,
			key: req.params.id,
			user: req.user
		});
	})
	.fail(function () {
		console.log('get project error', res);
		res.render('error', { user: req.user });
	});
});

app.get('/project/:id/vote', ensureAuthenticated, function(req, res){
	votes.voteForProject(req.params.id, req.user)

	.then(function (response) {
		req.session.success = 'Thanks for the vote!';
		res.redirect('/project/'+req.params.id);
	})
	.fail(function () {
		console.log('get project error', res);
		res.render('error', { user: req.user });
	});
});

app.get('/project/:id/delete', ensureAuthenticated, function(req, res){
	votes.deleteProject(req.params.id, req.user)

	.then(function (response) {
		req.session.success = 'Project deleted';
		res.redirect('/myprojects');
	})
	.fail(function () {
		req.session.error = 'Couldn\'t delete project';
		res.redirect('/project/'+req.params.id);
	});
});




// ------------------------------------------------------------
// ALL PROJECTS
// ------------------------------------------------------------
app.get('/',  function(req, res){
	var query = req.query.s;
	var start = req.query.start || 0;

	votes.getProjects(query, start)
	.then(function (response) {
		res.render('all', {
			projects: response.projects,
			user: req.user
		});
	})
	.fail(function () {
		console.log('get projects error', res);
		res.render('error');
	});
});

app.get('/all',  function(req, res){
	res.redirect('/');
});


// ------------------------------------------------------------
// MY PROJECTS
// ------------------------------------------------------------
app.get('/myprojects', ensureAuthenticated,  function(req, res){
	votes.getMyProjects(req.user)
	.then(function (response) {
		res.render('projects', {
			projects: response.projects,
			user: req.user
		});
	})
	.fail(function () {
		console.log('get projects error', res);
		res.render('error');
	});
});




app.get('/myprojects/create', ensureAuthenticated,  function(req, res){
	res.render('create', {user: req.user});
});

app.post('/myprojects/create', ensureAuthenticated,  function(req, res){
	var project = {
		name: req.body.projectName,
		link: req.body.projectLink,
		image: req.body.projectImage,
		description: req.body.projectDesc
	};

	// create a new project for the user
	votes.createProject(project, req.user)
	.then(function () {
		req.session.success = 'Project Created!';
		res.redirect('/myprojects');
	})
	.fail(function () {
		req.session.error = 'Project failed to be created.';
		res.redirect('/myprojects');
	});
});



app.get('/signin', function(req, res){
	res.render('signin');
});



app.get('/auth/github', passport.authenticate('github'));

app.get('/auth/github/callback', passport.authenticate('github', { failureRedirect: '/' }), function(req, res) {
	// Successful authentication, redirect home.
	res.redirect('/');
});



app.listen(process.env.PORT || 3000);








