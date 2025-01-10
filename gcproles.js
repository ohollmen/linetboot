/** @file
* Find GCP roles (for "name") by display name ("title").
* The "full catalog" of roles is extractable by: `gcloud iam roles list` (populate gcproles.yaml w. this).
* 
*/
let fs = require("fs");
let jsyaml = require("js-yaml");
let cfg = {};
let rarr = [];
let exlist = null; // signify absence
function init(_mcfg) {
  cfg = (_mcfg && _mcfg["gcproles"]) ? _mcfg["gcproles"] : _mcfg;
  if (!cfg) { cfg = {}; }
  let fn = `${process.env["HOME"]}/.linetboot/gcproles.yaml`;
  if (!fs.existsSync(fn)) { throw "GCP role config does not exist";  }
  let cont = fs.readFileSync(fn, 'utf8');
  // NOTE: "expected a single document in the stream, but found more" - Must use loadAll on multi-document YAML.
  rarr = jsyaml.loadAll(cont);
  if (!rarr || ! Array.isArray(rarr)) { throw "Roles (in YAML) could not be loaded/parsed !"; }
}
// Load Role list with "title" values (line oriented text).
function rlist_load(fn) {
  if (!fs.existsSync(fn)) { throw `role list '${fn}' does not exist`;  }
  let cont  = fs.readFileSync(fn, 'utf8');
  let lines = cont.split(/\n/);
  lines = lines.map( (l) => { return l.trim(); });
  lines = lines.filter( (l) => { return l && ( ! l.match(/^\s+$/) ); });
  return lines;
}
// Search items in role list. Use mod-global rarr to search from.
function rlist_search(rlist, exact) {
  if (!rlist) { throw "No rlist passed for search."; }
  let arr = []; // Output / Res
  let notfound = [];
  let ambiguous = [];
  rlist.forEach( (rdn) => { // role descriptive name
    // name (e.g. roles/iam.roleAdmin),
    // title (e.g. Role Administrator)
    // description - often same as title
    // Also: string.indexOf(substring) !== -1
    // Use exact match ? Configurable
    let fres = rarr.filter( (ri) => {
      if (exact) { return ri.title == rdn; } // Exact match
      return ri.title.includes(rdn);
    });
    if (!fres || !fres.length) { notfound.push(rdn); return; }
    if (fres.length > 1) {
      let multilist = fres.map( (ri) => { return ri.title; });
      console.log(`Warning: Many results (${fres.length}) for "${rdn}" (${multilist.join(',')})`);
      ambiguous.push(rdn);
      return;
    }
    if (exlist && exlist.includes(fres[0].title)) {
      console.log(`Warning: Role to be excluded: ${fres[0].title}`); fres[0].exclude = 1;
    }
    arr.push(fres[0]);
  });
  return {notfound: notfound, res: arr, ambiguous: ambiguous};
}

function hdl_search(req, res) {
  let jr = {status: "err", "msg": "Could not Search roles. "};
  let b = req.body;
  let lines = [];
  if (b.rtext) { lines = cont.split(/\n/); lines = lines.map( (l) => { return l.trim(); }); }
  else if (b.rlines) { lines = b.rlines; }
  else { jr.msg += "No search cliteria roles passed !"; return res.json(jr); }
  let rres = rlist_search(rlines);
  if (!rres) { jr.msg += `No search results for role search (w. ${rlines.length} role titles)`; return res.json(jr); }
  res.json({status: "ok", "data": rres});
}

// Format role search result back to simple text lines w. "name", "title"
function rres_fmt(rres) {
  if (rres.notfound && rres.notfound.length) {
    console.log(`Roles that could not be found: ${rres.notfound.join(', ')}`);
  }
  if (rres.ambiguous && rres.ambiguous.length) {
    console.log(`Roles that had many matches: ${rres.ambiguous.join(', ')}`);
  }
  let i = 1;
  rres.res.forEach( (ri) => { console.log(`${i} ${ri.name}  "${ri.title}"`); i++; });
}

let acts = [
  //"search":
  {"id": "search", "title": "Search a (single) role.", cb: searchrole},
  //"searchlist":
  {"id": "searchlist", "title": "Search by search list (file, pass as first arg.)", cb: searchlist},
];

function searchlist(opts) {
  ////////////// R-List //////////////
  //let rlistfn = process.argv[2];
  let rlistfn = opts.args[0];
  let rlist;try { rlist = rlist_load(rlistfn); } catch (ex) { console.error("No role list passed as (first) argument."); process.exit(1); }
  console.log(`Loaded role-search items (${rlist.length})`);
  console.log(JSON.stringify(rlist, null, 2));
  //////////// Ex-list ////////////
  let exlistfn = opts.args[1]; //process.argv[3];
  if (exlistfn) {
    exlist = rlist_load(exlistfn); // Mod global
    console.log(JSON.stringify(exlist, null, 2));
  }
  ////// Search //////
  let exact = 1; // TODO: from --exact
  let rres = rlist_search(rlist, exact);
  //console.log(JSON.stringify(rres, null, 2));
  console.log(`Found ${rres.res.length} roles for original ${rlist.length} (exact=${exact}).`);
  rres_fmt(rres);
}
function searchrole(opts) {
  //let skw = process.argv[2]; // OLD: 2
  let skw = opts.args[0];
  let oper = ""; let mkw = null;
  // if (oper) {
  //   mkw = skw.split(/\s+/); // mkw = Multi Keyword
  //   if (mkw.length < 2 ) { console.log("Multiple KW:s expected, but found only single search KW"); }
  //} // AND / OR search
  //if (oper == 'AND') {
  // // // find()? first non match
  // cb = (ri) => { let m = mkw.find( (kw) => { return !ri.includes(kw);  });return !m; };
  //}
  //else if (oper == 'OR') {
  //  // find()? first match
  //  cb = (ri) => { let m = mkw.find( (kw) => { return ri.includes(kw);  });return m; }
  //}
  let res = rarr.filter( (ri) => { return ri.title.includes(skw); });
  console.log(`Results for search by '${skw}'`);
  rres_fmt({res: res});
}

function usage(msg) {
  if (msg) { console.log(msg); }
  console.log("Subcommands ");
  acts.forEach( (a) => { console.log("- " + a.id + " - " + a.title ); });
  //console.log("Options (each may apply to only certain subcommand)");
  //clopts.forEach( (o) => { console.log("- "+o[1] + " - " + o[2]); });
  process.exit(1);
}

// node gcproles.js myroles.txt badroles.txt
// TODO:
// Subcommands: search (single by description)
// - Cache role-perms files based on rolelist to cfg.rolepermpath (gen cmds first)
if (process.argv[1].match("gcproles.js")) {
  init();
  console.log(`Loaded all-roles file (${rarr.length} roles) w. success`);
  var argv2 = process.argv.slice(2);
  var op = argv2.shift();
  if (!op) { usage("No subcommand"); }
  var opnode = acts.find( (an) => { return an.id == op;  });
  if (!opnode) { usage(`Subcommand '${op}' not supported.`); }
  let opts = { args: argv2 };
  console.log(opnode, opts);
  var rc = opnode.cb(opts) || 0;
  //console.log(rarr);
  //searchlist();
  //searchrole();
  process.exit(rc); // synchr. !
}
