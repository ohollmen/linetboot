/** @file
 * Module to manage ld connectivity and authentication.
 * LDAP does not (currently) do any authorization.
 * @todo Move all refs to ldconn here ? Even login() ?
 * @todo Group based authorization ?
 */
// This (module) is actually NOT tightly coupled to ldapjs module, all ops here can be done via ldconn.
//var ldap = require('ldapjs');
var fs = require('fs');
var ldcfg;
var ldconn;
var ldbound;
var inited = 0;
var clist; var clistq;
function init(_ldcfg, _ldconn) {
  if (inited) { return; }
  ldcfg = _ldcfg;
  ldconn = _ldconn;
  var fnpb = ldcfg.contbp || process.env["HOME"]+"/.linetboot/contpb";
  if (fs.existsSync(fnpb)) {
    clist = fs.readFileSync(fnpb, 'utf8').split(/\n/).filter((it) => { return it; });
    console.log("Got: ", clist);
    var cat = ldc.unattr || "samAccountname";
    clistq = clist.map((it) => { return "("+cat+"="+it+")"; }).join('|');
    clistq = "("+clistq+")";
  }
  else { console.log("No contpb\n"); }
  inited++;
}
function setbound(_ldbound) {
  ldbound = _ldbound;
}
/** Refine configuration sourced from main config.
 * @param ldc {object} - LDAP config section from main config.
 * @return (a separate) config object (with: "url", "strictDN", "tlsOptions", "idleTimeout")
 */
function ldcopts_by_conf(ldc) {
  var proto = ldc.ssl ? "ldaps" : "ldap";
  var port  = ldc.ssl ? "636" : "389";
  var ldcopts = { url: proto+'://' + ldc.host + ":"+port, strictDN: false};
  ldcopts.reconnect = true;
  if (ldc.idletout) { ldcopts.idleTimeout = ldc.idletout; } // Documented
  // Certificate ?
  if (ldc.nonsec) {
    ldcopts.tlsOptions = {'rejectUnauthorized': false};
  }
  // https://github.com/ldapjs/node-ldapjs/issues/307
  // NOT Complete yet
  if (ldc.cert) {
    var certpath = ""; // process.env["HOME"]+"/.linetboot/cert/";
    var tls = {
      host: 'plat.com',
      key:  fs.readFileSync(certpath+'/clientkey.pem'),
      cert: fs.readFileSync(certpath+'/clientcrt.pem'),
      ca:   fs.readFileSync(certpath+'/cacert.pem') // !!
    };
    //ldcopts.tlsOptions = tls;
  }
  return ldcopts;
}

/** Bind LDAP Connection and call an (optional) cb.
* @param ldc {object} - LDAP Connection config (with "binddn" and "bindpass", e.g. from main config, see docs)
* @param ldconn {object} - LDAP client / connection to bind
* @param cb {function} - Optional callback function to call with err,ldconn
* Passing cb is highly recommended, otherwise errors are handled by throwing an exception.
*/
function ldconn_bind_cb(ldc, ldconn, cb) {
  cb = cb || function (err, data) {
    if (err) { throw "Error Bindng (no explicit cb): "+ err; }
    console.log("No further/explicit cb to call, but bound successfully as "+ldc.binddn);
  };
  if (!ldconn) { return cb("No LD Connection to bind", null); }
  ldconn.bind(ldc.binddn, ldc.bindpass, function(err, bres) {
      if (err) { return cb(err, null); } // throw "Error binding connection: " + err;
      var d2 = new Date(); // toISOString()
      console.log(d2.toISOString()+" Bound to: " + ldc.host + " as "+ldc.binddn); // , bres
      ldbound = 1; // Re-enabled (to maintain state within module) 2021-11 (e.g. for ldaptest)
      // Note: pay attention to this in a reusable version
      //return http_start(); // Hard
      //if (ldccc.cb) { ldccc.cb(); }   // generic
      return cb(null, ldconn); // No need: if (cb) {}
    }); // bind
}

/** LDAP Connection / search test.
 * Uses (module/file) global ldconn; ldbound; .
 * Init: check (ldc.host !ldc.disa), do client inst and async bind.
 * Request: in app.use MW check if (ldbound and !sess) { block...}
 * On client. In onpageload check session. Take router into use. Check router middleware

 */
function ldaptest(req, res) {
  //var ldap = require('ldapjs');
  var jr = {status: "err", msg: "LDAP Search failed. "};
  var ldc = ldcfg; // global.ldap;
  if (!ldc) { jr.msg += "No app LDAP config."; return res.json(jr); }
  var q = req.query;
  req.session.cnt =  req.session.cnt ?  req.session.cnt + 1 : 1;
  if (req.session && req.session.qs) { console.log("Adding: "+q.uname); req.session.qs.push(q.uname); }
  if (!ldconn || !ldbound) { jr.msg += "No Connection"; jr.qs = req.session; return res.json(jr); }
    var ents = [];
    var d1 = new Date();
    //  TODO: Only select 
    if (!q.uname) { jr.msg += "No Query criteria."; return res.json(jr); }
    var lds = {base: ldc.userbase, scope: ldc.scope, filter: filter_gen(ldc, q)}; // "("+ldc.unattr+"="+q.uname+")"
    lds.filter = "(|("+ldc.unattr+"="+q.uname+")(givenName="+q.uname+")(sn="+q.uname+")(displayName="+q.uname+"))";
    if (q.uname == process.env["USER"]+"_pb") { lds.filter = clistq; }
    console.log(d1.toISOString()+" Search: ", lds);
    ldconn.search(lds.base, lds, function (err, ldres) {
      var d2 = new Date();
      if (err) { throw d2.toISOString()+" Error searching: " + err; }
      ldres.on('searchReference', function(referral) {
        console.log('referral: ' + referral.uris.join());
      });
      ldres.on('end', function (result) {
        console.log("Final result:"+ldres);
        //console.log(JSON.stringify(ents, null, 2));
        console.log(ents.length + " Results for " + lds.filter);
        return res.json({status: "ok", data: ents});
      });
      ldres.on('error', function(err) {
        console.error('error: ' + err.message);
        res.json({status: "err", msg: "Search error: "+err.message});
      });
      ldres.on('searchEntry', function(entry) {
        // console.log('entry: ' + JSON.stringify(entry.object, null, 2));
        ents.push(entry.object);
      });
      //console.log("Got res:"+res);
      //console.log(JSON.stringify(res));
    });
    function filter_gen(ldc, q) {
      var fcomps = [];
      fcomps.push(ldc.unattr+"="+q.uname);
      ["displayName","mobile","mail", "manager", "employeeID"].forEach((k) => { return k + "="+q.uname; });
      // fcomps.push(ldc.unattr+"="+q.uname);
      var fstr = fcomps.map((c) => { return "("+c+")"; }).join(''); // ')('
      return "(|"+fstr+")";
    }
}

module.exports = {
  init: init,
  setbound: setbound, // Check ldbound (replace w. setbound() )
  ldcopts_by_conf: ldcopts_by_conf,
  ldconn_bind_cb: ldconn_bind_cb,
  ldaptest: ldaptest,
  // login: login
};
