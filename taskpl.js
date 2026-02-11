#!/usr/bin/env node
/** Task Pipeline of sync and async tasks
* ectx = Extra/External context
* ## Notes
* - Try to 'syncronify' command task by hints from https://nodejs.org/api/child_process.html => execSync()
* ## Refs
* - Axios object param call form: https://dev.to/neisha1618/staying-in-sync-with-asynchronous-request-methods-axios-2ilh
* - Sync return from axios: https://forums.meteor.com/t/solved-how-to-return-the-result-of-an-axios-call-to-the-client/55392/2
*   - Idiom: return await axios.get(url).then(content => content.data);
* - https://stackoverflow.com/questions/64296309/how-can-i-make-an-axios-get-request-synchronous
*/


/*
ReferenceError: Cannot determine intended module format because both require() and top-level await are present. If the code is intended to be CommonJS, wrap await in an async function. If the code is intended to be an ES module, replace require() with import.
    at file:///net/src/linetboot/taskpl.js:12:10
    at ModuleJob.run (node:internal/modules/esm/module_job:343:25)
    at async onImport.tracePromise.__proto__ (node:internal/modules/esm/loader:665:26)
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:117:5) {
      code: 'ERR_AMBIGUOUS_MODULE_SYNTAX'
*/

let fs = require("fs");
let asyncjs = require("async");
let cproc = require("child_process");
let axios = require("axios");
let httpreq = require("./httpreq.js");
var Mustache = require("mustache"); // For templating
var jsyaml  = require('js-yaml'); // YAML mods ...
// Keep ectx as module global ? Alt: module.exports ? Alt: Always pass ? Hybrid (==both)
// let ectx = null;

///////////////////// Task type related work routines /////////

function runtmpl(it, ectx) {
  let cont = fs.readFileSync(it.tmplfn, 'utf8');
  // if (it.tmplfn.match(/\.mustache$/)) {} // Detect tmpl type
  it.cont  = Mustache.render(cont, ectx);
  // if (it.filename == '') { return; }
  let ofn = `${ectx.gitroot}/${it.filename}`;
  console.log(`Should save (later) to '${ofn}' (no name means its an independent snippet)`);
  if (ofn && fs.existsSync(ofn)) { console.log(`WARNING: File ${ofn} already exists !!`); }
  if (it.debug) console.log(`runtmpl content:\n${it.cont}\n======END-OF-TMPL-CONT======`);
  // Do not write here !!!
  // fs.writeFileSync(`${it.filename}`, it.cont, {encoding: "utf8"} ); // outside
};
function yamlmod(it, ectx) {
  let fn = `${ectx.gitroot}/${it.filename}`;
  
  if (!fs.existsSync(fn)) { console.log(`ERROR: File to modify: '${fn}' does not exist !!`); return; }
  let d = yaml_load(fn);
  let ytop = d;
  if (!it.datapath) { throw("No .datapath (in dot-not) defined in node");} // exists
  let pa = it.datapath.split(".");
  let i = 0;
  //while (y[i]) {}
  for (i=0;pa[i] && d[ pa[i] ];i++) { d = d[ pa[i] ]; } // hasOwnProperty
  if (!d) { console.log("No data found at the end of the dot-not path."); return; }
  // TODO: Have a flexible requirement data type here
  
  ////////////////// Mod part ! (model by modcb(it, ectx) ?)
  if (it.modcb) { it.modcb(d); }
  else { console.log(`Note: mofif. callback for yaml mod is missing !!`); }
}
// Run http task with info / params from it (url,params,method)
// https://stackoverflow.com/questions/46347778/how-to-make-axios-synchronous

async function httpcall(it, cb) {
  console.log(`Calling URL: ${it.url}`);
  return await axios.get(it.url).then( (r) => {
    return r.data;
    //if (cb) { cb(); }
  }); //.catch( (ex) => { console.error(`HTTP Exception {ex}`); return null; });
}

