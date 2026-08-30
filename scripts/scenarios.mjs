import { fsrs, createEmptyCard, Rating, State, generatorParameters } from 'ts-fsrs';
import { readFile } from 'node:fs/promises';
const DAY=86400000, SCHOOL_DAYS=190;
const COST={A:8,B:25,C:45,D:10};
const mapType=(t)=>({fact:'A',gpc:'A',word:'A',procedure:'B',skill:'B',concept:'C'}[t]||'C');

async function comps(id){const d=JSON.parse(await readFile(`api/curriculum/${id}.json`,'utf8'));const o=[];
 for(const s of d.subjects||[])for(const t of s.terms||[])for(const w of t.weeks||[])for(const kc of w.knowledgeComponents||[])
  o.push({id:kc.id,type:mapType(kc.type),subject:s.id});return o;}

function run({components,retention,newPerDay,reviewMinutes,steps=['5m','25m']}){
 const sch=fsrs(generatorParameters({request_retention:retention,maximum_interval:180,enable_fuzz:true,enable_short_term:true,learning_steps:steps,relearning_steps:['10m']}));
 const budget=reviewMinutes*60; const cards=new Map(); let introduced=0; const start=Date.now(); const daily=[];
 for(let d=0;d<SCHOOL_DAYS;d++){const at=new Date(start+d*DAY); let spent=0,reviews=0;
  const due=[...cards.values()].filter(c=>c.card.due<=at).map(c=>({...c,R:c.card.state===State.New?0:sch.get_retrievability(c.card,at,false)})).sort((a,b)=>a.R-b.R);
  for(const it of due){const cost=COST[it.type]; if(spent+cost>budget)break; spent+=cost; reviews++;
   const rec=Math.random()<Math.max(0.05,it.R); const sc=rec&&Math.random()<0.25;
   const r=!rec?Rating.Again:sc?Rating.Hard:(Math.random()<0.08?Rating.Easy:Rating.Good);
   const {card}=sch.next(it.card,at,r); cards.set(it.id,{...it,card});}
  let added=0;
  for(const c of components){if(added>=newPerDay)break; if(cards.has(c.id))continue;
   const {card}=sch.next(createEmptyCard(at),at,Rating.Good); cards.set(c.id,{id:c.id,type:c.type,subject:c.subject,card}); added++; introduced++;}
  daily.push({reviews,due:due.length,overflow:due.length-reviews,min:spent/60,
   mature:[...cards.values()].filter(c=>c.card.stability>=21).length,introduced});}
 return daily;}

const isaac=await comps('year10'), sophia=await comps('year7'), lily=await comps('year1');
const scen=[
 ['Isaac 5 subj, r.90, 13 new, 40min', isaac, 0.90, 13, 40],
 ['Isaac 5 subj, r.90, 14 new, 44min', isaac, 0.90, 14, 44],
 ['Sophia PROPOSED r.85, 11 new, 30min',    sophia,0.85, 11, 30],
 ['Sophia alt      r.85, 12 new, 30min',    sophia,0.85, 12, 30],
 ['Lily   PROPOSED r.85, 5 new, 10min',     lily,  0.85, 5, 10],
 ['Lily   alt      r.85, 6 new, 12min',     lily,  0.85, 6, 12],
 ['Lily   alt      r.85, 4 new, 8min',      lily,  0.85, 4, 8],
];
const rows=[];
for(const [name,components,retention,newPerDay,reviewMinutes] of scen){
 const d=run({components,retention,newPerDay,reviewMinutes});
 const e=d[d.length-1]; const l30=d.slice(-30); const avg=f=>l30.reduce((a,x)=>a+f(x),0)/l30.length;
 rows.push({scenario:name,coverage:`${Math.round(100*e.introduced/components.length)}%`,
  'rev/day':avg(x=>x.reviews).toFixed(0),'min/day':avg(x=>x.min).toFixed(0),
  'overflow/day':avg(x=>x.overflow).toFixed(0),
  'mature':e.mature,'mature%':`${Math.round(100*e.mature/Math.max(1,e.introduced))}%`});}
console.table(rows);
