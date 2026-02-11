#!/usr/bin/env node
/**
 * 
 * # Refs
 * - https://axios-http.com/docs/multipart
 * - Test URL w. very little content: https://jsonplaceholder.typicode.com/posts/1
 * ## Noteworthy error
 * Error: ReferenceError: Cannot determine intended module format because both require() and top-level await are present. If the code is intended to be CommonJS, wrap await in an async function.
 * If the code is intended to be an ES module, replace require() with import.
 */
 
//var fs         = require("fs");
//var path       = require("path"); // path.basename(),path.dirname()
//var axios     = require("axios");
//import * as fs from "fs";
//import * as path from "path";
import fs from "fs";
import path from "path";
//SyntaxError: Named export 'get' not found. The requested module 'axios' is a CommonJS module, which may not support all module.exports as named exports.
//CommonJS modules can always be imported via the default export, for example using:

//import pkg from 'axios';
//const {get, post, postForm} = pkg;
//import {get, post, postForm} from "axios";

import axios from 'axios';

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
export function auth_conf_set(x) {
  if (!x || (typeof x != 'object')) { return; }
  auth_conf = x;
  //module.exports.auth_conf = x; // Not in ES2017
}
// Added arbitrary header (e.g. x-api-key: ...) support. Rename to add_creds
export function add_creds(cfg, opts) {
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
  //else if (cfg.authkey && cfg[cfg.authkey]) { opts.headers[cfg.authkey] = cfg[cfg.authkey]; } // authhdrkey ???
  // Arbitrary header (e.g. x-api-key: ...)
  else if (numkeys == 1) { let k = Object.keys(cfg)[0]; opts.headers[k] = cfg[k]; }
  //else { throw "Neither Basic or Bearer auth credentials were configured by config keys "+Object.keys(cfg).join(','); }
  return;
}
export function add_hdrs(hdrs, opts) {
  opts.headers = opts.headers || {};
  if (!hdrs) { return; }
  if (typeof hdrs != 'object') { return; }
  Object.keys(hdrs).forEach( (k) => { opts.headers[k] = hdrs[k]; }); // Merge / transfer
}

// Parse form data (k1=v1&k2=v2) parameter string into an object.
export function formdata_parse(pstr) {
  let p = {}
  // TODO: decode url-enc (at p-assign)
  pstr.split('&').forEach( (kvp) => { k_v = kvp.split('=', 2); p[k_v[0]] = k_v[1]; });
  return p;
}
export function axmethod(rconf) {
  let axmeth = rconf.method.toLowerCase();
  if ((axmeth == 'post') && rconf.multipart) { axmeth = 'postForm'; }
  return axmeth;
}
/// Make a http request with axios based on "request config" (rconf).
export function request(rconf, ectx, ccb) {
  let axmeth, meth; // http method, axios method
  if (!rconf.method) { rconf.method = "get"; }
  meth = axmeth = rconf.method.toLowerCase();
  if ((axmeth == 'post') && rconf.multipart) { axmeth = 'postForm'; }
  let rpara = { headers: {} };
  // Authentication from ...
  if (rconf.atype && auth_conf[rconf.atype]) { add_creds( auth_conf[rconf.atype], rpara); } // Auth sys type
  else if (rconf) { add_creds(rconf, rpara); } // Check rconf
  // Params
  if (rconf.params && rconf.multipart) { rpara.headers['Content-type'] = 'multipart/form-data'; }
  if (rconf.params) { rpara.params = rconf.params; } // depends on method ? && typeof rconf.params == 'object'
  // hdrs to patch
  if (rconf.hdrs) { add_hdrs(rconf.hdrs, rpara); } // && typeof rconf.hdrs == 'object'
  if (rconf.debug) console.log(`Req-para: ${JSON.stringify(rpara)}`);
  // Separate get vs. body methods
  let prom = null;
  // Use full versions of param lists. See if extra/unsupported 
  if (bodymeth[meth]) {
    let data = rconf.data || null; // data ONLY on bodymeth
    prom = axios[axmeth](rconf.url, data, rpara);  // 3 para
  } else {
    prom = axios[axmeth](rconf.url, rpara); // get/delete (NO body)
  }
  // return prom; // ret. promise only ?
  prom.then( (resp) => {
    // Initial policy: rconf may have the rconf.db or as default
    if (rconf.cb && (typeof rconf.cb == 'function')) { rconf.cb(rconf, ectx, resp); }
    else {rconf.data = resp.data; }
    if (ccb) { return ccb(null, rconf); }
  }).catch( (ex) => {
    let msg = `request(${rconf.url}): Error calling '${rconf.url}'`;
    if (!ex.response) { console.log(`request(${rconf.url}): Exception missing .response`); }
    else { msg += `status: ${ex.response.status}`; }
    console.log(msg);
    if (ccb) { return ccb(msg, rconf); }
  });
}
// Internal Example of naive sync-like http call.
// await pauses func till promise settles, but JS event loop continues running.
async function reqsync(url) {
  try {
    let resp = await axios.get(url); // Returns value of .then( (value) => {...})
    console.log(`reqsync()/await Got (status: ${resp.status}) data:`, resp.data);
    return resp.data;
  } catch (ex) { console.error(`Got error (calling {url}): {ex.message}`); throw ex; }
}
async function syncwrap(url) {
  return await reqsync(url);
}
export function curlify(rconf) {
  if (!rconf.method) { rconf.method = "GET"; }
  let cmd = `curl -X ${rconf.method.toUpperCase()}`;
  
  cmd += `'rconf.url'`;
  return cmd;
}
/*
module.exports = {
  auth_conf_set: auth_conf_set,
  add_creds: add_creds,
  request: request,
  //auth_conf: auth_conf, // a.c. data ?
  curlify: curlify,
};
*/
import "node-getopt";
async function main() {
  //(async function () {
    console.log(`Request a url in seemingly blocking way.`);
    let testurl = process.argv[2];
    if (!testurl) { console.log(`Pass URL from CLI !!`); process.exit(); }
    let data = await reqsync(testurl);
    //let data = await syncwrap(testurl);
    console.log(`main: Received data (DONE):`, data);
  //})();
}
if (process.argv[1].match("httpreq.js")) {
  //var Getopt     = require("node-getopt");
  //import * as Getopt from "node-getopt";
  
  console.log(`Running httpreq.js`);
  //let httpreq = module.exports;
  let it = {url: "https://www.linux.org/foo", method: 'GET', cb: (it, ectx, resp) => { console.log(`CB called url: ${it.url} (status: ${resp.status})`); }}
  //request(it);
  // Caller of async / await must itself be async and use await.
  // The below IIFE (Immediately invoked function expression) seems to be ok w. 18.19.1 but not 22.21.1
  // 22.21.1: TypeError: {(intermediate value)(intermediate value)(intermediate value)} is not a function
  
  main();
  
}
