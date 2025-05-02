/** Utility library to create SLI apps "the easy way".
* Handles extracting subcommands and parses command line (Using GetOpt).
* Holds the structural state of CLI app w.
* - subcommands
* - options (in GetOpt format)
* ## TODO
* - Add a serializer to inline back a hard-wired pattern of ops (as source code)
* - Add a serializer for ther languages / runtimes (for same ops, optdesc)
*/

var Getopt   = require("node-getopt");

function dclone(d) { return JSON.parse( JSON.stringify(d) ); }

/** Constructor for CLI App
* @param ops (array)- Subcommand operation descriptors
* @param optdesc (array) - GetOpt CLI option description array
* @param opts (object) - Various additional options related to handling 
*/
function cliapp(ops, optdesc, opts) {
  // For legacy compat - check if ops is an object => transform to an array
  if (typeof ops == 'object') {}
  if (!Array.isArray(ops)) { throw "Ops (subcommands) not passed in an Array !!!"; }
  if (!Array.isArray(optdesc)) { throw "CLI Option descriptions not passed in an Array !!!"; }
  // TODO: Check presence of essential props, possibly allow configurable property names
  // 
  this.ops = ops;
  this.optdesc = optdesc;
  this.attrs = {id: "id", label: "label"};
}
/** Extract subcommand and Parse CLI.
* Operate on global process object: process.argv.
*/
cliapp.prototype.parse = function(para) {
  var argv2 = process.argv.slice(2);
  var op = argv2.shift();
  if (!op) { this.usage(`No subcommand passed from command line`); }
  this.op = op;
  var opnode = this.ops.find( (opn) => { return opn[this.attrs.id] == this.op;  });
  if (!opnode) { this.usage("Subcommand  "+op+" not supported."); }
  let getopt = new Getopt(this.optdesc);
  let opt = getopt.parse(argv2);
  let opts = opt.options;
  // Delete short options as redundant
  for (k in opts) { if (k.length == 1) { delete opts[k]; }}
  if (!opts) { opts = {}; } // Ensure an object - even if empty
  this.opts = opts;
  if (para.addself) { opts.self = dclone(this); } // dclone() creates a non-object-instance
  // self-as-(module)-global ???
  // For flexibility - return the node / description for the current subcommand / operation
  return opnode;
}

cliapp.prototype.dump = function () {
  console.log(JSON.stringify(dclone(this), null, 2));
}

cliapp.prototype.usage = function (msg) {
  if (msg) { console.error(); }
  console.error("Use one of the subcommands:");
  // Arrow-f allows this to be this in deeper scope
  console.error( this.ops.map( (opn) => { return `${opn[this.attrs.id]} - ${opn[this.attrs.id]}`; }).join("\n") );
  console.error("CLI Options supported:");
  console.error( this.optdesc.map( (o) => { return `- ${o[1]} - ${o[2]}`; }).join("\n") );
  process.exit(1);
}
module.exports = {
  cliapp: cliapp
};
// Sample internal test app
let ops = [
  {id: "run",  label: "Run CLI testbed", cb: (opts) => { console.log(`Running the cliapp !!!`, opts); }},
  // Using method dump() has inherent problem ... of circularity
  {id: "dump", label: "Dump app", cb: (opts) => { console.log(`DUMP:`, opts.self ); }},
];
let cliopts = [
  ["d", "debug", "Turn on debugging"],
];
// even cliapp.js is a cliapp !
if (process.argv[1].match("cliapp.js")) {
  let cliapp = module.exports; // Like cliapp = require("cliapp")
  ///// Typical flow of cliapp instance ////////
  // Before addressing the CLI there may be a need to
  // - load config for the app: let cfg = require(cfgfn);
  // - Initialize app: init(cfg)
  let app = new cliapp.cliapp(ops, cliopts, {});
  let opn = app.parse({ addself: true });
  let rc  = opn.cb(app.opts);  
  
}
