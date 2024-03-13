// # Data Populator with support for many mixed file formats
// 
// Combine data files in misc. formats to to a larger data structure by "hint
// directives" (and callbacks) on how to do the assembly.
// 
// ## Configuration
// 
// The configuration is loaded (by require()) from a javascript (Note: **Not JSON**) file. The "assembly instructions" given in config as
// callbacks cannot be reasonabley (w/o hacks) be given in JSON data file, thus requirement for JS. The file should have an interface of
// Node.JS module are return configg in module.exports.
//
// Configuration contains the following information
// - The files (source ingredients / bill of materials) for building (assembling) the bigger data structure
// - The instructions of building / assembling the combined data structure out of the source material ("building blocks)
//   - The instructions are given as callbacks that instruct how to combine / connect the pieces together.
//   - Often the same end result can be accomplished in multiple ways
// - Singular root node of the data structure (Singular menas there can be only one unambiguous root note)
// 
// Configuration for data items is given in an AoO (Array of Objects) with each object containing members:
// - fname (str) - filename for the datafile (of supported format and suffix)
// - root (bool) - This (thuthy/falsy) flag indicates this (object) data should become the root of the data structure when datasets are
//   combined (the datapop keeps track of this for post-processors to use it). Only one dataset should be flagged as (unambiguous) root.
//   Also note that this root should be (likely - ?) an object (instead of e.g. AoO).
// - datasel - Dot-notation data selector instruction (e.g. "items") to use data branch other than local root as data. Note: currently
//   max 3 data path components are supported (e.g. `datasel: "kids.son1.weight"` <= 3 dot-notation components)
// - pp1 (callback) - post processor 1 (first pass)
// - pp2 (callback) - post processor 1 (second pass)
// - Misc format-variant specific options (mainly for CSV, TSV)
//   - sep - separator pattern (aka delimiter) for CSV-style file, e.g. /\t/ for TSV (tab separated values) parsed with CSV parser
// ## Post processors
// 
// Post processors are applied after the file is parsed as isolated unit with parser. The differences between first (pp1) and second (pp2) pass/phase processors are:
// - The first phase processor can assume that all the files preceding it are parsed and use those for building / asembling the final data structure.
// - The second phase processor can assume all the files have been parsed and use any of those for ...
// ## Code Examples
// See code flow example on the bottom of module.
// ## Using DB data (fetched with async DB APIs
// TODO: Explain how to set dm.data by DB queries and calling populate(dp) after.
// ## TODO
// - Possibly allow async parser APIs and use async.NNNseries() to run
//   parsing and postprocessing (e.g. DB interfaces would require this) ??
// - Allow config to have holistic pp gotten from (js) config. NOTE: Needs a change to config API !!!
// - Give an example of associating child by either pp2 of parent or pp1 of child
// - Provide example config and example data.
// - Allow string syntax for simple / trivial (frequently encountered) building/assembly scenarios ???
var path = require("path");
var fs   = require("fs");
// Load parsers for various formats (YAML, properties, CSV)
var pp = require("properties-parser");
var yaml  = require('js-yaml');
// Note: this parser is synchronous, which is current requirement.
var hlr = require("./hostloader.js"); // For csv_parse()
// Note: These CSV parsers work in async modes. We initially try to keep
// all the parsing and processing as simple
//var csvp = require("csv-parse"); // Also csv-parser (w. 1 dep)

//////////////// File format Parsers ////////////////
function jload(fn) {
  var cont = fs.readFileSync(fn, 'utf8');
  return JSON.parse(cont);
}

function cload(fn, opts) {
  // var cont = fs.readFileSync(fn, 'utf8');
  var copts = {sep: /,/}
  if (opts.sep) { copts.sep = opts.sep; }
  //if (opts.flds) { copts.sep = opts.flds; }
  if (opts.sloppy) { copts.sloppy = opts.sloppy; }
  var d = hlr.csv_parse(fn, copts);
  return d;
}

function yload(fn) {
  var cont = fs.readFileSync(fn, 'utf8');
  var d = yaml.safeLoad(cont);
  // Object.keys(d).forEach((k) => { console.log(k); }) // DEBUG
  return d;
}

