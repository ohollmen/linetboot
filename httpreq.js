#!/usr/bin/env node
/**
 * 
 * # Refs
 * - https://axios-http.com/docs/multipart
 * 
 */
 
var fs         = require("fs");
var path       = require("path"); // path.basename(),path.dirname()
var axios     = require("axios");
//var yaml       = require('js-yaml');
//var asyncjs    = require("async");
//var Mustache   = require("mustache"); // Simple templating on URL:s
let bodymeth = {"post": 1, "put": 1, "patch": 1};

let auth_conf = {
  some: { user: null, pass: null}, // Basic
  other: { token: null }, // Bearer
  third: {"x-api-key": null},// Arbitrary http header
};
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

/////////////////// HTTP methods ///////////////////////
function auth_conf_set(x) {
  auth_conf = x;
  module.exports.auth_conf = x;
}
// Added arbitrary header (e.g. x-api-key: ...) support. Rename to add_creds
function add_creds(cfg, opts) {
  //opts.headers ||= {};
  opts.headers = opts.headers || {}; // 
  //if (typeof cfg != 'object') { throw "Creds config not passed as object !"; }
  let numkeys = Object.keys(cfg).length;
  // New: tweak logic to facilitate Bearer auth
  //if ( !cfg.user || !cfg.pass) { throw "Username or password in credentials missing."; }
  if ( cfg.user && cfg.pass) { 
    var creds_b64 = Buffer.from(cfg.user+":"+cfg.pass).toString('base64');
    if (!creds_b64) { throw "Basic 64 creds empty !"; }
    opts.headers.Authorization = "Basic "+creds_b64;
  }
  else if (cfg.token) {
    opts.headers.Authorization = "Bearer "+cfg.token;
  }
  // Arbitrary header (e.g. x-api-key: ...)
  else if (numkeys == 1) { let k = Object.keys(cfg)[0]; opts.headers[k] = cfg[k]; }
  //else { throw "Neither Basic or Bearer auth credentials were configured by config keys "+Object.keys(cfg).join(','); }
  return;
}
// Parse form data (k1=v1&k2=v2) parameter string into an object.
function formdata_parse(pstr) {
  let p = {}
  // TODO: decode url-enc (at p-assign)
  pstr.split('&').forEach( (kvp) => { k_v = kvp.split('=', 2); p[k_v[0]] = k_v[1]; });
  return p;
}

/// Make a http request with axios based on "request config" (rconf).
function request(rconf, ectx) {
  let ameth, meth; // http method, axios method
  if (!rconf.method) { rconf.method = "get"; }
  meth = axmeth = rconf.method.toLowerCase();
  if ((axmeth == 'post') && rconf.multipart) { axmeth = 'postForm'; }
  let rpara = { headers: {} };
  // Authentication from ...
  if (rconf.atype && auth_conf[rconf.atype]) { add_creds( auth_conf[rconf.atype], rpara); } // Auth sys type
  else if (rconf) { add_creds(rconf, rpara); } // Check rconf
  
  // Separate get vs. body methods
  let prom = null;
  // Use full versions of param lists. See if extra/unsupported 
  if (bodymeth[meth]) {
    prom = axios[axmeth](rconf.url, data, rpara);  // 3 para
  } else {
    prom = axios[axmeth](rconf.url, rpara); // get/delete (NO body)
  }
  // return prom; // ret. promise only ?
  prom.then( (resp) => {
    // Initial policy: rconf may have the rconf.db or as default
    if (rconf.cb && (typeof rconf.cb == 'function')) { rconf.cb(rconf, ectx, resp); }
    else {rconf.data = resp.data; }
  }).catch( (ex) => {
    // ex.response ...
    console.log(`Error calling '${rconf.url}', status: ${ex.response.status}`);
  });
} 
function curlify(rconf) {
  if (!rconf.method) { rconf.method = "GET"; }
  let cmd = `curl -X ${rconf.method.toUpperCase()} `;
}
module.exports = {
  auth_conf_set: auth_conf_set,
  add_creds: add_creds,
  request: request,
  //auth_conf: auth_conf, // a.c. data ?
  curlify: curlify,
};
if (process.argv[1].match("httpreq.js")) {
  var Getopt     = require("node-getopt");
  console.log(`Running httpreq.js`);
  let httpreq = module.exports;
  let it = {url: "https://www.linux.org/foo", method: 'GET', cb: (it, ectx, resp) => { console.log(`CB called url: ${it.url} (status: ${resp.status})`); }}
  httpreq.request(it);
}
