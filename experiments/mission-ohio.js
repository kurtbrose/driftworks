(function(){
    'use strict';
    var DW=/** @type {Required<import('../src/types').DriftworksNamespace>} */(window.Driftworks);
    /** @type {Record<string, string[]>} */
    var calls = {
    "support": [
        "Ope, let me get that fighter off you.",
        "Got your back. That's the neighborly thing.",
        "Hang tight, bud. Bringing the jumper cables.",
        "I'm on your six like salt on a county road.",
        "Scooch over a smidge. I'll take the one behind ya.",
        "Nobody gets left at the rest stop. Coming to help.",
        "Got your tail. You can pay me back in pierogies.",
        "Hold your horses. Cover's coming.",
        "I'll get this one. You get the door on the way out.",
        "Stay with me, bud. We carpooled here."
    ],
    "firing": [
        "Ope. Just gonna squeeze a few rounds past ya.",
        "Sending a little lake effect your way.",
        "Guns are hotter than a seat belt buckle in July.",
        "Little extra stadium mustard on this one.",
        "These rounds got more zip than Grippo's.",
        "Taking the shot. Tell your folks I says hi.",
        "Serving it Cincinnati style. With everything on it.",
        "Guns on. This ain't my first county fair.",
        "Here comes the salt truck, bud.",
        "Putting a little chili on that spaghetti."
    ],
    "target": [
        "Next exit: that fighter.",
        "Taking the scenic route to your six.",
        "New target. Same orange barrels.",
        "That one's wandering like a buggy on a back road.",
        "Got another one. Must be a two-for-one at Meijer.",
        "Changing lanes. Used my blinker and everything.",
        "Found the next fella holding up the left lane.",
        "Well, look what came off the turnpike.",
        "Picking up that one past the water tower.",
        "New contact. Looks like trouble in sensible shoes."
    ],
    "attack": [
        "Welcome to the turnpike. Exact change only.",
        "Coming in hot like a stadium mustard packet.",
        "You've had the passing lane long enough, bud.",
        "Gonna ride your bumper all the way to Toledo.",
        "Coming around faster than a Cedar Point coaster.",
        "I'm on ya like humidity in a church basement.",
        "This lane ends right here, pal.",
        "Time to find out if your warranty covers Ohio.",
        "Here comes the part they don't put on the welcome sign.",
        "Hate to be a bother. Gonna shoot at ya now."
    ],
    "evade": [
        "Ope! Little help over here! Cover me!",
        "This is worse than orange barrel season! Need a hand!",
        "Got a fella on my tail like a state trooper. Cover me!",
        "I'm getting rattled like a shopping cart at Marc's! Need a hand!",
        "More holes than the road after the thaw! Cover me!",
        "This guy's closer than family at a fish fry. Need a hand!",
        "Ope, ope, ope! Get this fighter off me!",
        "I'm sliding around like black ice on I-seventy-one. Cover me!",
        "Bud, I'm getting worked like a snowblower in February! Cover me!",
        "Need a hand! This one's stuck to me like lake-effect snow!"
    ],
    "break": [
        "Just gonna scooch right out of here.",
        "Taking the next exit!",
        "Welp. Gonna head out.",
        "Ope. This is my turn. Breaking off!",
        "Making like a pothole. Opening up some space.",
        "Backing out like Dad with the boat trailer.",
        "Got a little squirrely there. Pulling clear.",
        "That got spicy. And I eat Cincinnati chili.",
        "Gonna duck out before this becomes a whole thing.",
        "Heading out. For real this time. No driveway goodbye."
    ],
    "recover": [
        "Back again. Midwest goodbye took a minute.",
        "Still here. Like road construction.",
        "Had to go around the block. Back in it.",
        "Little duct tape, good as new.",
        "Shook it off like snow off a work boot.",
        "Well, that wasn't too bad. Coulda been worse.",
        "Back on the road. Salt truck's behind me.",
        "We're cooking with gas now, bud.",
        "Had a little lie-down in the corn. I'm good.",
        "Coming back like winter in the middle of April."
    ],
    "reposition": [
        "Taking the long way round the corn.",
        "Meet you by the water tower.",
        "Gonna hang a left where the old barn used to be.",
        "Taking the back roads. Less traffic.",
        "Looping around like I'm looking for parking at the fair.",
        "Just over yonder. Setting up a pass.",
        "Gonna sneak around the outside. Real neighborly-like.",
        "Taking the detour around the detour.",
        "Go past the grain elevator. If you hit space, too far.",
        "Getting situated. Takes a minute in these boots."
    ],
    "enemy": [
        "Your GPS says Ohio, hotshot. Your GPS is correct.",
        "There is no detour around Ohio.",
        "You're colder than a metal bleacher in Cleveland in January.",
        "Colder than Lake Erie in February, hotshot.",
        "That's as cold as a Browns tailgate before sunrise.",
        "Your aim's colder than a scraper left in the trunk overnight.",
        "You couldn't hit a pothole on the turnpike.",
        "I've seen faster merges behind a combine.",
        "Your flight plan's got more holes than spring pavement.",
        "Ope, hotshot. Looks like you took the wrong exit.",
        "You're about as threatening as a goose. Actually, less.",
        "All that flying and you still can't get out of Ohio.",
        "This dogfight could've been a euchre game.",
        "You fly like you're hauling a crockpot with no lid.",
        "Your guns are colder than a detached garage in Ashtabula.",
        "You're getting passed by a fella in work boots."
    ],
    "ally": [
        "If we survive, diner pie is on me.",
        "Space is just the Midwest with fewer exits.",
        "Brought enough buckeyes for everybody. The candy kind.",
        "Tell your folks I says hi. After the shooting.",
        "Welp. Could use a pop about now.",
        "We should get together sometime. I mean it this time.",
        "It's not the vacuum. It's the wind chill.",
        "I packed a casserole. Didn't know what kinda mission this was.",
        "That planet's all Ohio. Still somehow an hour from Columbus.",
        "Ope, sorry. Didn't mean to fly through your whole situation.",
        "Anybody else smell somebody's brakes?",
        "Lake-effect lasers. That's how they get ya.",
        "Cold as a folding chair at a January tailgate out here.",
        "I'm fine. Just gotta slap my knees and say welp first.",
        "This would all go smoother with a church-basement coffee.",
        "We doing euchre after this, or what?",
        "Put the leftovers in an ice cream tub. That's how you know it's home.",
        "Anybody got a scraper? My canopy's colder than a bus stop in Akron.",
        "Ope. Hang on. My good gloves are in the other ship.",
        "If ya need anything, holler. Unless it's directions out of Ohio.",
        "Came for the stars. Stayed because the ramp was closed.",
        "This weather's about as settled as a folding table at the fish fry.",
        "You don't like the space weather, give it twenty minutes.",
        "Cold as the steering wheel before the heater kicks in.",
        "Tell ya what, this beats standing in line at the BMV.",
        "Might be all Ohio, but I still brought an emergency blanket."
    ],
    "range": [
        "You are now entering Ohio. You were also previously in Ohio.",
        "Forecast: lake effect lasers.",
        "Watch for deer. Yes, even here.",
        "Road's closed. Other road's Ohio too.",
        "Bridge may ice before rest of universe.",
        "It's all Ohio. Always has been. Please drive friendly.",
        "Visibility's good. Construction for the next eternity.",
        "Keep right except to pass. That includes spacecraft.",
        "Welcome to Ohio. Mind the orange barrels.",
        "Welp. Radar says more Ohio."
    ],
    "danger": [
        "Hull is looking rough, bud. Time to head home.",
        "That hull's thinner than the ice Dad said was probably fine.",
        "Ope. She's held together with hope and road salt. Break away.",
        "You're rattling like a furnace in an old duplex. Pull clear.",
        "Bud, that's not a check-engine light you can ignore. Break off.",
        "Go on, get outta there. We'll hold the door."
    ],
    "hit": [
        "Ope! Watch the paint!",
        "Hey! I just washed this thing!",
        "That one rattled the casserole.",
        "Felt that one all the way to Toledo.",
        "Easy! This is a loaner!"
    ],
    "damaged": [
        "Ope! That's gonna need more than duct tape.",
        "Well, there goes the security deposit.",
        "Got dinged worse than a door in a grocery parking lot.",
        "Little body damage. We'll buff 'er out.",
        "That hit like a pothole full of February.",
        "She's making a noise Dad would call expensive."
    ],
    "escaped": [
        "Clear! Like the freeway during the game.",
        "Welp, that got my blood pressure going.",
        "Got out by the skin of my snow tires.",
        "I'm clear. Somebody put the kettle on.",
        "Ope. Thought I was gonna have to call my cousin with the tow truck.",
        "Still here. Stubborn as a frozen garage door."
    ],
    "missed": [
        "Aw, beans. Had that lined up.",
        "Missed by a country mile. The long kind.",
        "Ope. Just aerating the lawn out here.",
        "That shot went clear to Youngstown.",
        "Couldn't hit the broad side of the grain elevator today.",
        "Well. We'll just go around again, then."
    ],
    "confused": [
        "Hang on. Which way's the lake?",
        "Where'd everybody go? I was following the salt truck.",
        "I think I turned where the barn used to be.",
        "Now is that our Ohio or their Ohio?",
        "Directions said past the corn. It's all corn."
    ],
    "panicked": [
        "Ope, ope, ope! This is a whole thing now!",
        "They're everywhere like geese in a parking lot!",
        "This is bad. This is gas-station coffee bad!",
        "I'm fishtailing like a pickup on summer tires!",
        "Somebody get me outta this interchange!"
    ],
    "afraid": [
        "Bud, I could really use a hand here!",
        "I'm shaking like the furnace in February!",
        "This is colder than being locked out in your slippers!",
        "Don't leave me out here like a lawn chair in January!",
        "Little help! This ain't looking too good!"
    ],
    "frustrated": [
        "Oh, for crying out loud!",
        "Would ya just hold still a minute?",
        "This is taking longer than the road work on my exit!",
        "I'm about one missed shot from calling your mother!",
        "Aw, jeez. Had it lined up and everything!"
    ],
    "confident": [
        "We got this. Been through worse winters.",
        "Steady as a crockpot on the floorboard.",
        "We're doing all right, bud. All right.",
        "Keep 'er moving. Like shoveling the driveway.",
        "I didn't put on my good flannel to lose."
    ],
    "relieved": [
        "Welp. Coulda been a whole lot worse.",
        "Oh, jeez. I need to sit on the porch a minute.",
        "Still here. Like the casserole dish nobody picked up.",
        "That's better. Like taking your wet boots off.",
        "I'm clear. Somebody owes me a pop."
    ]
};
    // Named variants are templates so a different addressee does not defeat
    // shared repeat avoidance. Names are resolved from living contacts at delivery.
    /** @type {Record<string, string[]>} */
    var named = {
    "ally": [
        "Ope, sorry, {pilot}. Just gonna squeeze past ya.",
        "{pilot}, you bringing that casserole to the fish fry again?",
        "Tell your folks I says hi, {pilot}. After the shooting.",
        "{pilot}, we still doing euchre after this?",
        "Save me a seat at the diner, {pilot}.",
        "{pilot}, your good gloves are still in my ship.",
        "If we make it home, {pilot}, pie's on me.",
        "{pilot}, that's my Tupperware you've got. Keep the leftovers.",
        "You fly like you carry a crockpot with no lid, {pilot}.",
        "{pilot}, remind me to give you your jumper cables back."
    ],
    "enemy": [
        "{pilot}, I know your mother. Don't make me call her.",
        "Ope, {pilot}. Didn't know we were doing THIS at the fish fry.",
        "{pilot}, your aim's colder than a garage in Ashtabula.",
        "I've seen you park better than this, {pilot}.",
        "{pilot}, we're still on for euchre. After I shoot you down.",
        "You can keep the casserole dish, {pilot}. I'm keeping this airspace.",
        "{pilot}, quit hogging the passing lane.",
        "You missed, {pilot}. Just like the turn for the church basement."
    ],
    "evade": [
        "{pilot}, get this guy off me!",
        "Ope, {pilot}, need a hand over here!",
        "{pilot}, cover me! This fella won't take a hint.",
        "{pilot}, he's on my tail like a trooper on the turnpike!",
        "Little help, {pilot}! I still got your casserole dish!",
        "{pilot}, get this fighter off me! I'll buy the perch dinner!",
        "Cover me, {pilot}! This is worse than black ice!",
        "{pilot}, need a hand! We carpooled here!"
    ],
    "damaged": [
        "{pilot}, cover me! She's rattling like the old furnace!",
        "Ope, {pilot}, need a hand! That one went clean through!",
        "{pilot}, get this guy off me! I'm running outta duct tape!",
        "{pilot}, cover me! My check-engine light means it this time!"
    ],
    "support": [
        "I've got him, {pilot}. You just keep 'er moving.",
        "Ope, hang tight, {pilot}. I'll get this fella off ya.",
        "I'm on your attacker, {pilot}. You owe me a perch dinner.",
        "Got your back, {pilot}. Like at the fish fry.",
        "Break clear, {pilot}. I'll hold the door.",
        "I'm on him, {pilot}. Nobody gets left at the rest stop.",
        "{pilot}, I'm covering you. Don't spill that crockpot.",
        "Got him, {pilot}. Save me some pierogies."
    ],
    "acknowledgment": [
        "Thanks, {pilot}. Fish fry's on me.",
        "Copy, {pilot}. Staying on the move.",
        "You saved my bacon, {pilot}. The good thick-cut stuff.",
        "Thanks, {pilot}. I'll bring your Tupperware back.",
        "All right, {pilot}. Owe ya one.",
        "Thanks, {pilot}. Your folks raised you right.",
        "Copy that, {pilot}. Coffee's on me.",
        "Much obliged, {pilot}. I'll get the door next time."
    ],
    "emotionalReply": [
        "Breathe, {pilot}. Like we practiced before the euchre tournament.",
        "Still here with ya, {pilot}. One fella at a time.",
        "{pilot}, you got through that blizzard. You'll get through this.",
        "Easy, {pilot}. We'll make it back for the fish fry.",
        "You're all right, {pilot}. Follow my voice.",
        "{pilot}, hang in there. Your folks are counting on us."
    ],
    "recover": [
        "Back in it, {pilot}. Had to say goodbye to everybody first.",
        "Still here, {pilot}. Like orange barrels.",
        "Coming around, {pilot}. Save me a dance.",
        "I'm clear, {pilot}. Put the kettle on.",
        "Back on your wing, {pilot}. Little duct tape did the trick.",
        "{pilot}, you ain't getting rid of me that easy."
    ],
    "reposition": [
        "Ope, sorry, {pilot}. Just scooching around ya.",
        "Taking the back roads, {pilot}. Meet ya by the water tower.",
        "{pilot}, I'm going around where the old barn used to be.",
        "Give me a smidge of room, {pilot}.",
        "Coming around the outside, {pilot}. Used my blinker.",
        "{pilot}, I'll meet ya past the grain elevator."
    ],
    "break": [
        "Breaking off, {pilot}. This is my exit!",
        "Welp, {pilot}, gonna head out. For real this time.",
        "Cover me, {pilot}. Got a little squirrely there.",
        "{pilot}, I'm taking the detour around the detour."
    ],
    "firing": [
        "Watch your elbows, {pilot}. Sending a few rounds past ya.",
        "{pilot}, putting a little stadium mustard on this one.",
        "Taking the shot, {pilot}. Hold my pop.",
        "Here comes the salt truck, {pilot}."
    ],
    "attack": [
        "Keep him busy, {pilot}. I'm coming round.",
        "{pilot}, time to show this fella how we merge.",
        "Going in, {pilot}. Keep the coffee warm.",
        "{pilot}, I didn't wear my good flannel to lose."
    ],
    "near": [
        "{pilot}, that about took my earflaps off!",
        "Ope, {pilot}. Little close for church clothes.",
        "{pilot}, I felt that one in my good knee.",
        "Almost needed clean long johns there, {pilot}."
    ],
    "missed": [
        "Aw, beans, {pilot}. Had that lined up.",
        "{pilot}, pretend ya didn't see that.",
        "Missed by a country mile, {pilot}. The long kind.",
        "{pilot}, that shot went clear to Youngstown."
    ],
    "afraid": [
        "{pilot}, need a hand here, bud!",
        "Don't leave me out here, {pilot}!",
        "{pilot}, get this guy off me!"
    ],
    "panicked": [
        "{pilot}, cover me! This is a whole thing now!",
        "Ope, {pilot}! Need a hand! They're everywhere!",
        "{pilot}, get this fighter off me! Please!"
    ],
    "confused": [
        "{pilot}, which way's the lake?",
        "{pilot}, are we past the barn or before the barn?",
        "Hang on, {pilot}. Is that our Ohio or their Ohio?"
    ],
    "relieved": [
        "Still here, {pilot}. Coulda been worse.",
        "Welp, {pilot}. I need to sit on the porch a minute.",
        "{pilot}, somebody owes us a pop.",
        "Made it, {pilot}. Like the old snowblower. Stubborn."
    ]
};

    DW.flightMissions.define('ohio',{
        asteroidBulk:[0.85,0.15,0,0],
        title:'Ohio / Always has been / Driftworks',heading:'DRIFTWORKS / OHIO',subtitle:'Ford Folks vs. Chevy Crew',
        hint:'Wait for the radio reveal. Then welcome to Ohio. / Ford Folks vs. Chevy Crew',
        units:{distanceScale:1/.9144,distanceLabel:'yd',distanceWord:'yards',speedScale:3600/1609.344,speedLabel:'mph',speedWord:'miles per hour',radarKilometers:false},
        teams:{ally:{status:'Ford Folks',target:'Ford Folks',radio:'Ford Folks'},enemy:{status:'Chevy Crew',target:'Chevy Crew',radio:'Chevy Crew'}},
        comms:{calls:calls,named:named,friendlyAddress:['bud','neighbor'],hostileAddress:['hotshot'],ambientCast:true},
        portraits:{folder:'ohio',cast:'ohio'},
        sky:{kind:'landmarks',features:[{asset:'ohio-planet-v1.png',yaw:90,pitch:4,roll:0,widthDeg:44,gain:1},{asset:'features/warm-sun-v1.png',yaw:225,pitch:30,roll:0,widthDeg:7,gain:1}]},
        scenery:[{kind:'highway-sign',asset:'../assets/backgrounds/ohio-highway-sign.svg'},
            {kind:'roadside',scale:1/3,anchor:[0,-300],offset:[0,-350],asset:'../assets/environments/ohio-roadside-v1/catalog.json',placements:[
                {model:'Barn',x:-450,y:-420,size:340,yaw:.12},
                {model:'Silo',x:-690,y:-310,size:270,yaw:0},
                {model:'WaterTower',x:720,y:-450,size:320,yaw:0,decal:{asset:'../assets/backgrounds/ohio-state-flag.svg',centerZ:.84,radius:[.158,.145],height:.14,arc:1.8}},
                {model:'Windmill',x:-780,y:-110,size:290,yaw:.3},
                {model:'ChickenCoop',x:-100,y:-590,size:105,yaw:-.3},
                {model:'FuelStop',x:340,y:-490,size:400,yaw:0},
                {model:'Tractor',x:-450,y:-610,size:90,yaw:.4},
                {model:'Truck',x:210,y:-725,size:100,yaw:0},
                {model:'Flatbed',x:590,y:-720,size:105,yaw:.1},
                {model:'Fence',x:-680,y:-120,size:110,yaw:0},
                {model:'Fence',x:-570,y:-120,size:110,yaw:0},
                {model:'Fence',x:-460,y:-120,size:110,yaw:0},
                {model:'Fence',x:-350,y:-120,size:110,yaw:0},
                {model:'Fence',x:-740,y:-190,size:110,yaw:1.5708},
                {model:'Fence',x:-740,y:-300,size:110,yaw:1.5708},
                {model:'Fence',x:540,y:-560,size:110,yaw:0},
                {model:'Fence',x:650,y:-560,size:110,yaw:0}
            ]}],
        encounter:{count:8,reinforcements:{launchModel:'Barn',rosterSplit:8,launchSeconds:4,launchSpeed:90},craftModels:['','ohio-truck','ohio-tractor',''],immediate:true,callsigns:['Cuyahoga Cryptid','Buckeye Bandit','Lake Erie Larry','Aunt Barb','Doug','Deb','Big Dale','Marge','Turnpike Wraith','Tammy','Cousin Donnie','Sheryl','Scooter','Hocking Goblin','Uncle Rick','Joanie']},
        opening:[{text:"It's all Ohio?",speakerIndex:0,channel:'OPEN CHANNEL'},{text:'Always has been.',speakerIndex:4,channel:'OPEN CHANNEL'}]
    },'furball');
}());

