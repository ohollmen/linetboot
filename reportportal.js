#!/usr/local/bin/node
// Linetboot add-on script to add users to Reportportal projects.
var axios = require("axios");
var async = require("async");
var fs    = require("fs");
var mcfg = require(process.env["HOME"]+"/.linetboot/global.conf.json");
if (!mcfg) { console.log("No main config"); process.exit(1); }
var cfg = mcfg.reportportal ? mcfg.reportportal : mcfg;

// Authentication to API uses API token.

var atok =  cfg.atok; // API/Auth Token
var axopt = { headers: {Authorization: "bearer "+cfg.atok}};
var burl = cfg.url; // API URL
var memrole = cfg.memrole; // "MEMBER";
var usernames = [];
var debug = 0;
if (process.argv[1].match("reportportal.js")) {
  if (process.env["RP_DEBUG"]) { debug = 1; }
  createusers((err) => {
    
  });
}
/** Add all logged-in network users to RP groups.
 * Do this because LDAP users cannot be explicitly created (only impl. by logging in)
 * - Load the users and projects from RP (user/all)
 * - Detect which groups need member addition
 * E.g. loadusers_rp((err, users) => { console.log("Loaded users!"); }); proj_load(cb);
 */
function createusers(cb) {
  async.parallel([ loadusers_rp, proj_load ], (err, ress) => {
    if (err) { console.log("Failed either users load or projects load:"+ err); process.exit(1); }
    debug && console.error("Got users ",ress[0],"and projects "+ress[1]+"");
    var users = ress[0];
    var projs = ress[1];
    usernames = users.map((u) => { return u.userId; }); // AoO => AoS
    curl_cmds_gen (null, projs, usernames);
  });
  //async.waterfall([loadusers_rp, ], (err, ress) => { console.log("WF-COMPLETE"); });
}
/** Load RP Users. Narrow userlist down to LDAP users only. */
function loadusers_rp(cb) {
  axios.get(cfg.url+"user/all", axopt).then((resp) => {
    var d = resp.data;
    var users = d.content;
    users = users.filter((u) => { return u.accountType == 'LDAP'; });
    //debug && console.log("LDAP-Users:", users);
    return cb(null, users);
  }).catch((ex) => {
    console.error("Failed loading RP users:"+ex);
    return cb(ex, null);
  });
}

// Create curl addition commands synchronously.
// Uses projects_add_mem to first generate data of mems to add.
function curl_cmds_gen (err, projs, usernames) {
  if (err) { console.log("Error from project details lister !"); process.exit(1); }
  var adds = projects_add_mem(projs, usernames);
  Object.keys(adds).forEach((pn) => {
    var url = cfg.url + "project/"+pn+"/assign";
    var msg = {userNames: adds[pn]}
    var json = JSON.stringify(msg);
    var hdrs = ["Authorization: bearer "+atok, "Content-type: application/json"];
    var hdrpara = hdrs.map((p) => { return "-H '"+p+"'"; }).join(" ");
    // console.log("Project: "+pn+" => ", json);
    console.log("curl -X PUT -d '"+json+"' "+hdrpara+" "+url);
  });
};

/** Load Projects from RP (project/list).
* Get details by projget() (running it in parallel for all earlier results).
*/
function proj_load(cb) {
  axios.get(cfg.url+"project/list", axopt).then((resp) => {
    var d = resp.data;
    // debug && console.log(d);
    var arr = d.content.filter((p) => { return p.entryType == 'INTERNAL'; });
    // console.log(arr); // process.exit(1);
    debug && console.error("Fetch details on "+arr.length+" projects");
    async.map(arr, projget, function (err, ress) {
      if (err) { console.error("Proj. details Error: "+err);  return cb(err, null);  }
      debug && console.error("PROJECTS:"+ JSON.stringify(ress, null, 2));
      // Call cb with ress.
      return cb(null, ress);
    });
  }).catch((ex) => {
    // console.log();
    console.error("RP proj. list Error: "+ex);
    cb(ex, null);
  });
}

// Get project details by (non-detailed) project listing entry.
// Call the callback with details data.
function projget(p, cb) {
  var pn = p.projectName;
  debug && console.error("fetching individual project: "+pn);
  axios.get(cfg.url+"project/"+pn, axopt).then((resp) => {
    // OK
    return cb(null, resp.data);
  }).catch((ex) => {
    return cb(ex, null);
  });
}
/* Check (syncronously) all groups and add member(s) as needed.
 * Return member addition structure for memberships that need to be added.
 * Data is indexed by project (use in url) and the values are ready-to-use
 * as POST data in member addition.
 */
function projects_add_mem(projs, usernames) {
  debug && console.error("Projs(to-add-mems-to): "+projs);
  // Projects
  var allpadds = {};
  try {
  projs.forEach((p) => {
    var pn = p.projectName;
    var padd = {};
    usernames.forEach(function (user) {
      // Check user presence
      var u = p.users.find((u) => { return u.login == user; });
      if (u) { debug && console.error(user+" already in project "+p.projectName+ " (in role:"+u.projectRole+")"); return; }
      // Else add ...
      padd[user] = memrole;
      allpadds[pn] = padd;  
    });
  });
  } catch (ex) {
    console.error("projects_add_mem: Error checking/adding members: "+ex);
  }
  debug && console.error(allpadds);
  return allpadds;
}
// TEST: Creating users as LDAP users will NOT work.
function users_create(users, defproj) {
  // Send evertually to: POST /v1/user
  var newusers = users.map((u) => {
    // Note (in existing): accountType: "LDAP"
    var newuser = {accountRole: "USER", defaultProject: defproj,
email: u[3], fullName: u[001], login: u[0], password: null,
projectrole: memrole}; // "CUSTOMER"
    return newuser;
  });
}

var sampp = {
  "accountRole": "USER",
  "defaultProject": "project1",
  "email": "Hessu.hopo@foo.com",
  "fullName": "Hessu Hopo",
  "login": "hhopo",
  "password": null,
  "projectRole": "MEMBER"
};

