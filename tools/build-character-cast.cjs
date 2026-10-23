'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base='assets/characters/quaternius-universal-base-characters/';
function compile(recipes,roster){
 const ids=new Set(),people=new Map(roster.characters.map(p=>[p.id,p]));
 return recipes.characters.map(recipe=>{
  if(ids.has(recipe.id))throw Error('Duplicate character '+recipe.id);ids.add(recipe.id);
  const person=people.get(recipe.id);if(!person)throw Error('Unknown roster identity '+recipe.id);
  if(!['male','female'].includes(recipe.head))throw Error('Unknown head '+recipe.head);
  if(!/^#[0-9a-f]{6}$/i.test(recipe.hairColor))throw Error('Invalid hair color');
  return {...person,...recipe,portrait:'assets/characters/crew-cast/portraits/portrait-'+person.runwayPortraitIndex+'.webp',headManifest:base+'runtime/packed/'+recipe.head+'-head.json',headBuffer:base+'runtime/packed/'+recipe.head+'-head.bin',skinTexture:base+'runtime/packed/'+(recipe.skin||recipe.head+'-skin')+'.webp',originalSkin:base+'runtime/packed/'+recipe.head+'-skin.webp',eyeTexture:base+'runtime/packed/eyes.webp',hairTexture:base+'runtime/packed/hair-'+(recipe.head==='male'?1:2)+'.webp',hairModel:base+'original/Hairstyles/Origin at 0/glTF (Godot)/'+recipe.hair+'.gltf'};
 });
}
function briefs(person){const identity=`${person.name}, age ${person.age}, ${person.rank}. ${person.appearance} Personality: ${person.personality}`;return {id:person.id,status:person.status,identity,
 workflow:{newCharacter:['approve identity recipe','assemble head, eyes, hair and suit','generate UV skin against fixed atlas','review front/three-quarter/profile','render neutral 3D identity reference','generate comms using that reference','review likeness and mark ready'],existingPortrait:['retain original portrait as identity reference','generate UV skin for selected base head','review 3D alongside portrait','mark ready only after likeness review']},
 comms:`For a new character use approved front and three-quarter renders of the assembled 3D identity as references. For an existing character preserve the approved original portrait identity. Create the established seven-pose comms atlas (neutral, ah, oo, blink, smile, angry, afraid), same adult identity in every frame. ${identity} Keep uniform and identity consistent. Use the existing comms template and its exact frame layout.`,
 skin:`Edit the ${person.head} source UV atlas using the approved neutral portrait as identity reference. ${identity} Preserve every UV island, eye opening, nose/lip position and neck/ear boundaries. No hair, helmet, microphone, equipment shadows or painted eyeballs. Uniform diffuse lighting. Keep side and back skin coherent. Do not change geometry or shift features. Separate eye, eyebrow and hair materials supply those parts.`,
 review:['Portrait and in-world identity recognizable as the same adult','Front, both three-quarter views, profile and rear checked','No UV seam, displaced eyes, painted equipment or stretched facial features','Comms pose atlas dimensions and frame order verified','Status remains base-template until character-specific art passes review']};}
function build(){
 const recipePath=path.join(root,'assets/characters/crew-cast/recipes.json');const recipes=JSON.parse(fs.readFileSync(recipePath,'utf8').replace(/^\uFEFF/,''));
 const roster=JSON.parse(fs.readFileSync(path.join(root,recipes.sourceRoster),'utf8'));
 const characters=compile(recipes,roster);const resources=new Set(characters.flatMap(p=>[p.portrait,p.headManifest,p.headBuffer,p.skinTexture,p.originalSkin,p.eyeTexture,p.hairTexture,p.hairModel]));
 // Include local glTF dependencies in the byte inventory.
 for(const file of [...resources].filter(p=>p.endsWith('.gltf'))){const doc=JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));for(const item of [...(doc.buffers||[])])if(item.uri&&!item.uri.startsWith('data:'))resources.add(path.posix.join(path.posix.dirname(file),item.uri));}
 const files=[...resources].sort().map(file=>{if(!fs.existsSync(path.join(root,file)))throw Error('Missing '+file);const b=fs.readFileSync(path.join(root,file));return {path:file,bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')};});
 const size=file=>fs.statSync(path.join(root,file)).size;
 const jo=characters.find(p=>p.id==='jo-mercer');
 const budget={characters:characters.length,uniqueResources:files.length,uniqueBytes:files.reduce((s,f)=>s+f.bytes,0),perCharacterExample:{id:jo.id,skinBytes:size(jo.skinTexture),portraitAtlasBytes:size(jo.portrait)},projection100:{uniqueSkinBytes:100*size(jo.skinTexture),portraitAtlasBytes:100*size(jo.portrait),note:'Arithmetic storage projection from Jo files, not 100 generated identities or a 100-actor rendering benchmark. Shared bodies/heads/hair are additional; original source assets excluded.'},files};
 const out=path.join(root,'assets/characters/crew-cast');for(const [name,value]of Object.entries({'catalog.json':{version:1,characters},'generation-briefs.json':characters.map(briefs),'budget.json':budget}))fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n');
 console.log(JSON.stringify({characters:characters.length,uniqueBytes:budget.uniqueBytes,projection100:budget.projection100}));return {characters,budget};
}
if(require.main===module)build();module.exports={compile,briefs,build};
