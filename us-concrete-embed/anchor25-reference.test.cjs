'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {DEFAULTS,calculate}=require('./engine.js');

// Independent hand calculation, ACI CODE-318-25, inch-pound text.
// A 3 × 3 cast-in L-bolt group, cracked normalweight concrete, no credited
// supplementary reinforcement. The 36 kN pull acts at the group centroid,
// and the 20 kN shear acts towards +Y. No flexural eccentricity.
const sample={
  anchorType:'hooked',fc:35,fy:280,fu:420,d:16,eh:64,straight:125,
  hef:165,h:320,nx:3,ny:3,sx:110,sy:140,left:300,right:300,bottom:150,top:300,
  plateX:320,plateY:400,plateThickness:16,nu:36,mx:0,vy:20,ductile:true,mode:'elastic'
};
const expectNear=(label,got,want)=>{
  assert.ok(Number.isFinite(got)&&Math.abs(got-want)<=1e-6*Math.max(1,Math.abs(want)),
    label+': got '+got+', expected '+want);
};
test('2025 code independent benchmark for nine cast-in L-bolts',()=>{
  const r=calculate({...DEFAULTS,...sample});
  assert.equal(r.ok,true,(r.errors||[]).join(', '));
  const checks=Object.fromEntries(r.checks.map(item=>[item.id,item]));
  // Tension cone union = 715 × 677.5 mm², ANco = 245025 mm². ψed = .7+.3×150/247.5.
  // For pryout the rear-row rectangle (715 × 397.5 mm²) governs. ϕ=.75 for shear.
  // On +Y face c=320/1.5 mm after narrow-member limit; AVc/AVco=262400/204800.
  // Basic Nb=125.935314 kN and Vb=64.654332 kN using psi and inches (24 and 7/9).
  const modes={
    steelN:[4,63.3345078964],pullout:[4,19.91808],breakoutN:[36,135.57152599],
    steelV:[20/3,32.9339441061],breakoutV:[20,57.9156649196],pryout:[20,183.558381769]
  };
  for(const [id,[demand,capacity]] of Object.entries(modes)){
    assert.ok(checks[id],id);
    expectNear(id+' demand',checks[id].demand,demand);
    expectNear(id+' capacity',checks[id].capacity,capacity);
    expectNear(id+' ratio',checks[id].ratio,demand/capacity);
  }
  const interaction=(section)=>r.checks.find(row=>row.clause.includes(section));
  // 17.8.3 excludes the individual pullout resistance from group concrete interaction.
  // 17.8.4 uses 4 kN tension and 20/3 kN shear on the same back-row bolt.
  expectNear('group concrete power sum',interaction('17.8.3')?.ratio,0.27968113078);
  expectNear('individual steel power sum',interaction('17.8.4')?.ratio,0.04496481253);
  expectNear('governing shear edge demand ratio',r.utilization,0.34532971395);
});
