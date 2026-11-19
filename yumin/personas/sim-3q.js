#!/usr/bin/env node
/* 11/18 결정안(축당 3문항, 2표 먼저 얻으면 종료)을 가상 페르소나로 계산만 해서 돌린다(브라우저 없음).
   응답 모델은 run-virtual-test.js의 p0와 같다. 실제 사람의 응답이 아니라 가정이다.
   실행: node yumin/personas/sim-3q.js [반복 횟수, 기본 20] */
const fs=require('fs'),path=require('path');
const personas=JSON.parse(fs.readFileSync(path.join(__dirname,'personas.json'),'utf8')).personas;
function rng(seed){let a=seed>>>0;return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
function p0(p,axis){const a=p.axes[axis];const f=['B','R','W','D','C'].indexOf(a.pole)>=0;let q=f?a.strength:1-a.strength;
 if(axis>=3&&p.desirability)q=q+p.desirability*(1-q);if(p.carelessness)q=q*(1-p.carelessness)+.5*p.carelessness;return q;}
const LET=[['B','Q'],['R','V'],['W','H'],['D','L'],['C','N']];
function run3(p,rand,max,need){let q=0;const code=[],bd=[];
 for(let a=0;a<5;a++){let A=0,B=0;for(let i=0;i<max;i++){if(A>=need||B>=need)break;q++;if(rand()<p0(p,a))A++;else B++;}
  code.push(A>B?LET[a][0]:LET[a][1]);bd.push(Math.min(A,B)>=need-1&&A+B==max);}
 return {code:code.join(''),q,bd:bd.filter(Boolean).length};}
const REP=+process.argv[2]||20;
function stat(max,need){let n=0,ex=0,ax=0,same=0,axsame=0,q=0,bd=0;
 personas.forEach((p,pi)=>{for(let r=0;r<REP;r++){const a=run3(p,rng(pi*7919+r*104729+1),max,need),b=run3(p,rng(pi*7919+r*104729+99991),max,need);
  n++;q+=a.q;bd+=a.bd;ex+=a.code===p.trueType?1:0;for(let i=0;i<5;i++)ax+=a.code[i]===p.trueType[i]?1:0;same+=a.code===b.code?1:0;for(let i=0;i<5;i++)axsame+=a.code[i]===b.code[i]?1:0;}});
 const f=x=>(100*x).toFixed(0)+'%';
 return `| ${max}문항, ${need}표 종료 | ${(q/n).toFixed(1)} | ${f(ex/n)} | ${f(ax/n/5)} | ${f(same/n)} | ${f(axsame/n/5)} | ${(bd/n).toFixed(1)} |`;}
console.log('| 방식 | 평균 질문 수 | 의도한 유형과 일치 | 축별 일치 | 두 번 해서 같은 유형 | 축별 재현 | 경계 축 평균 |\n|---|---|---|---|---|---|---|');
console.log(stat(3,2));console.log(stat(5,3));
