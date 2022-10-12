/**
* Simple runtime access to Apache-style htpasswd file
(username:passwd_md5) for (webapp) authentication purposes.
* Initially support only passwd htpasswd MD5 hashes starting with '$apr1$'
* 
* Examples of passwd ops:
* ```
* # Create completely new .htpasswd + 1 entry
* echo "secret" | htpasswd -c -i .htpasswd jsmith1
* # Add new entry
* echo "secret" | htpasswd  -i .htpasswd jsmith2
* # Verify
* echo "secret"| htpasswd  -v -i .htpasswd jsmith2
* ```
* Heavily inspired by:
https://github.com/gevorg/htpasswd/blob/master/src/utils.js (NPM: "apache-md5")

* References
* - https://www.taniarascia.com/basic-authentication-for-an-express-node-app-htpasswd/
*   - Only basic-authenticats request, no htpasswd support (Form auth needed)
* - https://www.npmjs.com/package/htpasswd - Only manages file (BUT *can* verify)
*   - Useful examples for using apache-md5 - Apache specific way of
dealing w. stored passwd hashes, hashing, salting, etc.
*/

var fs  = require("fs");
var md5 = require("apache-md5"); // npm install apache-md5@1.1.8
var hlr = require("./hostloader.js"); // For csv_parse
var passfn = null; // "/tmp/.htpasswd";
var htpass = [];

function init(_cfg) {
  // if (!_cfg.passfn) { console.log("No htpasswd file name (passfn)"); return null; }
  if ( !fs.existsSync(passfn) ) { return null; }
  // For now load persistently (in-mem) in init
  // Later: open file to search user on per auth-request basis.
  var opts = {sep: ':', hdr: ["uname","hash"], max: 2};
  htpass = hlr.csv_parse(passfn, opts);
  // Revert to empty array to enable successful filter()
  if (!htpass) { htpass = []; }
  console.log("Got passwd db: ", htpass);
  return module.exports;
}

// Testbed
if (process.argv[1].match("htpasswd.js")) {
  init({passfn: "/tmp/.htpasswd"});
  var ok = authenticate("jsmith", "secret");
  console.log("Auth result 1: "+ ok);
  var ok = authenticate("jsmith", "wrong");
  console.log("Auth result 2: "+ ok);
}

/** Authenticate user by username and passwd.
 * - Lookup/mactch user entry (':'-separated) from htpasswd file
 * @return 1 for success, 0 for failure
 */
function authenticate(u,p) {
  var e = htpass.filter( (e) => { return e.uname == u; } )[0];
  if (!e) { console.log("User not found"); return 0; }
  console.log("Got user: ", e);
  if ( md5(p, e.hash) == e.hash ) { return 1; }
  return 0;
}

module.exports = {
  //authenticate: authenticate
};