function pload(fn) {
  var cont = fs.readFileSync(fn, 'utf8');
  var d = pp.parse(cont)
  // console.log("pload:", d);
  return d;
}
var suffhdlr = {
  "json": {hdlr: jload},
  "csv":  {hdlr: cload,},
  "tsv":  {hdlr: cload, sep:/\t/},
  "yaml": {hdlr: yload,},
  "yml":  {hdlr: yload,},
  "properties":  {hdlr: pload,},
};

// Access data of ... (by name ?)
function getdata(num) {
  // By data set id (dsid, must be present for item to be able to refer to it)
  if (typeof num == 'string') { var d = datamods.find( (e) => { return e.dsid == num; }); return d; }
  // By numeric index
  return datamods[num].data;
}
// OLD/TEST: var root = {};
/** */
function init(datamods) {
  var rootcnt = 0;
  // Try extract type out of the suffix
  datamods.forEach((dm) => {
    // Extract (hopefully supported) suffix and lookup (parsing) handler for it
    var sm = dm.fname.match(/\.(\w+)$/); // Suff. match
    if (sm && suffhdlr[sm[1]]) { dm.ftype = sm[1]; dm.loader = suffhdlr[dm.ftype].hdlr; }
    else { console.error("No supported suffix/parse-handler found for "+dm.fname); return; }
    /*
    if (dm.fname.match(/\.csv$/))             { dm.ftype = "csv"; dm.loader = cload; }
    else if (dm.fname.match(/\.(yml|yaml)$/)) { dm.ftype = "yaml"; dm.loader = yload; }
    else if (dm.fname.match(/\.json$/))       { dm.ftype = "json"; dm.loader = jload; }
    else if (dm.fname.match(/\.properties$/)) { dm.ftype = "props"; dm.loader = pload; }
    */
    //dm.fn = dm.fname;
    if (dm.root) { rootcnt++; }
    if (dm.datasel) { dm.dataselpath = dm.datasel.split(/\./); }
  });
  if (rootcnt > 1) { throw "Root count > 1, ambiguous"; }
  if (rootcnt < 1) { console.error("Warning root data set not defined."); }
  var o = { root: {}, files: datamods };
  return o;
}

function populate(o) {
  var datamods = o.files;
  datamods.forEach((dm) => {
    if (!dm.loader) { throw "No loader for "+ dm.fname; }
    // Note: Support for e.g. DB sourced data - dm.data may already be there
    
    if (!dm.data) {
      var d = dm.loader(dm.fname, dm);
      dm.data = d;
    }
    // Select "data branch" other than the local root. TODO: create wrapper to support deeper dot-notation access
    // Check if (typeof dm.data == 'object')
    var dsp = dm.dataselpath;
    if (dsp && dsp.length != 0) {
      if      (dsp.length == 1) { dm.data = dm.data[ dsp[0] ]; }
      else if (dsp.length == 2) { dm.data = dm.data[ dsp[0] ][ dsp[1] ]; }
      else if (dsp.length == 3) { dm.data = dm.data[ dsp[0] ][ dsp[1] ][ dsp[2] ]; }
    }
    if (dm.root) { o.root = dm.data; }
    // console.log("OUTPUT "+dm.fname+": ", dm.data);
    if (dm.pp) { dm.pp(dm.data, o); }
  });
  // 2nd pass
  datamods.forEach((dm) => {
    var d = dm.data;
    if (dm.pp2) { dm.pp2(d, o); }
  });
  return o.root;
}

module.exports = {init: init, populate: populate};
if (process.argv[1].match(/datapop.js$/)) {
  var datapop = module.exports; // Use name of module as namespace
  var acnt = process.argv.length;
  if (acnt < 3) { console.log("No population config passed "+acnt); process.exit(1); }
  var cfn = process.argv[2];
  var datamods = require(cfn);
  // Initialize datapop w. statin in dp
  var dp   = datapop.init(datamods);
  // Run population
  var root = datapop.populate(dp);
  // Use assembled / combined data structure. Here: Output as JSON
  console.log( JSON.stringify(root, null, 2) );
  // In case of Webapp (e.g.): res.json(root); OR res.json({status: "ok", data: root});
}
