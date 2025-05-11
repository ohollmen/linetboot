/** Ollama client.
* https://github.com/ollama/ollama/blob/56318fb365be38253fc9abeeabc850d01be2521a/docs/faq.md#how-do-i-configure-ollama-server
* API (fairly recent / up-to-date version as of 2025-05): https://www.postman.com/postman-student-programs/ollama-api/documentation/suc47x8/ollama-rest-api
Make ollama run on external port:
```
# MacOS
launchctl setenv OLLAMA_HOST "0.0.0.0"
# Linux
systemctl edit ollama.service
# Add into advised area: [Service]\nEnvironment="OLLAMA_HOST=0.0.0.0"
```
## Actions on GUI
- Ask / Send (Prompt)
- Load model: generate OR chat: {"model": "mistral"}
- Preload Model (generate w. {"model": "llama3", "keep_alive": -1} )
- Unload Model: (generate w. {"model": "llama3", "keep_alive": 0} )
- Reset chat context

## Other
- OLLAMA_MAX_QUEUE (concurrency), OLLAMA_MAX_LOADED_MODELS
*/
let fs    = require("fs");
let axios = require('axios');
let cliapp = require("./cliapp");
let cfg = {};

let apiprefix = "api";

function init(_mcfg) {
  if (!_mcfg) { throw "No config passed"; }
  if (_mcfg.ollama) { cfg = _mcfg.ollama; }
  else if (_mcfg) { cfg = _mcfg; }
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  // Let env override
  if (process.env["LINETBOOT_OLLAMA_HOST"]) { cfg.host = process.env["LINETBOOT_OLLAMA_HOST"]; }
}
//////////////////// SESSION /////////////////////
function sess_load(fn) {
  let cont = fs.readFileSync(fn, 'utf8');
  if (!cont) { return null; }
  let sess = JSON.parse(cont);
  if (!sess) { return null; }
  return sess;
}
function sess_sync(fn, sess) {
  console.error(`Syncing session (w. ${sess.length} items)`);
  try {
    fs.writeFileSync( fn,  JSON.stringify(sess, null, 2) , {encoding: "utf8"} );
  } catch (ex) { console.error(`Error: Could not sync context to ${fn}`); return 1; }
  return 0;
}

// Add new "role": "user/assistant", "content": "..." items (2) to session.
function sess_add(fn, c1, c2) { // TODO: spread-op
  console.error(`Adding 2 items to session`);
  let sess = sess_load(fn);
  //let add = [];
  if (isstr(c1) && isstr(c2)) { // message strings assuming from user, assistant
  // // NOT: sess = sess.concat(add); // Must use push() to reflect in passed array (w/o return)
   sess.push({role: "user", content: c1});  sess.push({role: "assistant", content: c2});
  }
  else if (isobj(c1) && isobj(c2)) { // objects
    sess.push(c1); sess.push(c2);
  }
  let err = sess_sync(fn, sess);
  if (err) { console.error(`Error Saving the session context to ${fn}`); }
  // Re-load and return whole ...
  let all = sess_load(fn);
  if (!all) { console.error(`Error: No session messages were loaded from ${fn}`); return null; }
  return all;
  function isobj(o) { return typeof o == 'object' ? true : false; }
  function isstr(o) { return typeof o == 'string' ? true : false; }
}

