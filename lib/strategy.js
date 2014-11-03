/* vim: set ts=2 sw=2 expandtab : */

var passport  = require('passport-strategy');
var util      = require('util');
var EdmodoAPI = require('edmodo').EdmodoAPI;


function Strategy(options, verify){
  passport.Strategy.call(this);

  if(!verify){
    throw new TypeError('Verify callback is required.');
  } 
  
  this.name = 'edmodo-api';
  this.api  = new EdmodoAPI({
     api_key: options.api_key,
    api_host: options.api_host,
      logger: options.logger
  });
  this._verify = verify;
  this._passReqToCallback = options.passReqToCallback;
}
util.inherits(Strategy, passport.Strategy);


Strategy.prototype.authenticate = function(req){
  var self = this;

  if(!(req && req.body)){
    return self.error(new Error("Not a valid request."));
  }

  // we expect to be installed as middleware on the launch endpoint, which
  // means we should have these values available:
  var launch_key      = req.query.launch_key;
  var expiration_time = req.query.expiration_time;
  var language        = req.query.ln;

  if(!(launch_key && expiration_time)){
    return self.error(new Error(
      "Not a valid launch request. Must be installed as middleware on the launch request endpoint."
    ));
  }

  // use the information provided in the launch request to make an Edmodo API
  // request to validate this request, and get the launching user's
  // information:

  this.api.get({
      endpoint: '/launchRequests',
    launch_key: launch_key
  }, function(err, response){
    if(err)
      return self.error(new Error("Failed to verify launch request: " + err.message));
    
    if(!response.user_token)
      return self.error(new Error("Edmodo did not provide a valid user_token."));
    if(!response.access_token)
      return self.error(new Error("Edmodo did not provide a valid access_token."));

    var name_parts = [];
    if(response.first_name) name_parts.push(response.first_name);
    if(response.last_name) name_parts.push(response.last_name);
    var display_name = name_parts.join(' ');
  
    // normalise the Edmodo user information into Contact Schema form:
    var contact = {
         provider: "edmodo",
               id: response.user_token,
      displayName: display_name,
             name: {
               familyName: response.last_name,
                givenName: response.first_name
             },
           emails: [],
           photos: [
               {value: response.avatar_url, type:"avatar"},
               {value: response.thumb_url,  type:"thumb"},
             ],
                   // include the whole response so that extra information can
                   // be retrieved by the verify callback if needed
            _json: response
    };

    function verified(err, user, info){
      if(err){
        return self.error(err);
      }else if(!user){
        return self.fail(info);
      }else{
        return self.success(user, info);
      }
    }
    
    try{
      if(self._passReqToCallback){
        self._verify(req, contact, response.user_token, response.access_token, verified);
      }else{
        self._verify(contact, response.user_token, response.access_token, verified);
      }
    }catch(e){
      return self.error(e);
    }
  });
};


module.exports = Strategy;

