var db = require('orchestrate')(process.env.ORCHESTRATE_API_KEY),
	Q = require('q');
	crypto = require('crypto');


// create a random key for objects
function randomKey () {
	return crypto.randomBytes(10).toString('hex');
}

// AUTHENTICATE USER
// check to see if the user is in our DB and if not, create a record for them
exports.authUser = function (profile) {
	var deferred = Q.defer();

	// use the provider and the user (incase we support other providers down the road)
	var key = profile.provider + '-' + profile.username;

	// the user data we want to store. this is mostly to clean up any extra data we don't need
	var user = {
		provider: 	 profile.provider,
		id: 		 profile.id,
		displayName: profile.displayName,
		username:    profile.username,
		profileUrl:  profile.profileUrl,
		emails:      profile.emails,
		avatar:      profile._json.avatar_url,
		githubData:  profile._json
	};

	// put the user into our DB if it's not currently there
	// this uses Orchestrate's condition PUT functionality
	db.put('users', key, user, false)
	.then(function () {
		// add the key to the session data
		user.key = key;
		deferred.resolve(user);
	})
	.fail(function () {
		deferred.reject();
	});

	return deferred.promise;
}




// CREATE PROJECT
// create a new project for a user
exports.createProject = function (project, user) {
	var deferred = Q.defer();

	// create a new key for the user
	var key = randomKey();

	// add the votes as 0 into the data
	project.votes = 0;

	// add the user name to the data
	project.user = user.username;

	// save the date we created it
	project.dateCreated = new Date().toISOString();
	project.dateUpdated = new Date().toISOString();

	// save the project into the DB
	// this uses Orchestrate's condition PUT functionality
	db.put('projects', key, project, false)
	.then(function () {
		console.log('create link');
		console.log('users', user.key);
		console.log('projects', key);

		// create a graph connection from the user to the project
		return db.newGraphBuilder()
		.create()
		.from('users', user.key)
		.related('member')
		.to('projects', key);

	})
	.then(function () {
		console.log('project and link created');
		deferred.resolve(project);
	})
	.fail(function () {
		console.log('new project failed');
		deferred.reject();
	});

	return deferred.promise;
}


// GET SINGLE PROJECT
exports.getProject = function (key) {
	return getProject(key);
}

// DELETE PROJECT
exports.deleteProject = function (key, user) {
	// check that we own it
	return getProject(key)
	.then(function (response) {
		if (response.data.user !== user.username) {
			throw new Error('user not owner');
		}
	})
	.then(function (response) {
		return db.remove('projects', key);
	});
}



// GET MY PROJECTS
// gets all projects for a user
exports.getMyProjects = function (user) {
	return db.newGraphReader()
	.get()
	.from('users', user.key)
	.related('member')
	.then(function (response) {
		var projects = response.body.results || [];

		// sort the results
		return {
			count: response.body.count,
			projects: projects.sort(sortProjectsByDate)
		};
	});
}

function sortProjectsByDate (a, b){
	var keyA = new Date(a.dateUpdated),
		keyB = new Date(b.dateUpdated);
	
	// Compare the 2 dates
	if(keyA < keyB) return -1;
	if(keyA > keyB) return 1;
	return 0;
}



// GET ALL PROJECTS
// gets all projects
exports.getProjects = function (query, start) {
	var deferred = Q.defer();

	// get a number out of the start var
	var start = parseInt(start || 0, 10);

	db.newSearchBuilder()
	.collection('projects')
	.offset(start)
	.limit(20)
	.query(query || '*')

	.then(function (response) {
		console.log(response.body);
		var projects = response.body.results || [];

		// if we have a search then sort by that
		if (query) {
			return {
				count: response.body.count,
				projects: projects
			};
		}

		// sort the results
		return {
			count: response.body.count,
			projects: projects.sort(sortProjectsByDate)
		};
	})

	.then(function (response) {
		deferred.resolve(response);
	})
	.fail(function (response) {
		console.log('search failed', response);
		deferred.reject(response);
	});

	return deferred.promise;
}









function getProject (key) {
	var deferred = Q.defer();

	db.get('projects', key)
	.then(function (response) {
		// get the ref out of the header
		var ref = response.headers.etag;

		deferred.resolve({
			ref: ref,
			data: response.body
		});
	})
	.fail(function (response) {
		console.log('get failed', response);
		deferred.reject(response);
	});

	return deferred.promise;
}



// UPDATE VOTE COUNT FOR PROJECT
// this gets a project, adds 1 to the vote count, and re-saves it
function addToProjectVoteCount (key, user) {
	return getProject(key)
	.then(function (response) {
		console.log(response);
		var votes = response.data.votes || 0;

		response.data.votes = votes + 1;

		return db.put('projects', key, response.data, response.ref);
	});
}



// VOTE
// looks at a user and project and checks if they've voted already
// then it counts the votes and adds them to a project
exports.voteForProject = function (key, user) {
	
	// get all the events for this project
	return db.newEventReader()
	.from('projects', key)
	.type('vote')

	// then look to see if the user has a vote in there already
	.then(function (response) {
		var data = response.body;
		console.log('get event data', data.results);

		// cancel out if there are no events
		if (!data) return false;

		// loop over the events and search for the user's key
		var userCanVote = data.results.every(function (item) {
			return (item.value.user !== user.key);
		});

		// if the user already voted then throw an error to reject the promise
		if (!userCanVote) throw 'User already voted';
		
		// otherwise continue on
		return true;
	})

	// add a new vote event for the user and add 1 to the project's vote count
	.then(function () {
		// create a new vote event
		return db.newEventBuilder()
		.from('projects', key)
		.type('vote')
		.data({
			user: user.key
		});
	})

	// add 1 to the vote count
	.then(function () {
		return addToProjectVoteCount(key);
	})

	.fail(function () {
		console.log('vote failed');
	});
	
}