/////////////////// High level task orchestration ///////////////
function arr_nextlink(arr) {
  for (let i = 0;i<arr.length;i++) {
    let o = arr[i];
    let n = arr[i+1] || null; // Also ...
    //let n = (i+1 < arr.length) ? arr[i+1] : null;
    o.next = () => { return n; };
    // Check if typeof object
  }
}
// Run single task with extra context.
// pass cb to follow (asynchronous action).
// Tasknode (it) may have private (synchronous) hooks on it (per tasktype):
// - filemod: cb(it, extx) - should do cb(it, extx, fn) (but "filename" is already in it) ?
// - cmd: cb(it, ectx, stdout)
// - http: cb(it, ectx, resp)
function run_it(it, ectx, cb) {
  // File task (sync)
  if (it.hasOwnProperty("filename")) { // it.filename
    // Note there is fw-level no default op on file (e.g. load content). Handler must handle everything.
    try {
      if (it.cb) it.cb(it, ectx);
      if (ectx && ectx.dryrun) { console.log(`Dry-run mode (not saving '${it.filename}')`); }
      else if (it.cont && it.savecont) {
        console.log(`Saving content (${it.cont.length} B) to ${it.filename}`);
        fs.writeFileSync(it.filename , it.cont, {encoding: "utf8"} );
      }
      else { console.log(`Not dryrun, not to be saved (cont: ${it.cont.length} B)`); }
    } catch (ex) {
      let msg = `Error: Failed running file task '${it.name}': ${ex}`;
      console.error(`${msg}`);
      if (cb) return cb(msg, null);
    }
    if (cb) return cb(null, it);
  } // sync ?
  // Command task.
  // spawn: cpr.on('close', (code) => {}) can capture exit val.
  // See also stdout = execSync(cmd,  copts); - will throw on errors
  else if (it.cmd) {
    let cwd = it.cwd || null;
    let copts = {}; // cwd, env,maxBuffer (def 1M)
    /*
    let cpr = cproc.exec(it.cmd, copts, function (error, stdout, stderr) {
      if (error) { console.error(`Command task failed w. rc: error.status`); return cb(`Cmd failed`, null);}
      //NA: console.log(`Ran cmd task w. exit status: '${error.status}'`);
      // Run extractor (must be sync !!!). Place params in an new object or it ?
      if (it.cb) { it.cb(error, stdout, stderr); }
      return cb(null, it);
    });
    */
    // Sync ? Note: Cannot capture stderr on rc=0
    try {
      let stdout = cproc.execSync(it.cmd, copts);
      if (!it.nostr) { stdout = stdout.toString(); } // Buffer to string
      if (it.cb) { it.cb(it, ectx, stdout); }
      
    } catch (ex) {
      let msg = `Error: Failed to run command (in sync mode): {ex}`;
      console.error(`${msg}`);
      if (cb) return cb(msg, null);
    }
    if (cb) return cb(null, it);
  }
  // http (URL) task. Can we syncronify axios call ?
  else if (it.url) {
    console.log(`TODO: Run http URL task '${it.name}' !!!`);
    let resp_p = httpcall(it);
    console.log(`Initial ret. from httpcall(it): ${resp_p}`);
    resp_p.then( (resp) => {
      if (it.cb) { it.cb(it, ectx, resp); } // Task cb for resp
      if (cb) return cb(null, it); // completion asyncjs
    });
    // Typical processing: Use resp.data (body) or resp.headers.
    
  }
  else {
    console.error(`Unrecognizable task ('${it.name}') !`);
    return cb(`Task was none of the known types`, null);
  }
}

function run_by_tid(arr, tid, ectx) {
  //let isarr = Array.isArray(tid);
  let findcb = (it) => { return it.id == tid; };
  //if (isarr) { findcb = (it) => { return tid.includes(it.id); }; }
  let it = arr.find( findcb );
  if (!it) { throw "No task item found"; }
  run_it(it, ectx);
}

module.exports = {
  ectx: null,
  run_it: run_it,
  run_by_tid: run_by_tid,
  /// Helpers
  runtmpl: runtmpl,
  yamlmod: yamlmod,
  arr_nextlink: arr_nextlink,
};

async function itmain(it) {
  let resp = await httpcall(it);
  console.log(`main response data: `, resp.data);
}
let ops = [
  {},
  {}
];
if (process.argv[1].match(/\btaskpl.js$/)) {
  console.log(`Running taskpl...`);
  let taskpl = module.exports;
  let ectx = { dryrun: 0, };
  var Mustache   = require("mustache");
  let its = [
    { url: "https://linux.org/", },
    { cmd: "ls -al /mnt", cb: (it, ectx, so) => { console.log(`STDOUT: ${so}`); it.cont = so; }}, // so.trim()
    { filename: `/tmp/testfile_${Math.random(1000)}.md`,
      
      cb: function (it, ectx) {
        it.cont = Mustache.render("# Hello {{name}}\nHow's your {{subject}} ?\n...\n", { name: "Mr Smith", subject: "son Jack" });
        
      },
      savecont: 1,
    },
  ];
  for (let i = 0; i < its.length; i++) { its[i].lbl = i.toString()}
  arr_nextlink(its);
  // its.forEach( (it) => { console.log(`Next(${it.lbl}) is ${it.next()}`);} );

  let cb = (err, it) => { console.log(`Done with ${JSON.stringify(it)}`); };  
  //itmain(its[0]);

  //taskpl.run_it(its[1], ectx, cb);
  //taskpl.run_it(its[2], ectx, cb);
}
