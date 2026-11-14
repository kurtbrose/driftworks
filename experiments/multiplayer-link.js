/** Small, bounded WebRTC signaling helpers. No signaling or relay service is implicit. */
/** @param {RTCPeerConnection} peer @param {RTCSessionDescriptionInit} description */
export async function gather(peer,description){
  await peer.setLocalDescription(description);
  if(peer.iceGatheringState!=='complete')await new Promise(/** @param {(v:void)=>void} resolve */(resolve,reject)=>{
    const timer=setTimeout(()=>{cleanup();reject(new Error('Candidate gathering timed out. Cancel and retry, or configure ICE servers.'));},10000);
    function cleanup(){clearTimeout(timer);peer.removeEventListener('icegatheringstatechange',check);peer.removeEventListener('connectionstatechange',check);}
    function check(){
      if(peer.connectionState==='closed'){cleanup();reject(new Error('Connection closed.'));}
      else if(peer.iceGatheringState==='complete'){cleanup();resolve();}
    }
    peer.addEventListener('icegatheringstatechange',check);peer.addEventListener('connectionstatechange',check);check();
  });
  if(!peer.localDescription||peer.connectionState==='closed')throw new Error('Connection closed.');
  return {type:peer.localDescription.type,sdp:peer.localDescription.sdp};
}
/** @param {string} value @returns {RTCIceServer[]} */
export function iceServers(value){
  const raw=/** @type {unknown} */(JSON.parse(value));
  /** @param {unknown} v @returns {boolean} */const isArray=v=>Array.isArray(v);
  const list=/** @type {unknown[]} */(raw);
  if(!isArray(raw)||list.length>8)throw new Error('ICE servers must be a JSON array of up to eight servers.');
  for(const item of /** @type {unknown[]} */(raw)){
    if(!item||typeof item!=='object')throw new Error('Invalid ICE server.');
    const entry=/** @type {Record<string,unknown>} */(item);
    const urls=/** @type {unknown[]} */(isArray(entry.urls)?entry.urls:[entry.urls]);
    if(!urls.length||urls.some(url=>typeof url!=='string'||!/^turns?:|^stuns?:/.test(url)))throw new Error('ICE server URLs must use stun:, stuns:, turn: or turns:.');
    if(entry.username!==undefined&&typeof entry.username!=='string'||entry.credential!==undefined&&typeof entry.credential!=='string')throw new Error('Invalid ICE credentials.');
  }
  return /** @type {RTCIceServer[]} */(raw);
}
/** @param {string} text @param {'offer'|'answer'} type @returns {RTCSessionDescriptionInit} */
export function description(text,type){
  if(text.length>100000)throw new Error('Connection text is too large.');
  const value=/** @type {unknown} */(JSON.parse(text));
  if(!value||typeof value!=='object')throw new Error('Invalid connection text.');
  const m=/** @type {Record<string,unknown>} */(value);
  if(m.type!==type||typeof m.sdp!=='string')throw new Error('Expected a WebRTC '+type+'.');
  return {type,sdp:m.sdp};
}
/** @param {HTMLInputElement|HTMLTextAreaElement} input @param {(s:string)=>void} status */
export async function copy(input,status){
  try{await navigator.clipboard.writeText(input.value);status('Copied.');}
  catch{input.focus();input.select();status('Text selected. Press Ctrl+C to copy.');}
}