////////////////// REST /////////////////////
/** Query Ollama with a prompt (w. context on /chat or w/o on /generate) */
function chat_query(opts, cb) {
  let usch = 'https';
  cb = cb || function (err, d) {}
  if (cfg.sec != undefined && !cfg.sec) { usch = 'http'; }
  let url = `${usch}://${cfg.host}/api/chat`; // chat or generate
  let model = opts.model || cfg.model; // opts.model OR req.body.model
  // 'What is the meaning of life?'
  if (!opts.prompt) { console.error(`Must have a prompt text !`); return cb("No prompt", null); }
  // mandatory (both generate, chat): model, prompt
  // Default: stream: false,
  let omsg = { model: `${cfg.model}`, stream: false, }; // Common
  let fn = `/tmp/ollama.session.${opts.sessid}.json`;
  let sysmsg = {role: "system", "content": ""}; // Global ? // example: you are a salty pirate
  let prmsg  = {role: "user", "content": opts.prompt}; // Current prompt dialog node
  let initial = 0; // Session state. Seems to become redundant (as presence of ${fn} guides this)
  // url.match(/chat$/)
  // N/A: let mpair = [{role: "user", content: opts.prompt}];
  if (ischat(url)) { // (opts.op && opts.op == 'chat') {
    // Initial /chat messages (2)
    omsg.messages = []; // To avoid crashes, to get .length (0)
    // NONEED: delete omsg.prompt; // /chat must NOT have prompt
    // Policy: Only (ever) sync after successful response
    if (!fs.existsSync(fn)) { initial = 1; omsg.messages = [sysmsg, prmsg,]; } 
    // Load and add current user prompt/content
    else { oldmsgs = sess_load(fn); omsg.messages = oldmsgs.concat(prmsg); } // omsg.messages[1]
  }
  else { omsg.prompt = opts.prompt; } // /generate => simple "prompt" (no "messages") !
  let rpara = {};
  console.error(`Calling ${url} w. para: `, omsg);
  axios.post(`${url}`, omsg, rpara).then((resp) => {
    let d = resp.data;
    //if (ischat(url) && initial) {  } // Initial => Add Last message: d.message
    //else { sess_add(fn, opts.prompt, d.response); }
    console.log(d); // Pick up d.response
    // In "chat" mode we get (singular) message: {} - must append it to the session !!!
    // Use request omsg.messages as container to appned response to
    if (ischat(url)) {
      if (typeof d.message != 'object') {
        console.error(`No message in response !!!`, d); return cb(`No message`, null); }
      omsg.messages.push(d.message);
      console.log(`Should sync the chat (of ${omsg.messages.length} msgs) to ${fn}`);
      sess_sync(fn, omsg.messages); // omsg.messages should have all
      cb(null, d);
    }
  }).catch((error) => { console.error(error); return cb(error, null); });
  function ischat(url) { return url.match(/chat$/) ? 1 : 0; }
}
function models_list(opts) {
  let usch = 'https';
  if (cfg.sec != undefined && !cfg.sec) { usch = 'http'; }
  let url = `${usch}://${cfg.host}/api/tags`;
  //let url = ``;
  let rpara = {};
  axios.get(`${url}`, rpara).then((resp) => {
    let d = resp.data;
    console.log(JSON.stringify(d, null, 2));
  }).catch((ex) => { console.error(ex.response); });
}
function sess_dump(opts) {
  if (!opts.sessid) { app.usage("No session id passed !"); }
  let fn = `/tmp/ollama.session.${opts.sessid}.json`;
  let s = sess_load(fn);
  console.log(JSON.stringify(s, null, 2));
}
// Handle Ollama web query.
// For now keep to simple GET query (?q=... MUST escape on client side)
function hdl_query(req, res) {
  let jr = {status: "err", msg: "Could not complete Ollama AI query. "};
  if (!req.query.q) { jr.msg += "No query found !"; return res.json(jr); }
  chat_query({prompt: q}, function (err, d) {
    if (err) { jr.msg += `Failed to retrieve Ollama response: ${err}`; return res.json(jr); }
    //let cont = d.message.content; // d is *complete* Ollama response. Extract d.message.content; ?
    res.json({status: "ok", data: d}); // Send full Ollama response
  });
}
let ops = [
  {id: "gen", label: "Query Ollama w/o context (/generate)", cb: chat_query},
  {id: "chat", label: "Query Ollama by Contextual Chat", cb: chat_query},
  // Load model ?
  //{id: "loadmodel",  label: "Load Ollama Model", cb: ...},
  {id: "listmodels", label: "List Ollama Models (on server)", cb: models_list},
  {id: "dumpsession", label: "Dump session by id", cb: sess_dump},
];
let cliopts = [
  ["s", "sessid=ARG", "Session ID (part of fn to store session in)"],
  ["p", "prompt=ARG", "Prompt text"],
  ["m", "model=ARG", "Model to use for querying Ollama (e.g. 'llama3.2')"],
  //["", "", ""],
  //["", "", ""],
  //["", "", ""],
];
module.exports = {
  
};

// E.g. node ollama.js chat --prompt "What is the Capital of United Kingdom ?" --sessid 123
// TEST:
// - "What is the Capital of England ?",
// - "How many people live in London ?",
// - "What is the top 1 sight to see in the city ?"
if (process.argv[1].match("ollama.js")) {
  let mcfgfn = `${process.env.HOME}/.linetboot/global.conf.json`;
  let mcfg   = require(mcfgfn);
  init(mcfg);
  //artihub_list({});
  let app = new cliapp.cliapp(ops, cliopts, {});
  let opn = app.parse({ addself: false });
  //if (app.opts.debug) { console.error("ARGV:", process.argv); }
  //if (!process.argv[3]) { app.usage("Need prompt text as argument (after subcomm)"); }
  //app.opts.prompt = process.argv[3];
  if (process.env.OLLAMA_SESSID) { app.opts.sessid = process.env.OLLAMA_SESSID; }
  app.opts.op = app.op;
  console.log("Opts: ", app.opts);
  let rc  = opn.cb(app.opts);
  console.error(`List session(s): ls -al /tmp/*.json`);
}
