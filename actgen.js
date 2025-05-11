/** Small action generator for gridviews and templated views.
*/
let cliapp = require("./cliapp");

function init(_mcfg) {
  
}

function g_gen(opts) {
  
  let act = opts.act;
  let id = act.path;
  act.name = `${id} Grid View`;
  // act.elsel = "tabs-${id}";
  act.tmpl  = `simplegrid`;
  //console.log(JSON.stringify(act));
  act.hdlr    = "simplegrid_url";
  act.url     = `/${id}`;
  act.gridid  = `jsGrid_${id}`;
  
  act.fsetid  = `${id}`;
  act.uisetup = `${id}_uisetup`;
  console.log(`// app.get('/${id}', ${id}.${id}_list);`);
  console.log(`  ${JSON.stringify(act)},`);
}
function f_gen(opts) {
  let act = opts.act;
  let id = act.path;
  act.name = `${id} Form`;
  act.tmpl = `t_${id}`;
  act.uisetup = `${id}_fm_uisetup`;
  act.hdlr = `hdl_${id}`; // jgrid_form
  act.url  = ``;
  console.log(`// Server Route (URL + handler): app.get('/${id}_fm', ${id}.${id}_fm);`);
  console.log(`  ${JSON.stringify(act)},`);
  console.log(`// Act Hdlr:  function hdl_${id}(ev, act) {}`);
  console.log(`// UI Setup:  function ${id}_fm_uisetup(act, data, ev) {}`);
  console.log(`// Template: <script d="t_${id}" type="text/template" title="Template for ${id}" data-info=""></script>`);
}
function t_gen(opts) {
  let act = opts.act;
  let id = act.path;
  act.name = `${id} Templated View`;
  console.log(JSON.stringify(act));
  //// WIP !!!! /////
  // ...
}
let ops = [
  {id: "grid", label: "Create Grid View", cb: g_gen},
  {id: "form", label: "Create Form View", cb: f_gen},
  {id: "tmpl", label: "Create Templated View", cb: t_gen},
];
let cliopts = [
  ["", "vid=ARG", "View id (also used in path)"],
  ["", "debug", "Turn on debugging output"],
];
if (process.argv[1].match("actgen.js")) {
  //let mcfgfn = `${process.env.HOME}/.linetboot/global.conf.json`;
  //let mcfg = require(mcfgfn);
  //init(mcfg);
  //artihub_list({});
  let app = new cliapp.cliapp(ops, cliopts, {});
  let opn = app.parse({ addself: true });
  let debug = process.env.ACTGEN_DEBUG; // || ...
  debug && console.error(process.argv);
  //if (!process.argv[3]) { app.usage("Need feature/action/op basename (e.g. 'mysys', after subcomm)"); }
  //app.opts.prompt = process.argv[3];
  debug && console.log("Opts: ", app.opts);
  if (!app.opts.vid) { app.usage(`No view id (--vid) given !`); }
  app.opts.act = { path: app.opts.vid };
  let rc  = opn.cb(app.opts);
  console.log(app.opts.act);
}
