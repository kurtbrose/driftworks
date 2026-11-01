import * as T from 'three';
import {section,hullTypes,labels} from 'aegis-kit';
import {wedge,drive,attach,bridge,turret,connector} from 'aegis-parts';
import {prepareProwVents} from 'aegis-vents';

// Inventory of the current military kit, including the pieces inside a gun bank.
export const toyParts=[
 {id:'prow-lance',code:'P01',name:'Lance prow',category:'Prows',note:'Long tapered bow from the fleet cruiser and line-combatant recipes. 333 m nominal spine length.'},
 {id:'prow-command',code:'P02',name:'Command prow',category:'Prows',note:'Shorter armored wedge used by the carrier and support recipes. 234 m nominal spine length.'},
 ...hullTypes.map((type,i)=>({id:'hull-'+type,code:'H0'+(i+1),name:labels[type],category:'Mid-hulls',type,note:{standard:'Continuous ribbed armor; accepts independent upper and lower attachments.',hangar:'Open side-to-side passage with armored roof, deck and end walls.',utility:'Exposed service tanks and a narrow equipment spine.',missile:'Armored magazine with upper and lower launch-cell cassettes. Both attachment sockets are occupied.',operations:'Through hangar with outboard flight-control galleries. The upper attachment socket is occupied.',reactor:'Utility core with external cooling panels. These exceed the ordinary hull width.',sensor:'Armored section with sensor cheeks and a built-in upper sensor mast. The upper attachment socket is occupied.'}[type]+' Standard 144 m hull pitch.'})),
 {id:'drive-standard',code:'D01',name:'Standard drive block',category:'Drives',note:'Three-drive stern, shown without the separately listed command citadel. 108 m nominal spine length.'},
 {id:'drive-heavy',code:'D02',name:'Heavy drive block',category:'Drives',note:'Five-drive stern with the same 108 m spine interface; command citadel unpacked separately.'},
 {id:'attachment-battery',code:'A01',name:'Gun battery / complete',category:'Attachments',note:'The actual gun-bank attachment: twin main battery, point-defense turret and mounting plate. A02 and A03 unpack its two weapons.'},
 {id:'attachment-main',code:'A02',name:'Twin main battery',category:'Attachments',note:'Main turret on its own. Yaw and barrel-pitch groups remain separate in the source assembly.'},
 {id:'attachment-pd',code:'A03',name:'Point-defense turret',category:'Attachments',note:'Small close-defense turret from the gun-bank attachment, shown at its actual relative size.'},
 {id:'attachment-sensor',code:'A04',name:'Sensor mast attachment',category:'Attachments',note:'Replaceable sensor package with its mounting plate. This is also used within the dedicated sensor hull.'},
 {id:'attachment-cargo',code:'A05',name:'Cargo / stores attachment',category:'Attachments',note:'Armored service-stores pod on the standard mounting plate.'},
 {id:'attachment-empty',code:'A06',name:'Empty attachment socket',category:'Attachments',note:'The bare mounting plate left when an upper or lower socket is set to None.'},
 {id:'structure-bridge',code:'S01',name:'Command citadel',category:'Structure',note:'Stepped bridge and antenna cluster, unpacked from the common stern-terminal mount.'},
 {id:'structure-coupler',code:'S02',name:'Spine coupling ring',category:'Structure',note:'Open coupling collar and its perimeter locks. Repeated by the existing hull and prow factories.'}
];
export function toyPart(id){
 const entry=toyParts.find(p=>p.id===id);if(!entry)throw new Error('Unknown toybox part: '+id);
 const root=new T.Group();root.name=entry.code+' / '+entry.name;root.userData={partId:id,units:'metres'};
 if(entry.type)root.add(section(entry.type));
 else if(id.startsWith('prow-'))wedge(root,id==='prow-lance'?37:26);
 else if(id.startsWith('drive-'))drive(root,id==='drive-heavy');
 else if(id==='attachment-main')turret(root,0,0,0);
 else if(id==='attachment-pd')turret(root,0,0,0,true);
 else if(id.startsWith('attachment-')){
  const mounting=new T.Group();mounting.position.y=-4.03;root.add(mounting);
  attach(mounting,{battery:'turret',sensor:'sensor',cargo:'cargo',empty:'none'}[id.slice(11)],1,0,false);
 }else if(id==='structure-bridge'){
  const mounting=new T.Group();mounting.position.set(-3.5,-4,0);root.add(mounting);bridge(mounting);
 }else connector(root,0);
 if(id==='prow-lance')prepareProwVents(root);
 root.scale.setScalar(9);return root;
}
export function toybox(columns=4){
 columns=Math.max(1,Math.min(6,Math.round(columns)||4));
 const root=new T.Group();root.name='Aegis toybox';root.userData.units='metres';
 toyParts.forEach((entry,i)=>{const part=toyPart(entry.id);part.position.set((i%columns)*420,0,Math.floor(i/columns)*380);root.add(part);});return root;
}
