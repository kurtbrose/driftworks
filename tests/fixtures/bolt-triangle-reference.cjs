'use strict';
// Original allocating sweep retained solely as a correctness oracle.
const dot3=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const minus=(a,b)=>a.map((v,i)=>v-b[i]);
const cross3=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function normal(a,b,c){const n=cross3(minus(b,a),minus(c,a)),l=Math.hypot(...n)||1;return n.map(v=>v/l);}
module.exports=function boltTriangle(a, d, tri, r) {
        var n = normal(tri[0],tri[1],tri[2]);
        var best = /** @type {{fraction:number; local:Vector; normal:Vector} | null} */ (null);
        /** @param {number} t @param {Vector} contact */
        function accept(t, contact) {
            if (t >= 0 && t <= 1 && (!best || t < best.fraction)) best = {fraction:t,local:contact,normal:n};
        }
        /** First entry into a sphere/cylinder in a projected coordinate frame.
         * @param {Vector} offset @param {Vector} motion @returns {number | null} */
        function entry(offset, motion) {
            var c=dot3(offset,offset)-r*r;
            if(c<=0) return 0;
            var aa=dot3(motion,motion), b=dot3(offset,motion), disc=b*b-aa*c;
            if(aa<1e-15 || disc<0) return null;
            var t=(-b-Math.sqrt(disc))/aa;
            return t>=0 && t<=1 ? t : null;
        }
        var e=minus(tri[1],tri[0]), f=minus(tri[2],tri[0]);
        var ee=dot3(e,e), ef=dot3(e,f), ff=dot3(f,f), denom=ee*ff-ef*ef;
        var offset=minus(a,tri[0]), height=dot3(offset,n), speed=dot3(d,n);
        if(denom>1e-15) [-r,r].forEach(function(side){
            var t=Math.abs(height)<=r ? 0 : Math.abs(speed)>1e-15 ? (side-height)/speed : -1;
            if(t<0 || t>1) return;
            var center=a.map(function(x,j){return x+d[j]*t;}), h=dot3(minus(center,tri[0]),n);
            var contact=center.map(function(x,j){return x-n[j]*h;}), v=minus(contact,tri[0]);
            var ve=dot3(v,e), vf=dot3(v,f), u=(ve*ff-vf*ef)/denom, w=(vf*ee-ve*ef)/denom;
            if(u>=-1e-9 && w>=-1e-9 && u+w<=1+1e-9) accept(t,contact);
        });
        tri.forEach(function(p,index){
            var vertex=entry(minus(a,p),d);
            if(vertex!==null) accept(vertex,p);
            var edge=minus(tri[(index+1)%3],p), length=dot3(edge,edge);
            if(length<1e-15) return;
            var v=minus(a,p), along=dot3(v,edge)/length, rate=dot3(d,edge)/length;
            var t=entry(v.map(function(x,j){return x-edge[j]*along;}),d.map(function(x,j){return x-edge[j]*rate;}));
            if(t===null) return;
            var u=along+rate*t;
            if(u>=0 && u<=1) accept(t,p.map(function(x,j){return x+edge[j]*u;}));
        });
        return best;
    };
