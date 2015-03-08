var request = require("request");
var ini = require("ini");
var fs = require("fs");
var MongoClient = require('mongodb').MongoClient;
var moment = require("moment");

var config = ini.parse(fs.readFileSync('./scraper.ini', 'utf-8'))
var CLIENT_ID = config["CLIENT_ID"];
var CLIENT_SECRET = config["CLIENT_SECRET"];
var uristring = config["MONGO_LAB_URL"];
var BASE_URL = "https://gateway.api.pcftest.com:9004"; // HTTPS url
var BASE_URL_GET_TOKEN = BASE_URL + "/v1/oauth2/token?grant_type=client_credentials";
var BASE_URL_LOGIN = BASE_URL + "/v1/oauth2/authorize/login";
var BASE_URL_LOGOUT = BASE_URL + "/v1/oauth2/authorize/logout";
var BASE_FHIR_INFO_URL = BASE_URL + "/v1/fhir_rest";
var BASE_URL_PATIENT = BASE_FHIR_INFO_URL + "/Patient/";
var BASE_URL_ORGANIZATION = BASE_FHIR_INFO_URL + "/Organization/";
var BASE_URL_OBSERVATION = BASE_FHIR_INFO_URL + "/Observation";
var accessToken;
var patient_id;
var organization_id;
var counter = 0;
var totalCount;
var mongodb;
var nextURL;
MongoClient.connect(uristring, function(err, db) {
	if(err) {
		console.error("connect to mongodb failed",err);
	} else {
		console.log("connected to mongo!")
		mongodb = db;	
	}
	
});

var token = function(username, password) { 
	var authenticateString = 'Basic ' + (new Buffer(CLIENT_ID + ':' + CLIENT_SECRET)).toString('base64');
	request.post({
		url: BASE_URL_GET_TOKEN,
		headers: {'Authorization':authenticateString}
	},function(error, response, body) {
	    if (error) {
	      return console.error('post failed:', error);
	    } else {
	    	var data = JSON.parse(body);
	    	accessToken = data.access_token;
			login(username,password);
	    }
	    //console.log('post successful!  Server responded with:', body+" accessToken:"+accessToken);
	});	
};

var login = function(userName,password) { 
	request.post({
		url: BASE_URL_LOGIN,
		body: { "username":userName, "password":password },
		headers: {'Authorization':'Bearer ' + accessToken},
		json: true
	},function(error, response, body) {
		if(error) {
			return console.error('login failed:',error);
		} else {
			//patient_id = body.user.id;
			//organization_id = body.user.org;
			//console.log("login successful! Server response:"+JSON.stringify(response)+" body:"+JSON.stringify(body));
			patient_id = body.user.id;
			organization_id = body.user.org;
			
			//get patient information
			patient();

			//get all observations
		}

	});
};

var patient = function() { 
	request.get({
		url: BASE_URL_PATIENT + patient_id,
		headers: {'Authorization':'Bearer ' + accessToken,'Accept':'application/json'},
		json: true
	},function(error, response, body) {
		if(error) {
			return console.error('patient info failed:',error);
		} else {
			//console.log("patient info successful! Server response:"+JSON.stringify(response));
			//get patient information
			observations();
		}
	});

};

var insertDocuments = function(db, objects, callback) {
  // Get the documents collection 
  var collection = db.collection('filtered_observations');
  // Insert some documents 
  var observations = [];
  for(var x in objects) {

  	var ts = moment((objects[x].content.appliesDateTime)?objects[x].content.appliesDateTime:objects[x].content.appliesPeriod.start).add(6,"months").toDate();


  	observations.push({
  		timestamp: ts,
  		period: objects[x].content.appliesPeriod,
  		unit: objects[x].content.name.coding[0].display,
  		value: objects[x].content.valueQuantity.value,
  		patient_id: objects[x].content.subject.reference,
  		text: objects[x].content.text.div
  	});
  }

  collection.insert(observations, function(err, result) {
  	if(err) {
  		console.error('insert observations failed:',error);
  	} else {
  		console.log("Insert successful!");
  	}
    callback();
  });
};


var observations = function() {
	request.get({
		url: BASE_URL_OBSERVATION + "?name="+encodeURIComponent("https://rtmms.nist.gov|8454247,https://rtmms.nist.gov|8455148,https://rtmms.nist.gov|67108865") + '&subject:_id=' + patient_id+"&_count=50",
		headers: {'Authorization':'Bearer ' + accessToken,'Accept':'application/json'},
		json: true
	},function(error, response, body) {
		if(error) {
			return console.error('observations info failed:',error);
		} else {
			//console.log("observations info successful! response:"+JSON.stringify(body));
			//get patient information
			totalCount = body.totalResults;
			counter += 10;
			if(counter > totalCount) {
				logout();
			} else {
				nextURL = body.link[1].href;
				insertDocuments(mongodb,body.entry,nextObservations);
			}
		}
	});
};

var nextObservations = function() {
	request.get({
		url: nextURL,
		headers: {'Authorization':'Bearer ' + accessToken,'Accept':'application/json'},
		json: true
	},function(error, response, body) {
		if(error) {
			return console.error('observations info failed:',error);
		} else {
			console.log("observations info successful! Server response:"+JSON.stringify(body));
			//get patient information
			counter += 50;
			if(counter > totalCount) {
				logout();
			} else {
				nextURL = body.link[2].href;
				insertDocuments(mongodb,body.entry,nextObservations);
			}
		}
	});
};




var logout = function() { 
	request.del({
		url: BASE_URL_LOGOUT,
		headers: {'Authorization':'Bearer ' + accessToken}
		},function(error, response, body) {
		if(error) {
			return console.error('logout failed:',error);
		} else {
			console.log("logout successful!");
		}
	});
};

//token("sam.s.smith","MyFood4Health!");
token("charlie.miller","1ce.Upon.a.Time");