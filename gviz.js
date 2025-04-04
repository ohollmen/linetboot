/** @file gviz.js
* Help create the repetitive parts of Graphviz (di)grahs the easy way.
* TODO:
* - Decide if should collect to a domain specific (graphiz/digraph) specific intermediate structure
* and serialize at the end OR output-on-the-fly (return generated strings) OR have both supported ?
* - The benefit of intermediate-structure approach would be applicability to any graphing app (e.g. vis.js)
*   - Choos "universal" useful attrs (e.g. id,name,color other decoration (optional des, font size for name/desc, layout)?)
* - Implement configurable attribute mappings (e.g. name attr, id attr and hold in a struct)
*/
// Example digraph config / mapping. Does this need to be passed on-thefly case-by-case ?
// Note: There may be arbitrary # of levels in the complete
let dgm = {
  idattr: "id",
  nameattr: "name",
  // Names and id:s in related ents ?
};

let t_ch = [{id: "Aretha", parid: "daddy"}, {id: "William", parid: "daddy"}, {id: "Seth", parid: "daddy"}];
let t_par = [{id: "daddy"}];

function dig_nodes(c, aoo1, aoo2) {
  let arr_all = aoo1.concat(aoo2);
  console.log(`  // Nodes (participating graph)`);
  // TODO: Possibly do separately as parent and children may have completely different attrs/structure
  arr_all.forEach( (n) => { console.log(`  ${n.id} [color="0.650 0.700 0.700"];`); });
}
// Find parent attr in child ents, link `parent -> child`
// config c must have: chida, parida, parlinka
// Note: 2 arrays passed may be same for self-parented relationship
function dig_links(c, aoo1, aoo2) {
  let idx = {};
  // Make sure all attr mappings exist
  if (!c.chida) { console.error(`Child id attr missing !`); return null; }
  if (!c.parida) { console.error(`Parent id attr missing !`); return null; }
  if (!c.parlinka) { console.error(`Child-o-parent link attr missing !`); return null; }
  // Make some defaulting-expansion (e.g. when shard idattr, set explicitly as paridattr, childidattr)
  aoo1.forEach( (n) => { idx[n[c.parida]] = n; }); // Index parents
  let cont = ""; // Direct-content ?
  console.log(`  // Links / transitions`);
  aoo2.forEach( (n) => {
    let id = n[c.chida];
    if (!id) { console.error(`ERROR: No child id value found (for attr ${c.chida}) - skipping ...`); return; }
    let parid = n[c.parlinka];
    let pn = idx[parid];
    if (!pn) { console.error(`ERROR: No parent node (by ${parid}) found for a child (id: ${id}) - skipping ...`); return; }
    console.log(`  ${pn[c.parida]} -> ${id};`);
  });
}

if (process.argv[1].match("gviz.js")) {
  //console.log(`For now: use as lib only!`);
  console.log(`digraph prof {`);
  let cfg = {parida: "id", chida: "id", parlinka: "parid"};
  dig_links(cfg, t_par, t_ch);
  dig_nodes(cfg, t_par, t_ch);
  console.log(`}`)
}
