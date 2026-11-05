// Run by test-planner.cjs; uses only local and in-memory shared state.
const assert=require('assert/strict');
module.exports=async function({page,initial,JsonfileDatabase}){
 const p=page();await initial(p);
 const before=p.run('JSON.stringify(snapshot())'),rev=p.run('sync.rev');
 const recommendations=JSON.parse(p.run('JSON.stringify(ATTR.filter(a=>canPlan(a.id)).map(a=>({id:a.id,time:DETAIL[a.id]?.time??a.time})))'));
 for(const {id,time}of recommendations){
  const expected=typeof time==='string'&&time.trim()?time.trim():'待補';
  for(const pool of [false,true]){
   const markup=p.run(`dayBlock("測試","#888",${pool?-1:0},[${JSON.stringify(id)}],${pool})`);
   assert(markup.includes(`title="${p.run('esc('+JSON.stringify(expected)+')')}"`),id);
   assert(markup.includes(`<span aria-hidden="true">🕒</span> ${p.run('stayLabel(BY['+JSON.stringify(id)+'])')}`),id);
   assert.equal((markup.match(/class="stay"/g)||[]).length,1,id);
  }
 }
 p.run('renderDays();renderDays()');
 assert.equal(p.run('JSON.stringify(snapshot())'),before);
 assert.equal(p.run('sync.rev'),rev);
 assert.equal(p.run('suggestedStay(BY.canal)'),p.run('DETAIL.canal.time'));
 assert.equal(p.run('suggestedStay(BY.food_hirao)'), '30–45分（另計排隊）');
 assert.equal(p.run('suggestedStay(BY.markis)'),p.run('DETAIL.markis.time')); // Keep conditional durations in full.
 assert.equal(p.run('stayLabel(BY.canal)'), '2–3 hr');
 assert.equal(p.run('stayLabel(BY.sanriogal)'), '0.5–1 hr');
 assert.equal(p.run('stayLabel(BY.tower)'), '0.75–1.5 hr');
 assert.equal(p.run('stayLabel(BY.food_hirao)'), '0.5–0.75 hr');
 assert.equal(p.run('stayLabel(BY.food_daitoen)'), '1.5–2 hr');
 assert.equal(p.run('stayLabel(BY.markis)'), '遊玩 3–4／逛街 1.5–2 hr');
 assert.equal(p.run('stayLabel(BY.jigoku)'), '海地獄 0.75–1／7處 3–4 hr');
 assert.equal(p.run('stayLabel(BY.kinrin)'), '湖畔 0.5–0.75／含街道 1.5–2 hr');
 assert.equal(p.run('stayLabel(BY.fukair)'), '依航班安排');
 assert.equal(p.run('stayLabel({id:"test",time:"15分鐘"})'), '0.25 hr');
 assert.equal(p.run('stayLabel({id:"test",time:"20–40分鐘"})'), '0.33–0.67 hr');
 const fixture={u_stay:{zh:'自訂景點',cat:'親子景點',by:'測試',byId:'staytest',at:1}};
 p.run('setCustoms('+JSON.stringify(fixture)+');moveTo("u_stay",0);renderDays()');
 assert.match(p.els.days.innerHTML,/data-id="u_stay"[\s\S]*?aria-label="建議停留：待補。待補"/);
 p.run('moveTo("u_stay",-1);renderDays()');
 assert.match(p.els.days.innerHTML,/data-idx="-1"[\s\S]*?data-id="u_stay"[\s\S]*?建議停留：待補/);
 p.run('DETAIL.u_stay.time="  ";renderDays()');assert.equal(p.run('suggestedStay(BY.u_stay)'), '待補');
 p.run('DETAIL.u_stay.time=\'<img src=x onerror="alert(1)">\';renderDays()');
 assert(p.els.days.innerHTML.includes('title="&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"'));
 assert(!p.els.days.innerHTML.includes('<img'));
 assert.equal(p.run('suggestedStay({id:"no_detail",time:" 45分鐘 "})'),'45分鐘');
 // Existing shared snapshots still store IDs only. Viewing must not create a revision or add fields.
 const db=new JsonfileDatabase(),a=page({db,backend:'jsonfile'});await initial(a);
 a.run('moveTo("canal",0);update()');await a.run('flushPending()');
 const oldSnapshot=a.run('JSON.stringify(sync.current)'),writes=db.writes;
 const b=page({db,backend:'jsonfile'});await initial(b);
 assert.equal(b.run('JSON.stringify(sync.current)'),oldSnapshot);
 assert.equal(db.writes,writes);
 assert.match(b.els.days.innerHTML,/data-id="canal"[\s\S]*?🕒<\/span> 2–3 hr/);
 assert(b.run('S.days[0].items.includes("canal")'));
 assert(!/stay|duration/.test(b.run('JSON.stringify(snapshot())')));
 console.log(`PASS suggested stays: ${recommendations.length} built-in spots in days/pool, full notes, unknown customs, escaping, unchanged shared IDs/schema/revision`);
};
