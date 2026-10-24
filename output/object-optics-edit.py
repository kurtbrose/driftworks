from pathlib import Path
p=Path('experiments/ellis-optics.js');s=p.read_text(encoding='utf-8');mark='    var shader=`';assert mark in s
code=r'''
    /** Same packed/bilinear radial integral used by the GPU. @param {number} b @param {number} u */
    function lookup(b,u){
        var data=table(),x=Math.max(0,Math.min(511,-Math.log(Math.max(Math.exp(-12),Math.abs(1-b)))/12*511)),y=Math.max(0,Math.min(511,u/12*511));
        var ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,channel=b<1?0:2;
        /** @param {number} dx @param {number} dy */function at(dx,dy){var i=(Math.min(511,iy+dy)*512+Math.min(511,ix+dx))*4+channel;return (data[i]*256+data[i+1])*32/65535;}
        return (at(0,0)*(1-fx)+at(1,0)*fx)*(1-fy)+(at(0,1)*(1-fx)+at(1,1)*fx)*fy;
    }
    /** Primary finite-source optical path, restricted to the existing 2a entry sphere.
     * Coordinates are metres; chart translation has no physical distance.
     * @param {number[]} eye @param {number[]} target @param {number} region @param {number} destination */
    function primary(eye,target,region,destination){
        var a=300,O=eye.map(function(v,i){return (v-[region*12000,-2000,1550][i])/a;}),T=target.map(function(v,i){return (v-[destination*12000,-2000,1550][i])/a;});
        var R=Math.max(1.000001,Math.hypot.apply(null,O)),S=Math.hypot.apply(null,T);
        if(S<1){T=T.map(function(v){return -v*(2-S)/Math.max(.000001,S);});S=2-S;destination=1-destination;}
        S=Math.max(1.000001,S);
        var n=O.map(function(v){return v/R;}),m=T.map(function(v){return v/S;}),other=region!==destination;
        var delta=T.map(function(v,i){return v-O[i];}),distance=Math.hypot.apply(null,delta);
        var straight=delta.map(function(v){return v/Math.max(.000001,distance);}),along=-O.reduce(function(sum,v,i){return sum+v*straight[i];},0),impact2=R*R-along*along;
        if(!other&&R>=2&&(along<=0||impact2>=4||distance<along-Math.sqrt(Math.max(0,4-impact2))))return {direction:straight,length:distance*a,impact:Math.sqrt(Math.max(0,impact2)),direct:true,turning:false};
        var cosine=Math.max(-1,Math.min(1,n.reduce(function(sum,v,i){return sum+v*m[i]*(other?-1:1);},0))),angle=Math.acos(cosine);
        var tangent=m.map(function(v,i){return v*(other?-1:1)-n[i]*cosine;}),tn=Math.hypot.apply(null,tangent);
        if(tn<.000001&&angle>.1)return null; // Axial caustic has no unique primary image.
        tangent=tn>.000001?tangent.map(function(v){return v/tn;}):[0,0,0];
        var E=Math.min(R,2),turning=false,outward=!other&&R<2&&S>R;
        /** @param {number} b @param {number} r */function u(b,r){var root=Math.sqrt(Math.max(1e-10,Math.abs(1-b*b))),l=Math.sqrt(Math.max(0,r*r-1));return b<1?Math.asinh(l/root):Math.acosh(Math.max(1,l/root));}
        /** @param {number} b */function entry(b){return R>2?Math.asin(Math.min(1,b/2))-Math.asin(Math.min(1,b/R)):0;}
        /** @param {number} b @param {boolean} sum */function phase(b,sum){var first=lookup(b,u(b,E)),last=lookup(b,u(b,S));return entry(b)+(sum?first+last:outward?last-first:first-last);}
        var low=0,high=.999999,decreasing=false;
        if(!other){
            high=Math.min(E,S)*(1-1e-7);
            var directLimit=R>=2&&S>=2?-1:phase(high,false);
            if(angle>directLimit){turning=true;low=1.000001;decreasing=true;if(high<=low||angle<phase(high,true))return null;}
        }
        for(var i=0;i<24;i++){var mid=(low+high)*.5,value=phase(mid,other||turning);if((value<angle)!==decreasing)low=mid;else high=mid;}
        var b=(low+high)*.5,sine=b/R,radial=(outward?1:-1)*Math.sqrt(Math.max(0,1-sine*sine));
        var direction=n.map(function(v,i){return v*radial+tangent[i]*sine;}),root=Math.sqrt(Math.max(1e-10,Math.abs(1-b*b)));
        /** @param {number} end */function arc(end){var total=0;for(var j=0;j<16;j++){var t=end*(j+.5)/16,l=root*(b<1?Math.sinh(t):Math.cosh(t));total+=Math.sqrt(1+l*l)*end/16;}return total;}
        var first=arc(u(b,E)),last=arc(u(b,S)),length=(other||turning?first+last:Math.abs(first-last));
        if(R>2)length+=Math.sqrt(Math.max(0,R*R-b*b))-Math.sqrt(Math.max(0,4-b*b));
        return {direction:direction,length:Math.max(.001,length*a),impact:b,direct:false,turning:turning};
    }
'''
s=s.replace(mark,code+mark).replace('DW.ellisOptics={table:table,integral:integral,shader:shader,size:size};','DW.ellisOptics={primary:primary,lookup:lookup,table:table,integral:integral,shader:shader,size:size};');p.write_text(s,encoding='utf-8',newline='\n')
p=Path('experiments/types.d.ts');s=p.read_text(encoding='utf-8').replace('ellisOptics:{table:','ellisOptics:{primary:(eye:number[],target:number[],region:number,destination:number)=>{direction:number[];length:number;impact:number;direct:boolean;turning:boolean}|null;lookup:(b:number,u:number)=>number;table:').replace('export type Batch = {','export type Batch = {\n    lensCenter?:number[];').replace('export type EllisDraw={region?:number;','export type EllisDraw={lensCenter?:number[];region?:number;');p.write_text(s,encoding='utf-8',newline='\n')
