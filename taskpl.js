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

// Keep ectx as module global ? Alt: module.exports ? Alt: Always pass ? Hybrid (==both)
// let ectx = null;

// Run http task with info / params from it (url,params,method)
// https://stackoverflow.com/questions/46347778/how-to-make-axios-synchronous

async function httpreq(it) {  
  return await axios.get(it.url).then( (r) => {return r.data});
}

// Run single task with extra context.
// pass cb to follow.
function run_it(it, ectx, cb) {
  // File task (sync)
  if (it.filename) {
    try {
      it.cb(it, ectx);
	} catch (ex) {
	  console.error(`Failed to run file task: ${ex}`);
	  return cb(`Error in file task: ${ex}`, null);
	}
    return cb(null, it);
  } // sync ?
  // Command task.
  // spawn: cpr.on('close', (code) => {}) can capture exit val.
  // See also stdout = execSync(cmd,  copts); - will throw on errors
  if (it.cmd) {
    let cwd = it.cwd || null;
	let copts = {}; // cwd, env,maxBuffer (def 1M)
    let cpr = cproc.exec(it.cmd, copts, function (error, stdout, stderr) {
	  if (error) { console.error(`Command task failed w. rc: error.status`); return cb(`Cmd failed`, null);}
	  //NA: console.log(`Ran cmd task w. exit status: '${error.status}'`);
	  // Run extractor (must be sync !!!). Place params in an new object or it ?
	  if (it.cb) { it.cb(error, stdout, stderr); }
	  return cb(null, it);
	});
	// Sync ?
	//try {
	//  let stdout = cproc.execSync(it.cmd, copts);
	//  if (it.cb) { it.cb(error, stdout, stderr); }
	//  return cb(null, it);
	//} catch (ex) { return(); }
  }
  // http task. Can we syncronify axios call ?
  else  if (it.url) {
    // httpreq();
  }
  else {
    console.error(`Unrecognizable task ('${it.name}') !`);
    return cb(`Task was none of the known types`, null);
  }
}

function run_by_tid(arr, tid, ectx) {
  let it = arr.find( (it) => { return it.id == tid; });
  if (!it) { throw "No task item found"; }
  run_it(it, ectx);
}

module.exports = {
  ectx: null,
  run_it: run_it,
  run_by_tid: run_by_tid,
};

async function itmain(it) {
  let resp = await httpreq(it);
  console.log(`main response data: `, resp.data);
}

if (process.argv[1].match(/\btaskpl.js$/)) {
  console.log(`Running taskpl...`);
  let taskpl = module.exports;
  let its = [
    { url: "https://linux.org/", },
	{ cmd: "ls -al /mnt", cb: (err, so, se) => { console.log(`STDOUT: ${so}`); }}
  ];
  let cb = (err, it) => { console.log(`Done with ${it}`); };  
  //itmain(its[0]);
  run_it(its[1], {foo: 1}, cb);
}
