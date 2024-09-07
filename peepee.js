/*
To-do: add time machine block, buttons, doors, pressure plates, timed objects, add dying/spawn
*/
const socket = io("ws://127.0.0.1:3000/");
const app = new PIXI.Application({ antialias: true });
const loader = new PIXI.Loader();
document.body.appendChild(app.view);
const g = new PIXI.Graphics();

app.ticker.add(delta => gameLoop(delta));
app.stage.addChild(g);

var actionQueue=[];
var host=false;

var ready = false;
var rerolls=2;
var round=21;


var SQUARE = 50;

var inventory=["bandana"];
socket.on("add to inventory", (item)=> {
	if (gameState="equipment") {
		inventory.push(item);
	}
});
socket.on("equip",(id,index,itemIndex)=> {

	if (gameState="inventory") {
		getDice(id,index).equipment.push(inventory[itemIndex]);
		inventory.splice(itemIndex,1);
			processEquipment();
			updateText();
	}
});
function processEquipment() {
	for (var i in dice) {
		for (var j in dice[i]) {
			var tempEquipment = structuredClone(dice[i][j].equipment);
			resetDie(i,j);
			dice[i][j].equipment=tempEquipment;
			for (var k in dice[i][j].equipment) {
				switch (dice[i][j].equipment[k]) {
					case "leather vest":
						dice[i][j].maxHp++;
						dice[i][j].hp++;
						break;
					case "wolf ears":
						dice[i][j].maxHp=6;
						dice[i][j].hp=6;
						break;
					case "rusty plate":
					case "chainmail":
						dice[i][j].maxHp+=3;
						dice[i][j].hp+=3;
						break;
					case "iron helm":
						dice[i][j].maxHp+=6;
						dice[i][j].hp+=6;
						break;
					case "scar":
						dice[i][j].maxHp+=5;
						dice[i][j].hp+=5;
						dice[i][j].emptyHp+=5;
						break;
					case "whiskey":
						dice[i][j].maxHp+=9;
						dice[i][j].hp+=9;
						dice[i][j].emptyHp+=6;
						break;
					case "enchanted shield":
						dice[i][j].autoblock++;
						break;
					case "troll nose":
						dice[i][j].regen++;
						break;
					case "troll blood":
						dice[i][j].regen+=2;
						break;
					case "learn flare":
						dice[i][j].equipmentSpells.push(getSpellByName("flare"),i,j);
						break;
				}
			}
			adjustDeathHp(i,j);
		}
	}
}
function getSpellByName(name,id,index) {
	var temp = structuredClone(spellTemplate);
	switch (name) {
		case "flare":
			temp.costType = "mana";
			temp.cost = 4;
			break;
		case "formation":
			temp.costType = "captain";
			break;
		case "parry":
			temp.costType = "damage";
			temp.cost = 2;
			break;
		case "unite":
			temp.costType = "prince";
			break;
		case "clink":
			temp.costType = "mana";
			temp.cost = 4;
			temp.keywords = ["singleCast"];
			break;
		case "light":
			temp.costType = "mana";
			temp.cost = 1;
			temp.keywords = ["singleCast"];
			break;
		case "else":
			temp.costType = "blank";
			temp.cost=1;
			break;
	}
	temp.name=name;
	temp.userId = id;
	temp.userIndex = index;
	return temp;
}
socket.on("unequip",(id,index,itemIndex)=> {
	console.log("unequip"+index);
	//if (gameState=="inventory") {
		inventory.push(getDice(id,index).equipment[itemIndex]);
		getDice(id,index).equipment.splice(itemIndex,1);
		processEquipment();
		updateText();
	//}
	
});
function unequip(index) {
	console.log("unequip"+index);
	for (var i in getDice(playerId,index).equipment) {
		socket.emit("unequip",playerId,index,0);
	}
}
socket.on("spell",(userId,index,targetId,targetIndex)=> {
	if (!spellUsable(userId,index)) {
		console.log("USER IS DEAD");
		return;
	}
	var name = spells[userId][index].name;
	var costType = spells[userId][index].costType;
	var cost = spells[userId][index].cost;

	if (costAvailable(userId,costType,cost)) {
		document.getElementById("history").innerHTML+="<b>Player "+(parseInt(userId)+1)+"</b> used <b>"+spells[userId][index].name+"</b> on ";
		if (targetId!=-2) {
			document.getElementById("history").innerHTML+="<b>Player "+(parseInt(targetId)+1)+"'s</b> "
		} else {
			document.getElementById("history").innerHTML+="enemy ";
		}
		document.getElementById("history").innerHTML+="<b>"+getDice(targetId,targetIndex).name+" ("+targetIndex+")</b><br />";
		actionQueue.push([userId,index,targetId,targetIndex,false,true]);
		processQueue();
		reposition();
	}
});
socket.on("action",(userId,userIndex,targetId,targetIndex,cantrip) => {
	console.log("adding action from "+userId+" "+userIndex+" to "+targetId+" "+targetIndex);
	console.log('cantrip' + cantrip);
	if (gameState=="ingame") {
		var user = getDice(userId,userIndex);
		var target = getDice(targetId,targetIndex);
		if (target.dead) {
			console.log("TARGET IS DEAD");
			return;
		}
		if (!user.used&&gameState=="ingame") {
			document.getElementById("history").innerHTML+="<b>Player "+(parseInt(userId)+1)+"</b> used their <b>"+getDice(userId,userIndex).name+" ("+userIndex+")</b> on ";
			if (targetId!=-2) {
				document.getElementById("history").innerHTML+="<b>Player "+(parseInt(targetId)+1)+"'s</b> "
			} else {
				document.getElementById("history").innerHTML+="enemy ";
			}
			document.getElementById("history").innerHTML+="<b>"+getDice(targetId,targetIndex).name+" ("+targetIndex+")</b><br />";
			actionQueue.push([userId,userIndex,targetId,targetIndex,cantrip,false]);
			processQueue();
			reposition();
			//updateText();
		}
	}
});
var connected=false;
socket.on("id",(id)=>{
	playerId=id;
});
socket.on("host", ()=> {
	host=true;
});
function getRandomTarget(face) { //as player
	var type = face[0];
	var pips = face[1];
	var keywords = face[2];
	type = type.split(" ")[0];
	switch (type) {
		case "defend":
		case "heal":
		case "reuse":
		case "inflict":
		case "defendheal":
		case "undying":
			var randId = randomAlivePlayer();
			return [randId,randomAliveDiceIndex(randId)];
		case "attack":
		case "stun":
		default:
			return [-2,randomAliveEnemyIndex()];
	}
}
function randomAliveEnemyIndex() {
	var aliveIndices = [];
	for (var i in enemies) {
		if (!enemies[i].dead) {
			aliveIndices.push(i);
		}
	}
	if (aliveIndices.length==0) {
		return -1;
	}
	return aliveIndices[Math.floor(Math.random()*aliveIndices.length)];
}

function randomAlivePlayer() {
	var aliveIndices=[];
	for (var i in dice) {
		var allDead = true;
		for (var j in dice[i]) {
			if (!dice[i][j].dead) {
				allDead=false;
			}
		}
		if (!allDead) {
			aliveIndices.push(i);
		}
	}
	if (aliveIndices.length==0) {
		return -1;
	}
	return aliveIndices[Math.floor(Math.random()*aliveIndices.length)];
}
function randomAliveDiceIndex(id) {
	var aliveIndices=[];
	for (var i in dice[id]) {
		if (!dice[id][i].dead) {
			aliveIndices.push(i);
		}
	}
	if (aliveIndices.length==0) {
		return -1;
	}
	return aliveIndices[Math.floor(Math.random()*aliveIndices.length)];
}
socket.on("roll",(id,rolls)=> {
	var cantripQueue=[];
	for (var i in rolls) {
		var index = rolls[i][0];
		var side = rolls[i][1];

		console.log(id+" "+index+" rolled side "+side)
		if(!locked&&gameState=="ingame") {
			var owner = getDice(id,index);
			owner.side = side;

			//rolledDice[id][index][0]=type;
			//rolledDice[id][index][1]=num;

			//cantrip
			var tempFace = getFace(id,index,side);
			var keywords = tempFace[2];
			if (keywords.includes("cantrip")) {
				if (host) {
					//var [targetId,targetIndex] = getRandomTarget(tempFace);
					cantripQueue.push([id,index]);
				}
			}
		}
	}
	console.log("backupping after roll");
	backup();
	if (host) {
		processCantrips(cantripQueue);
	}
	//if (host) {
		
	//}
});
socket.on("lock",()=> {
	locked=true;
	lockedText.alpha=0;
	/*for (var i in ownedDice) {
		previousDice[i]=structuredClone(ownedDice[i]);
	}*/
	backup();
	//backupDice();
	/*for (var i in dice) {
		for (var j in dice[i]) {
			initialDice[i][j]=structuredClone(dice[i][j]);
		}
	}*/
});
socket.on("enemy roll",(enemy,side) => {
	if (!host) {
		enemies[enemy].side=side;
	}
});
socket.on("enemy target",(enemy,targetId,targetIndex) => {
	console.log(targetId + " " + targetIndex);
	if (!host) {
		enemies[enemy].targets.push([parseInt(targetId),parseInt(targetIndex)]);
	}
});
socket.on("reset enemy", () => {
	enemies=[];
});
var fightTemplate = {
	hp:7,
	maxHp:7,
	dice: [["attack",4,[]],["attack",4,[]],["attack",4,[]],["attack",4,[]],["outer",2,[]],["outer",2,[]]],
	block:0,
	x:0,
	y:0,
	position:0,
	width:SQUARE,
	height:SQUARE,
	poison:0,
	incoming:0,
	incomingPoison:0,
	regen:0,
	targets:[],
	side:0,
	dead:false,
	militia:false,
	goblin:false,
	ogre:false,
	zombie:false,
	boar:false,
	ranged:false,
	bramble:false,
	slimer:false,
	bones:false,
	caw:false,
	hydra:false,
	hydraCount:0,
	thorns:0,
	magicImmune:false,
	keywordModifiers:[0,0,0,0,0,0],
	duplicate:false,
	singleUse: [false,false,false,false,false,false],
	petrify: [false,false,false,false,false,false],
	petrifyCount: 0,
	redirectId:-1,
	redirectIndex:-1,
	minRound:21,
	maxRound:21,
	size:3,
	weight:10,
	boss:false,
	stoneHp:[],
	ironHp:[],
	allIron:false,
	ghost:false,
	ghostHp:[],
	allGhost:false,
	slimeHp:[],
	slimer:false,
	slimerHp:[],
	slimequeen:false,
	lich:false,
	lichHp:[],
	stunHp:[],
	chomp:false,
	chompUpHp:[],
	chompDownHp:[],
	quartzHp:[],
	ogreHp:[],
	armour:0,
	golem:false,
	blind:false,
	bandit:false,
	warchief:false,
	basilisk:false,
	cyclops:false,
	tempBuff:[0,0,0,0,0,0],
	permaBuff:[0,0,0,0,0,0],
	tempKeywords:[],
	undying:false,
	weaken:0,
	cleanseBuffer:[0,0,0,0],
	stun:false,
};
var fightList = [[["goblin","boar"],["bee","wolf","archer","bee"],["wolf","archer","archer"],["boar","bee","archer"]],[["wolf","boar","bee"]],[["wolf","wolf","archer"],["goblin","goblin","bee","archer"]],[["troll"],["alpha","wolf"],["rat","bramble"]]];
var bossList = [[["troll"],["alpha","wolf"],["rat","bramble"]],[["slimelet","slimequeen"]],[["bones","lich","bones","bones"]],[["archer","slate","trollking"]],[["archer","caw","dragon"],["wisp","wisp","inevitable","wisp","wisp","wisp"]]];

function generateFight(roundNo) {
	if (roundNo%4==0) {
		var bossNo = roundNo/4-1;
		return bossList[bossNo][Math.floor(Math.random()*bossList[bossNo].length)];
	} else {
		var totalWeight = 4+Math.floor(roundNo/4)+roundNo%4;
		var mobList = [];
		var stage = Math.floor(roundNo/4);
		var fight = roundNo%4-1;
		while (totalWeight>=0) {
			var maxAllowed = 3;
			if (totalWeight<4) {
				maxAllowed = 2;
			}
			if (totalWeight<2) {
				maxAllowed = 1;
			}
			var size = Math.floor(Math.random()*maxAllowed);
			if (totalWeight>5) {
				size = Math.floor(Math.random()*2)+1;
			}
			if (size==2) {
				totalWeight-=4;
			} else if (size==1) {
				totalWeight-=2;
			} else {
				totalWeight--;
			}
			var index = Math.floor(Math.random()*mobs[size][stage][fight].length);
			var randMob = mobs[size][stage][fight][index];
			console.log(size+" "+stage+" "+index);
			mobList.push(randMob);
			if (mobList.length>=3) {
				totalWeight--;
			}
		}
		return mobList;
	}
}

var fightDiceTemplates = {
	zombie: {minRound:3,maxRound:5,size:2,
		dice:[["attack",2,["poison"]],["attack",2,["poison"]],["attack",2,["cleave"]],["attack",2,["cleave"]],["attack",2,["cleave"]],["attack",2,["cleave"]]],},
	wolf: {minRound:1,maxRound:1,size:2,
		dice:[["attack",4,[]],["attack",4,[]],["attack",4,[]],["attack",4,[]],["attack",1,["cleave"]],["attack",1,["cleave"]]],},
	slimelet: {minRound:6,maxRound:6,size:1,
		dice:[["attack",3,[]],["attack",3,[]],["attack",3,[]],["attack",3,[]],["nothing",0,[]],["nothing",0,[]]],},
	ogre: {minRound:2,maxRound:2,size:3,
		dice:[["attack all",1,[]],["attack all",1,[]],["attack",2,["cleave"]],["attack",2,["cleave"]],["attack all",1,[]],["attack all",1,[]]],},
	militia: {minRound:2,maxRound:3,size:2,
		dice:[["attack",4,[]],["attack",4,[]],["attack",4,[]],["attack",4,[]],["attack",4,[]],["attack",4,[]]],},
	goblin: {minRound:1,maxRound:2,size:2,
		dice:[["attack",4,[]],["attack",4,[]],["attack",3,["eliminate"]],["attack",3,["eliminate"]],["attack",1,["cleave"]],["attack",1,["cleave"]]],},
	boar: {minRound:1,maxRound:1,size:3,
		dice:[["attack",4,[]],["attack",4,[]],["attack",4,[]],["attack",4,[]],["outer",2,[]],["outer",2,[]]],},
	bee: {minRound:1,maxRound:1,size:1,
		dice:[["attack",4,["death"]],["attack",4,["death"]],["attack",1,[]],["attack",1,[]],["attack",1,[]],["attack",1,[]]],},
	archer: {minRound:1,maxRound:1,size:1,
		dice:[["attack",3,[]],["attack",3,[]],["attack",2,[]],["attack",2,[]],["attack",2,[]],["attack",2,[]]],},
	rat: {minRound:1,maxRound:1,size:1,
		dice:[["attack",3,[]],["attack",3,[]],["attack",2,[]],["attack",2,[]],["attack",2,[]],["attack",2,[]]],},
	thorn: {minRound:1,maxRound:1,size:1,
		dice:[["attack",4,["eliminate"]],["attack",4,["eliminate"]],["attack",2,["petrify"]],["attack",2,["petrify"]],["attack",2,["petrify"]],["attack",2,["petrify"]]],},
	troll: {minRound:4,maxRound:4,size:3,
		dice:[["attack",3,["cleave"]],["attack",3,["cleave"]],["attack all",2,[]],["attack all",2,[]],["attack",2,["cleave"]],["attack",1,["cleave","poison"]]],},
	alpha: {minRound:4,maxRound:4,size:3,
		dice:[["attack",2,["cleave"]],["attack",2,["cleave"]],["attack",6,[]],["attack",6,[]],["summon wolf",1,[]],["summon wolf",1,[]]],},
	bramble: {minRound:6,maxRound:6,size:3,
		dice:[["attack",5,[]],["attack",5,[]],["attack",2,["cleave"]],["attack",2,["cleave"]],["attack",2,["poison"]],["attack",2,["poison"]]],},
	slimer: {minRound:2,maxRound:3,size:3,
		dice:[["attack",2,["cleave"]],["attack",2,["cleave"]],["outer",3,[]],["outer",3,[]],["attack",2,["cleave"]],["attack",2,["cleave"]]]},
	fanatic: {minRound:3,maxRound:5,size:2,
		dice:[["attack",8,["pain"]],["attack",8,["pain"]],["attack",6,["pain"]],["attack",6,["pain"]],["attack",4,["pain"]],["attack",4,["pain"]]],},
	bones: {minRound:3,maxRound:3,size:1,
		dice:[["attack",4,[]],["attack",4,[]],["attack",4,[]],["attack",4,[]],["attack",3,[]],["attack",3,[]]],},
	sniper: {minRound:4,maxRound:5,size:1,
		dice:[["attack",5,[]],["attack",5,[]],["attack",5,[]],["attack",5,[]],["attack",4,["eliminate"]],["attack",4,["eliminate"]]],},
	imp: {minRound:3,maxRound:3,size:1,
		dice:[["attack",8,["death"]],["attack",4,[]],["attack",4,[]],["attack",4,[]],["attack",1,["poison"]],["attack",1,["poison"]]],},
	spider: {minRound:6,maxRound:6,size:1,
		dice:[["attack",3,[]],["attack",3,[]],["attack",3,[]],["attack",3,[]],["attack",1,["poison"]],["attack",3,["poison"]]],},
	wisp: {minRound:5,maxRound:5,size:1,
		dice:[["selfheal",3,["vitality"]],["attack",2,["inflict pain"]],["attack",2,["inflict pain"]],["attack",2,["inflict pain"]],["summon bones",1,[]],["summon bones",1,[]]],},
	grave: {minRound:3,maxRound:3,size:1,
		dice:[["summon bones",1,[]],["summon bones",1,[]],["summon bones",1,[]],["summon bones",1,[]],["summon bones",1,[]],["summon bones",1,[]]]},
	shade: {minRound:2,maxRound:2,size:2,
		dice:[["attack",5,["eliminate"]],["attack",5,["eliminate"]],["attack",4,["eliminate"]],["attack",4,["eliminate"]],["attack",3,["eliminate"]],["attack",3,["eliminate"]]],},
	seed: {minRound:6,maxRound:6,size:1,
		dice:[["summon thorn",1,["death"]],["summon thorn",1,["death"]],["summon thorn",1,["death"]],["nothing",0,[]],["nothing",0,[]],["nothing",0,[]]]},
	snake: {minRound:2,maxRound:4,size:2,
		dice:[["attack",2,["poison"]],["attack",2,["poison"]],["attack",1,["poison"]],["attack",1,["poison"]],["attack",1,["poison"]],["attack",1,["poison"]]],},
	quartz: {minRound:2,maxRound:2,size:2,
		dice:[["attack",5,["inflict singleUse"]],["attack",5,["inflict singleUse"]],["attack",2,["weaken"]],["attack",2,["weaken"]],["attack",2,["weaken"]],["attack",2,["weaken"]]]},
	gnoll: {minRound:4,maxRound:4,size:2,
		dice:[["attack",5,["heavy"]],["attack",5,["heavy"]],["attack",6,["exert"]],["attack",6,["exert"]],["attack",4,["heavy"]],["attack",4,["heavy"]]],},
	carrier: {minRound:3,maxRound:3,size:2,
		dice:[["attack all all",1,["poison"]],["attack all all",1,["poison"]],["attack all all",1,["poison"]],["attack all all",1,["poison"]],["attack all all",1,["poison"]],["attack all all",1,["poison"]]]},
		//dice:[["attack",5,[]],["attack",5,[]],["attack",2,["poison"]],["attack",2,["poison"]],["attack",5,[]],["attack all all",1,["poison"]]],},
	bandit: {minRound:2,maxRound:4,size:2,
		dice:[["attack",6,[]],["attack",6,[]],["attack",5,[]],["attack",5,[]],["attack",2,["poison"]],["attack",2,["poison"]]],},
	blind: {minRound:2,maxRound:4,size:2,
		dice:[["attack all",2,[]],["attack all",2,[]],["attack all",1,[]],["attack all",1,[]],["attack all",1,[]],["attack all",1,[]]]},
	golem: {minRound:2,maxRound:5,size:2,earliestFight:3,
		dice:[["attack",0,["steel"]],["attack",0,["steel"]],["attack",5,[]],["attack",5,[]],["attack",2,["selfshield"]],["attack",2,["selfshield"]]],},
	warchief: {minRound:2,maxRound:4,size:2,
		dice:[["attack",2,[]],["attack",2,[]],["attack",2,[]],["attack",2,[]],["attack",0,["cleave"]],["attack",0,["cleave"]]],},
	saber: {minRound:6,maxRound:6,size:2,
		dice:[["attack",12,["death"]],["attack",5,[]],["attack",8,["exert"]],["attack",8,["exert"]],["attack",5,[]],["attack",5,[]]],},
	ghost: {minRound:3,maxRound:4,size:3,
		dice:[["attack",6,["eliminate"]],["attack",6,["eliminate"]],["attack",4,["descend"]],["attack",4,["descend"]],["attack",2,["poison"]],["attack",2,["poison"]]],},
	caw: {minRound:4,maxRound:5,size:3,
		dice:[["attack",7,[]],["attack",7,[]],["attack",7,[]],["attack",7,[]],["attack",3,["cleave"]],["attack",3,["cleave"]]],},
	slate: {minRound:2,maxRound:5,size:3,earliestFight:3,
		dice:[["attack",7,[]],["attack",7,[]],["attack",7,[]],["attack",7,[]],["attack all",2,[]],["attack all",2,[]]],},
	wizz: {minRound:3,maxRound:5,size:3,
		dice:[["attack",4,["weaken"]],["heal all",3,[]],["attack all",2,[]],["attack all",2,[]],["summon bones",2,[]],["summon bones",2,[]]],},
	demon: {minRound:4,maxRound:5,size:3,
		dice:[["attack",6,["inflict pain"]],["attack",6,["inflict pain"]],["attack all",2,[]],["attack all",2,[]],["summon imp",1,[]],["summon imp",1,[]]],},
	spiker: {minRound:3,maxRound:5,size:3,
		dice:[["attack",7,[]],["attack",7,[]],["attack",7,[]],["attack",7,[]],["attack all",2,[]],["attack all",2,[]]],},
	basilisk: {minRound:4,maxRound:5,size:3,
		dice:[["attack",2,["cleave"]],["attack",2,["cleave"]],["attack",2,["poison"]],["attack",2,["poison"]],["attack",2,["cleave"]],["attack",1,["cleave","weaken"]]],},
	cyclops: {minRound:2,maxRound:4,size:3,earliestFight:3,
		dice:[["attack all",3,[]],["attack all",3,[]],["attack",4,["cleave"]],["attack",4,["cleave"]],["attack all",3,[]],["attack all",3,[]]],},
	chomp: {minRound:4,maxRound:5,size:3,
		dice:[["attack",7,[]],["attack",7,[]],["attack",5,[]],["attack",5,[]],["attack",4,[]],["attack",4,[]]],},
	banshee: {minRound:3,maxRound:5,size:3,
		dice:[["attack",5,["descend"]],["attack",5,["descend"]],["attack",4,["weaken"]],["attack",4,["weaken"]],["attack",3,["poison"]],["attack",3,["poison"]]],},
	slimequeen: {minRound:6,maxRound:6,size:4,
		dice:[["attack",9,["heavy"]],["attack",4,["cleave"]],["outer",5,[]],["outer",5,[]],["attack",3,["cleave"]],["attack",3,["cleave"]]],},
	trollking: {minRound:6,maxRound:6,size:4,
		dice:[["attack",5,["cleave"]],["attack",5,["cleave"]],["attack all",3,[]],["attack all",3,[]],["attack",5,["cleave"]],["attack",2,["cleave","poison"]]],},
	lich: {minRound:6,maxRound:6,size:4,
		dice:[["attack",2,["petrify"]],["attack",2,["petrify"]],["summon bones",2,[]],["summon bones",2,[]],["attack all",1,["weaken"]],["attack all",1,["weaken"]]]},
	dragon: {minRound:6,maxRound:6,size:4,
		dice:[["attack all",5,[]],["attack all",5,[]],["attack",15,["heavy"]],["attack",15,["heavy"]],["attack",3,["cleave","poison"]],["attack",3,["cleave","poison"]]],},
	hydra: {minRound:4,maxRound:5,size:3,
		dice:[["attack",5,["cleave"]],["attack",5,["cleave"]],["attack",10,[]],["attack",10,[]],["attack",5,["cleave"]],["attack",2,["weaken","cleave"]]],},
	inevitable: {minRound:6,maxRound:6,size:4,
		dice:[["attack",6,["heavy","selfheal","era"]],["attack",6,["heavy","selfheal","era"]],["attack",3,["inflict exert","cleave","era"]],["attack",3,["inflict exert","cleave","era"]],["outer",3,["weaken","era"]],["outer",3,["weaken","era"]]],},
	illusion: {minRound:2,maxRound:2, size:1,
		dice:[["attack",2,["weaken"]],["attack",1,["weaken"]],["attack",1,["petrify"]],["attack",1,["petrify"]],["attack",1,["weaken"]],["attack",1,["weaken"]]],}
}
socket.on("spawn",(enemy) => {
	spawnEnemy(enemy,enemies.length);
	reposition();
});

function spawnEnemy(enemy,pos) {
	var temp = structuredClone(fightTemplate);
	switch (enemy) {
		case "bee":
			temp.hp=2;
			temp.maxHp=2;
			break;
		case "archer":
			temp.hp=2;
			temp.maxHp=2;
			temp.ranged=true;
			break;
		case "rat":
			temp.hp=3;
			temp.maxHp=3;
			break;
		case "thorn":
			temp.hp=2;
			temp.maxHp=2;
			temp.magicImmune=true;
			temp.thorns=5;
			break;
		case "troll":
			temp.hp=15;
			temp.maxHp=15;
			temp.regen=1;
			break;
		case "alpha":
			temp.hp=13;
			temp.maxHp=13;
			break;
		case "bramble":
			temp.hp=11;
			temp.maxHp=11;
			temp.bramble=true;
			break;
		case "zombie":
			temp.hp=10;
			temp.maxHp=10;
			temp.dice=[["attack",2,["poison"]],["attack",2,["poison"]],["attack",2,["cleave"]],["attack",2,["cleave"]],["attack",2,["cleave"]],["attack",2,["cleave"]]];
			temp.zombie=true;
			break;
		case "wolf":
			temp.hp=6;
			temp.maxHp=6;
			temp.dice=[["attack",4,[]],["attack",4,[]],["attack",4,[]],["attack",4,[]],["attack",1,["cleave"]],["attack",1,["cleave"]]];
			break;
		case "slimelet":
			temp.hp=2;
			temp.maxHp=2;
			temp.dice=[["attack",3,[]],["attack",3,[]],["attack",3,[]],["attack",3,[]],["nothing",0,[]],["nothing",0,[]]];
			break;
		case "ogre":
			temp.hp=10;
			temp.maxHp=10;
			temp.dice=[["attack all",1,[]],["attack all",1,[]],["attack",2,["cleave"]],["attack",2,["cleave"]],["attack all",1,[]],["attack all",1,[]]];
			temp.ogre=true;
			break;
		case "militia":
			temp.hp=7;
			temp.maxHp=7;
			temp.dice=[["attack",4,[]],["attack",4,[]],["attack",4,[]],["attack",4,[]],["attack",4,[]],["attack",4,[]]];
			temp.militia=true;
			break;
		case "goblin":
			temp.hp=5;
			temp.maxHp=5;
			temp.dice=[["attack",4,[]],["attack",4,[]],["attack",3,["eliminate"]],["attack",3,["eliminate"]],["attack",1,["cleave"]],["attack",1,["cleave"]]];
			temp.goblin=true;
			break;
		case "boar":
			temp.boar=true;
			temp.ironHp=[1];
			break;
		case "slimer":
			temp.hp=7;
			temp.maxHp=7;
			temp.slimer=true;
			break;
		case "fanatic":
			temp.hp=13;
			temp.maxHp=13;
			break;
		case "bones":
			temp.hp=4;
			temp.maxHp=4;
			temp.bones=true;
			break;
		case "sniper":
			temp.hp=3;
			temp.maxHp=3;
			temp.ranged=true;
			break;
		case "imp":
			temp.hp=4;
			temp.maxHp=4;
			temp.thorns=1;
			break;
		case "spider":
			temp.hp=4;
			temp.maxHp=4;
			break;
		case "wisp":
			temp.hp=5;
			temp.maxHp=5;
			break;
		case "grave":
			temp.hp=3;
			temp.maxHp=3;
			temp.allIron=true;
			break;
		case "shade":
			temp.hp=5;
			temp.maxHp=5;
			temp.allGhost = true;
			break;
		case "seed":
			temp.hp=1;
			temp.maxHp=1;
			break;
		case "snake":
			temp.hp=5;
			temp.maxHp=5;
			break;
		case "quartz":
			temp.hp=7;
			temp.maxHp=7;
			temp.quartzHp=[3];
			break;
		case "gnoll":
			temp.hp=3;
			temp.maxHp=3;
			temp.armour=1;
			break;
		case "carrier":
			temp.hp=10;
			temp.maxHp=10;
			temp.poison=2;
			break;
		case "bandit":
			temp.hp=8;
			temp.maxHp=8;
			temp.bandit=true;
			break;
		case "blind":
			temp.hp=5;
			temp.maxHp=5;
			temp.blind=true;
			break;
		case "golem":
			temp.hp=2;
			temp.maxHp=2;
			temp.block=8;
			temp.golem=true;
			break;
		case "warchief":
			temp.hp=6;
			temp.maxHp=6;
			temp.warchief=true;
			break;
		case "saber":
			temp.hp=10;
			temp.maxHp=10;
			break;
		case "ghost":
			temp.hp=6;
			temp.maxHp=6;
			temp.ghostHp=[5];
			break;
		case "caw":
			temp.hp=7;
			temp.maxHp=7;
			temp.caw = true;
			break;
		case "slate":
			temp.hp=5;
			temp.maxHp=5;
			temp.allIron=true;
			break;
		case "wizz":
			temp.hp=5;
			temp.maxHp=5;
			temp.ranged=true;
			temp.stunHp=[4];
			break;
		case "demon":
			temp.hp=12;
			temp.maxHp=12;
			break;
		case "spiker":
			temp.hp=13;
			temp.maxHp=13;
			temp.thorns=2;
			break;
		case "basilisk":
			temp.hp=12;
			temp.maxHp=12;
			temp.basilisk=true;
			break;
		case "cyclops":
			temp.hp=15;
			temp.maxHp=15;
			temp.cyclops=true;
			break;
		case "chomp":
			temp.hp=10;
			temp.maxHp=10;
			temp.chomp=true;
			break;
		case "banshee":
			temp.hp=10;
			temp.maxHp=10;
			break;
		case "slimequeen":
			temp.hp=13;
			temp.maxHp=13;
			temp.slimequeen=true;
			break;
		case "trollking":
			temp.hp=20;
			temp.maxHp=20;
			temp.regen=2;
			break;
		case "lich":
			temp.hp=20;
			temp.maxHp=20;
			temp.ranged=true;
			temp.lich=true;
			break;
		case "dragon":
			temp.hp=40;
			temp.maxHp=40;
			break;
		case "hydra":
			temp.hp=20;
			temp.maxHp=20;
			temp.hydra=true;
			break;
		case "inevitable":
			temp.hp=30;
			temp.maxHp=30;
			temp.inevitable=true;
			break;
		case "illusion":
			temp.hp=1;
			temp.maxHp=1;
			break;
		default:
			break;
	}
	console.log(enemy);
	temp.dice=structuredClone(fightDiceTemplates[enemy]).dice;
	temp.x=enemies.length*temp.width;
	temp.y=0;

	//curses and blessings stuff happen here maybe
	if (temp.allIron) {
		for (var i=0; i<temp.maxHp;i++) {
			temp.ironHp.push(i+1);
		}
	}
	if (temp.allGhost) {
		for (var i=0; i<temp.maxHp;i++) {
			temp.ghostHp.push(i+1);
		}
	}

	if (temp.slimer) {
		for (var i=5; i<=temp.maxHp;i+=5) {
			temp.slimeHp.push(i);
		}
	}

	if (temp.slimequeen) {
		for (var i=5; i<=temp.maxHp; i+=5) {
			temp.slimerHp.push(i);
		}
	}

	if (temp.lich) {
		for (var i=5; i<=temp.maxHp; i+=5) {
			temp.lichHp.push(i);
		}
	}

	if (temp.cyclops) {
		temp.stunHp.push(Math.ceil(temp.maxHp/2));
	}
	if (temp.inevitable) {
		for (var i=5; i<=temp.maxHp; i+=5) {
			temp.ghostHp.push(i);
		}
	}
	if (temp.chomp) {
		for (var i=1; i<=Math.min(5,temp.maxHp); i++) {
			temp.chompDownHp.push(i);
		}
		for (var i=Math.max(1,temp.maxHp-4); i<=temp.maxHp; i++) {
			temp.chompUpHp.push(i);
		}
	}
	if (temp.ogre) {
		for (var i=3; i<=temp.maxHp; i+=5) {
			temp.ogreHp.push(i);
		}
	}

	temp.name=enemy;
	temp.position=parseInt(pos);
	enemies.push(temp);
	console.log(enemies.length);
	updateText();
}

function spawnFight() {
	if (round<=20) {
		var randFight = generateFight(round);//Math.floor(Math.random()*fightList[round-1].length);
		for (var i in randFight) {
			socket.emit("spawn",randFight[i]);
		}
	} else {
		socket.emit("spawn","fanatic");
		socket.emit("spawn","fanatic");
		socket.emit("spawn","fanatic");
	}
	//socket.emit("send","update text");
}
var playerText = [];
socket.on("ready",(num) => {

	console.log("ready");
	for (var i=0; i<num; i++) {
		dice.push([]);
		initialDice.push([]);
		playerText.push(new PIXI.Text("Player "+(i+1)));
		if (i==playerId) {
			playerText[i].text+=" (you)";
			playerText[i].x=5*50;
			playerText[i].y=2*50;
		} else {
			playerText[i].x=13*50;
			playerText[i].y=2*50+2*50*i-2*50*(i>playerId);
		}
		playerText[i].style.fontSize=20;
		app.stage.addChild(playerText[i]);
	}
	if (host) {
		socket.emit("reset enemy");
		for (var i in dice) {
			spawnFight();
			//socket.emit("spawn","slimelet");
			//socket.emit("spawn","slimelet");
		}
		for (var i in dice) {
			for (var j in starting) {
				var list;
				switch (startingColours[j]) {
					case "grey":
						list = greys;
						break;
					case "yellow":
					default:
						list = yellows;
						break;
				}
				var randSelect = Math.floor(Math.random()*list[0].length);
				starting[j]=list[0][randSelect];
			}
			for (var j in starting) {
				socket.emit("init dice",i,j,"pilgrim");//starting[j]);
			}
		}
		socket.emit("start");
	}
});
socket.on("inventory ready",()=> {
	/*for (var i in dice[playerId]) {
		socket.emit("init dice",playerId,i,dice[playerId][i].name);
	}*/
	if (gameState!="waiting"){
		processEquipment();
		if (host) {
			
			//backupDice();
			/*for (var i in dice) {
				for (var j in dice[i]) {
					initialDice[i][j]=structuredClone(dice[i][j]);
				}
			}*/
			socket.emit("send","resume");
		}
	}
});
socket.on("upgrade ready",()=> {
	upgradeTurn=false;
	gameState = "inventory";
	if (host) {
		//idk
	}
})
socket.on("equipment ready",()=> {
	equipmentTurn=false;
	gameState = "inventory";
	if (host) {
		//idk
	}
});
socket.on("new client", (id)=> {
	if (playerId==-1) {
		playerId=id;
		console.log(id);
		connected=true;
	}
});
var template = {
	dice: [["attack", 2,[]],["attack", 2,[]],["attack", 1,[]], ["attack", 1,[]], ["defend", 1,[]],["defend", 1,[]]],
	hp: 5,
	maxHp: 5,
	emptyHp:0,
	block: 0,
	autoblock: 0,
	name: "fighter",
	used: false,
	x: 0,
	y: 0,
	width: SQUARE,
	height: SQUARE,
	locked: false,
	side: 0,
	dead: false,
	incoming: 0,
	incomingPoison: 0,
	colour:"yellow",
	tier:1,
	poison:0,
	regen:0,
	keywordModifiers:[0,0,0,0,0,0],
	exert:0,
	rampage:false,
	ranged:false,
	petrify:[false,false,false,false,false,false],
	petrifyCount:0,
	thorns:0,
	caw:false,
	magicImmune:false,
		duplicate: false,
		duplicateFace: ["attack",1,[]],
		singleUse: [false,false,false,false,false,false],
	redirectId:-1,
	redirectIndex:-1,
	stoneHp:[],
	ironHp:[],
	ghostHp:[],
	maxEquipment:2,
	equipment:[],
	equipmentSpells:[],
	position:0,
	armour:0,
	tempBuff:[0,0,0,0,0,0],
	permaBuff:[0,0,0,0,0,0],
	tempKeywords:[],
	undying:false,
	weaken:0,
	spells:[],
	cleanseBuffer:[0,0,0,0],
	stun:false,
	doubleUse:false,
	doubleUseCount:0,
}

var diceTemplates={
		fighter: {dice: [["attack", 2,[]],["attack", 2,[]],["attack", 1,[]], ["attack", 1,[]], ["defend", 1,[]],["defend", 1,[]]],},
 		defender:{dice:  [["defend",3,[]],["defend",2,[]],["attack",1,[]],["attack",1,[]],["defend",1,[]],["nothing",0,[]]],},
		soldier:{dice: [["attack",3,[]],["attack",3,[]],["attack",2,[]],["attack",2,[]],["defend",2,[]],["defend",2,[]]],},
		veteran:{dice: [["attack",4,[]],["attack",4,[]],["attack",3,[]],["attack",3,[]],["defend",3,[]],["defend",3,[]]],},
		warden:{dice: [["defend",4,[]],["defend",3,[]],["attack",2,[]],["attack",2,[]],["defend",2,[]],["defend",1,[]]],},
		lazy: {dice:[["attack",3,[]],["defend",3,[]],["nothing",0,[]],["nothing",0,[]],["nothing",0,[]],["nothing",0,[]]],},
		ruffian:{dice: [["attack",5,["pain"]],["attack",1,["cleave"]],["attack",1,[]],["attack",1,[]],["defend",2,[]],["nothing",0,[]]],},
		buckle: {dice:[["defend",2,["pristine"]],["attack",2,["heavy"]],["defend",2,[]],["defend",2,[]],["nothing",0,[]],["nothing",0,[]]],},
		squire: {dice:[["defend",2,["focus"]],["attack",1,["focus"]],["redirect",2,["selfshield"]],["redirect",2,["selfshield"]],["defend",1,[]],["defend",1,[]]],},
		gigadefender:{dice: [["defend",5,[]],["defend",4,[]],["attack",3,[]],["attack",3,[]],["defend",3,[]],["defend",2,[]]],},
		brigand: {dice: [["attack",3,["exert"]],["attack",3,["exert"]],["attack",1,["selfshield"]],["attack",1,["selfshield"]],["attack",1,[]],["attack",1,[]]]},
		hoarder: {dice: [["attack",2,["guilt"]],["attack",2,["heavy"]],["attack",2,["exert"]],["attack",2,["singleUse"]],["attack",2,["pain"]],["attack",2,["death"]]]},
		scrapper: {dice: [["attack",1,["bloodlust"]],["attack",1,["bloodlust"]],["attack",1,["steel"]],["attack",1,["steel"]],["nothing",0,[]],["nothing",0,[]]]},
		brute: {dice: [["attack",2,["selfshield"]],["attack",2,["selfshield"]],["attack",3,["heavy"]],["attack",3,["heavy"]],["stun",0,[]],["nothing",0,[]]]},
		berserker: {dice: [["attack",3,["deathwish"]],["attack",1,["cleave"]],["attack",4,["pain"]],["attack",4,["pain"]],["nothing",0,[]],["nothing",0,[]]]},
		sinew: {dice: [["attack",1,["cleave","chain"]],["defend",2,[]],["attack",4,["exert"]],["attack",4,["exert"]],["defend",2,[]],["nothing",0,[]]]},
		collector: {dice: [["attack",2,["deathwish"]],["attack",1,["duplicate"]],["attack",2,["growth"]],["attack",2,["selfshield"]],["attack",1,["cleave"]],["attack",1,["focus"]]]},
		gladiator: {dice: [["attack",2,["engage"]],["attack",1,["engage"]],["attack",2,["selfshield"]],["attack",2,["selfshield"]],["defend",2,[]],["nothing",0,[]]]},
		whirl: {dice: [["attack all",1,[]],["attack",3,[]],["attack",1,["cleave"]],["attack",1,["cleave"]],["defend",1,["cleave"]],["nothing",0,[]]]},
		wanderer: {dice: [["attack",1,["defy"]],["attack",1,["defy"]],["attack",3,["era"]],["attack",3,["era"]],["defend",2,["copycat"]],["defend",2,["copycat"]]]},
		brawler: {dice: [["attack",3,["steel"]],["attack",3,["selfshield"]],["attack",2,["rampage"]],["attack",2,["rampage"]],["attack",3,["selfshield"]],["nothing",0,[]]]},
		curator: {dice: [["attack",3,["engage"]],["attack",2,["rampage"]],["attack",1,["charged"]],["attack",1,["manaGain"]],["attack",1,["steel"]],["attack",1,["era"]]]},
		barbarian: {dice: [["attack",10,["death"]],["attack",8,["pain"]],["attack",2,["bloodlust"]],["attack",2,["bloodlust"]],["attack",6,["pain"]],["attack",4,["pain"]]]},
		captain: {dice: [["attack",3,["focus"]],["attack",1,["chain","cleave"]],["defend",4,[]],["defend",4,[]],["attack",1,["chain","cleave"]],["nothing",0,[]]]},
		bash: {dice: [["attack",7,["exert"]],["attack",2,["steel"]],["attack",5,["heavy"]],["attack",5,["heavy"]],["stun",0,[]],["nothing",0,[]]]},
		leader: {dice: [["reuse",0,[]],["attack",2,["duplicate"]],["attack",3,[]],["attack",3,[]],["defend",2,["smith"]],["nothing",0,[]]]},
		eccentric: {dice: [["nothing",0,[]],["nothing",0,[]],["attack",4,[]],["nothing",0,[]],["attack",4,[]],["attack",4,["descend"]]]},
		alloy: {dice: [["attack",1,["selfshield"]],["defend",1,["repel"]],["defend",1,["cleave"]],["defendheal",1,[]],["defend",1,["cleanse"]],["defend",1,["cantrip"]]]},
		wallop: {dice: [["undying",0,[]],["attack",2,["selfshield"]],["stun",0,[]],["stun",0,[]],["attack",1,["selfshield"]],["nothing",0,[]]],},
		knight: {dice: [["defend",3,["steel"]],["defend",3,["steel"]],["attack",3,["exert"]],["attack",3,["exert"]],["nothing",0,[]],["nothing",0,[]]],},
		pilgrim: {dice: [["reuse",0,[]],["undying",0,[]],["inflict selfshield",0,[]],["inflict selfshield",0,[]],["stun",0,[]],["stun",0,[]]],},
		guardian: {dice: [["defend",2,["cleave"]],["attack",1,["cleave"]],["defend",3,["engage"]],["defend",3,["engage"]],["nothing",0,[]],["nothing",0,[]]],},
		monk: {dice: [["defend",2,["cleanse"]],["defend",1,["repel"]],["redirect",3,["selfshield"]],["redirect",3,["selfshield"]],["defend",1,["repel"]],["nothing",0,[]]],},
		armorer: {dice: [["attack",3,["heavy"]],["defend",4,[]],["defend",1,["cleave"]],["defend",1,["cleave"]],["defend",1,["smith"]],["defend",1,["smith"]]],},
		stalwart: {dice: [["defend",3,["cleanse"]],["defend",3,["cleanse"]],["defend",2,["cleave"]],["defend",2,["cleave"]],["defend",2,["doubleUse"]],["attack",5,["exert"]]],},
		pilgrim: {dice: [["reuse",0,[]],["undying",0,[]],["inflict selfshield",0,[]],["inflict selfshield",0,[]],["stun",0,[]],["stun",0,[]]],},
		keeper: {dice: [["defend",2,["repel"]],["defend",2,["repel"]],["defend",5,["steel"]],["defend",5,["steel"]],["inflict selfheal selfshield",0,[]],["nothing",0,[]]],},
		stoic: {dice: [["stun",0,[]],["redirect",3,["selfshield"]],["attack",2,["selfshield"]],["attack",2,["selfshield"]],["redirect",2,["selfshield"]],["redirect",1,["selfshield"]]]},
		prince: {dice: [["attack",3,["inspired"]],["defend",3,["duplicate"]],["nothing",0,[]],["nothing",0,[]],["defendheal",3,[]],["nothing",0,[]]],},
		paladin: {dice: [["defend",4,["cleanse"]],["attack",4,["heavy"]],["defendheal",3,[]],["defendheal",3,[]],["attack",4,["heavy"]],["attack",4,["heavy"]]],},
		valkyrie: {dice: [["attack",4,["deathwish"]],["defend",2,["rescue"]],["undying",0,[]],["undying",0,[]],["revive",2,[]],["nothing",0,[]]],},
		cleric: {dice: [["defendheal",3,[]],["defend",2,["cleanse"]],["mana",2,["singleUse"]],["mana",2,["singleUse"]],["nothing",0,[]],["nothing",0,[]]],},
		poet: {dice: [["mana",1,["cantrip"]],["defend all",2,[]],["defend",2,["charged"]],["defend",2,["charged"]],["defend",2,["cantrip"]],["nothing",0,[]]],},
		bard: {dice: [["attack",1,["cantrip"]],["reroll",1,["cantrip"]],["defend all",1,[]],["defend all",1,[]],["defend",1,["cantrip"]],["nothing",0,[]]],},
	};
socket.on("init dice",(id,index,unit)=> {
	console.log("init dice" + dice[id].length);
	spawnDice(id,index,unit,index);
	repositionDice();
});
function previouslyDied(id,index) {
	for (var i in deadTracker) {
		if (id==deadTracker[i][0]&&index==deadTracker[i][1]) {
			return true;
		}
	}
	return false;
}
function adjustDeathHp(id,index) {
	dice[id][index].hp=dice[id][index].maxHp;
	if (previouslyDied(id,index)) {
		dice[id][index].hp=Math.max(1,Math.floor(Math.max(1,dice[id][index].maxHp-dice[id][index].emptyHp)/2))+dice[id][index].emptyHp;
	}
	dice[id][index].hp-=dice[id][index].emptyHp;

	dice[id][index].hp=Math.max(dice[id][index].hp,1);
}
function resetDie(id, index) {
	spawnDice(id,index,dice[id][index].name,dice[id][index].position);
	adjustDeathHp(id,index);
	/*for (var i in deadTracker) {
		if (id==deadTracker[i][0]&&index==deadTracker[i][1]) {
			dice[deadTracker[i][0]][deadTracker[i][1]].hp=Math.max(1,Math.floor(dice[deadTracker[i][0]][deadTracker[i][1]].maxHp/2));
			break;
		}
	}*/
	repositionDice();
}
function resetDice() {
	for (var i in dice) {
		for (var j in dice[i]) {
			resetDie(i,j);
			//spawnDice(i,j,dice[i][j].name,dice[i][j].position);
		}
	}
	/*for (var i in deadTracker) {
		dice[deadTracker[i][0]][deadTracker[i][1]].hp=Math.max(1,Math.floor(dice[deadTracker[i][0]][deadTracker[i][1]].maxHp/2));
		console.log("oof");
	}*/
}
function spawnDice(id,index,unit,pos) {
	var temp = structuredClone(template);
	//temp.dice=structuredClone(diceTemplates[unit]).dice;
	switch(unit) {
		case "gigadefender":
			temp.hp=13;
			temp.maxHp=13;
			temp.dice=structuredClone(diceTemplates[unit]).dice;
			temp.colour="grey";
			temp.tier=3;
			break;
		case "defender":
			temp.hp=7;
			temp.maxHp=7;
			temp.dice = [["defend",3,[]],["defend",2,[]],["attack",1,[]],["attack",1,[]],["defend",1,[]],["nothing",0,[]]];
			temp.colour = "grey";
			break;
		case "soldier":
			temp.hp=7;
			temp.maxHp=7;
			temp.dice = [["attack",3,[]],["attack",3,[]],["attack",2,[]],["attack",2,[]],["defend",2,[]],["defend",2,[]]];
			temp.tier=2;
			break;
		case "veteran":
			temp.hp=11;
			temp.maxHp=11;
			temp.dice = [["attack",4,[]],["attack",4,[]],["attack",3,[]],["attack",3,[]],["defend",3,[]],["defend",3,[]]];
			temp.tier=3;
			break;
		case "warden":
			temp.hp=10;
			temp.maxHp=10;
			temp.dice = [["defend",4,[]],["defend",3,[]],["attack",2,[]],["attack",2,[]],["defend",2,[]],["defend",1,[]]];
			temp.colour = "grey";
			temp.tier=2;
			break;
		case "lazy":
			temp.dice = [["attack",3,[]],["defend",3,[]],["nothing",0,[]],["nothing",0,[]],["nothing",0,[]],["nothing",0,[]]];
			break;
		case "ruffian":
			temp.hp=4;
			temp.maxHp=4;
			temp.dice = [["attack",5,["pain"]],["attack",1,["cleave"]],["attack",1,[]],["attack",1,[]],["defend",2,[]],["nothing",0,[]]];
			break;
		case "buckle":
			temp.hp=6;
			temp.maxHp=6;
			temp.dice = [["defend",2,["pristine"]],["attack",2,["heavy"]],["defend",2,[]],["defend",2,[]],["nothing",0,[]],["nothing",0,[]]];
			temp.colour = "grey";
			break;
		case "squire":
			temp.dice = [["defend",2,["focus"]],["attack",1,["focus"]],["redirect",2,["selfshield"]],["redirect",2,["selfshield"]],["defend",1,[]],["defend",1,[]]];
			temp.colour = "grey";
			break;
		case "hoarder":
			temp.hp=6;
			temp.maxHp=6;
			break;
		case "scrapper":
			temp.hp=8;
			temp.maxHp=8;
			temp.tier=2;
			break;
		case "brute":
			temp.hp=8;
			temp.maxHp=8;
			temp.tier=2;
			break;
		case "berserker":
			temp.hp=8;
			temp.maxHp=8;
			temp.tier=2;
			break;
		case "sinew":
			temp.hp=8;
			temp.maxHp=8;
			temp.tier=2;
			break;
		case "collector":
			temp.hp=8;
			temp.maxHp=8;
			temp.tier=2;
			break;
		case "gladiator":
			temp.hp=7;
			temp.maxHp=7;
			temp.tier=2;
			break;
		case "whirl":
			temp.hp=7;
			temp.maxHp=7;
			temp.tier=2;
			break;
		case "wanderer":
			temp.hp=10;
			temp.maxHp=10;
			temp.tier=3;
			break;
		case "brawler":
			temp.hp=9;
			temp.maxHp=9;
			temp.tier=3;
			break;
		case "curator":
			temp.hp=9;
			temp.maxHp=9;
			temp.tier=3;
			break;
		case "barbarian":
			temp.hp=12;
			temp.maxHp=12;
			temp.tier=3;
			break;
		case "captain":
			temp.hp=10;
			temp.maxHp=10;
			temp.tier=3;
			temp.spells=[getSpellByName("formation",id,index)];
			break;
		case "bash":
			temp.hp=10;
			temp.maxHp=10;
			temp.tier=3;
			break;
		case "leader":
			temp.hp=9;
			temp.maxHp=9;
			temp.tier=3;
			break;
		case "eccentric":
			temp.hp=8;
			temp.maxHp=8;
			temp.tier=3;
			break;
		case "alloy":
			temp.hp=4;
			temp.maxHp=4;
			temp.colour="grey";
			break;
		case "wallop":
			temp.hp=5;
			temp.maxHp=5;
			temp.colour="grey";
			break;
		case "knight":
			temp.hp=9;
			temp.maxHp=9;
			temp.colour="grey";
			temp.tier=2;
			temp.spells=[getSpellByName("parry",id,index)];
			break;
		case "pilgrim":
			temp.hp=9;
			temp.maxHp=9;
			temp.colour="grey";
			temp.tier=2;
			break;
		case "guardian":
			temp.hp=8;
			temp.maxHp=8;
			temp.colour="grey";
			temp.tier=2;
			break;
		case "monk":
			temp.hp=9;
			temp.maxHp=9;
			temp.colour="grey";
			temp.tier=2;
			break;
		case "armorer":
			temp.hp=9;
			temp.maxHp=9;
			temp.colour="grey";
			temp.tier=2;
			break;
		case "stalwart":
			temp.hp=11;
			temp.maxHp=11;
			temp.colour="grey";
			temp.tier=3;
			break;
		case "keeper":
			temp.hp=10;
			temp.maxHp=10;
			temp.colour="grey";
			temp.tier=3;
			break;
		case "valkyrie":
			temp.hp=9;
			temp.maxHp=9;
			temp.colour="grey";
			temp.tier=3;
			break;
		case "stoic":
			temp.hp=15;
			temp.maxHp=15;
			temp.colour="grey";
			temp.tier=3;
			break;
		case "prince":
			temp.hp=11;
			temp.maxHp=11;
			temp.colour="grey";
			temp.tier=3;
			temp.spells=[getSpellByName("unite",id,index)];
			break;
		case "paladin":
			temp.hp=11;
			temp.maxHp=11;
			temp.colour="grey";
			temp.tier=3;
			break;
		case "cleric":
			temp.hp=8;
			temp.maxHp=8;
			temp.colour="grey";
			temp.tier=2;
			temp.spells=[getSpellByName("light",id,index)];
			break;
		case "poet":
			temp.hp=9;
			temp.maxHp=9;
			temp.colour="grey";
			temp.tier=3;
			temp.spells=[getSpellByName("clink",id,index)];
			break;
		case "bard":
			temp.hp=6;
			temp.maxHp=6;
			temp.colour="grey";
			temp.tier=2;
			temp.spells=[getSpellByName("else",id,index)];
			break;
		case "brigand":
		case "fighter":
		default:
			break;
	}
	temp.dice=structuredClone(diceTemplates[unit]).dice;
	temp.position=parseInt(pos);
	/*if (id==playerId) {
		temp.x=index*50;
	} else {
		temp.x=index*50+300;
	}*/
	if (id==playerId) {
				temp.x=index*SQUARE;
				temp.y=2*SQUARE;
			} else {
				temp.x=400+index*SQUARE;
				temp.y=2*50+id*2*50-2*50*(id>playerId);
			}
	temp.name=unit;
	dice[id][index]=temp;
}
const starting = ["veteran","veteran","veteran","veteran","veteran"];
var startingColours = ["yellow","yellow","yellow","grey","grey"];
socket.on("start",()=> {
	console.log("start");
	readyText.alpha=0;
	initDice();
	initMana();
	initSpells();
	processEquipment();
	gameState="inventory";
	age=0;
	/*for (var i in enemies) {
		enemyHpText[i] = new PIXI.Text(enemies[i].hp);
		enemyHpText[i].x=i*50;
		enemyHpText[i].y=50;

	app.stage.addChild(enemyHpText[i]);

	enemyBlockText[i] = new PIXI.Text(enemies[i].block);
	enemyBlockText[i].x=i*50;
	enemyBlockText[i].y=75;
	enemyBlockText[i].style.fill=0x888888;
	enemyBlockText[i].alpha=0;
	app.stage.addChild(enemyBlockText[i]);
	}*/
	/*if (host) {
		rollDice();
	}*/
});

var blindCheck = false;
socket.on("player turn",()=> {
	playerTurn=true;
	rerolls=2;
	/*for (var i in ownedDice) {
		ownedDice[i].used=false;
	}*/
	backupEnemies();
	/*for (var i in enemies) {
		initialEnemies[i]=structuredClone(enemies[i]);
	}*/
	//start of turn
	for (var i in dice) {
		for (var j in dice[i]) {
			dice[i][j].incoming=0;
			
			defend(i,j,dice[i][j].autoblock);
			
		}
	}
	calcIncoming();
	/*for (var i in enemies) {
		for (var j in enemies[i].targets) {
			var type = enemies[i].dice[enemies[i].side][0];
			var pips = enemies[i].dice[enemies[i].side][1];
			var keywords = enemies[i].dice[enemies[i].side][2];
			var cleave = false;
			for (var k in keywords) {
				switch (keywords[k]) {
					case "cleave":
						cleave=true;
						break;
				}
			}
			var id = enemies[i].targets[j][0];
			var index = enemies[i].targets[j][1];
				
				switch (type) {
					case "attack":
					case "outer":
						dice[id][index].incoming+=pips;
						if (cleave) {
							if (validDice(id,index-1)) {
								getDice(id,index-1).incoming+=pips;
							}
							if (validDice(id,index+1)) {
								getDice(id,index+1).incoming+=pips;
							}
						}
						break;
				}
		}
	}*/
	//if (host) {
		rollDice();
	//}
});
var deadTracker = [];
var culprit = -1;
socket.on("culprit",(id)=> {
	culprit=parseInt(id)+1;
});

function message(msg) {
	document.getElementById("textbox").value="";
	socket.emit("message",playerId,msg);
}
socket.on("message",(id,msg)=> {
	document.getElementById("history").innerHTML+="<b>Player "+(parseInt(id)+1)+":</b> "+msg+"<br />";
})
socket.on("send",(cmd)=> {
	switch(cmd) {
		case "update text":
			updateText();
			break;
		case "revert":
			if (!playerTurn) {
				break;
			}
			var allUnused = true;
			for (var i in dice) {
				for (var j in dice[i]) {
					if (dice[i][j].used) {
						allUnused=false;
					}
				}
			}

			if (allUnused) {
				socket.emit("unlock",playerId);
				document.getElementById("history").innerHTML+="<b>Player "+culprit+":</b> ";
				document.getElementById("history").innerHTML+="Unlock<br />";
				for (var i in dice[playerId]) {
					dice[playerId][i].locked=false;
				}
				locked=false;
			}
			break;
		case "undo":
			if (!playerTurn) {
				break;
			}
			if (actionQueue.length>0&&!actionQueue[actionQueue.length-1][4]) {
				actionQueue.splice(actionQueue.length-1,1);
				document.getElementById("history").innerHTML+="<b>Player "+culprit+":</b> ";
				document.getElementById("history").innerHTML+="Undo<br />";
				processQueue();
			}
			break;
		case "end turn":
			document.getElementById("history").innerHTML+="<b>Player "+culprit+"</b> ";
			document.getElementById("history").innerHTML+="ended turn<br />";
			removeTemporaryEffects();
			resolveAttacks();
			reposition();
			checkEnemyConditions();
			checkDead();
			if (blindCheck) {
				for (var i in enemies) {
					if (enemies[i].blind) {
						getDice(-2,i).dead=true;
					}
				}
			}
			resolvePoison();
			checkDead();
			removeBlock();
			locked=false;
			selectedId=-1;
			selectedUnit=-1;
			age++;
			/*for (var i in ownedDice) {
				//for (var i in ownedDice) {
					ownedDice[i].used=false;
					ownedDice[i].locked=false;
				//}
				
				actionQueue=[];
				for (var i in rolledDice) {
					rolledDice[i]=[0,0];
				}
			}*/
			for (var i in dice) {
				for (var j in dice[i]) {
					dice[i][j].used=false;
					dice[i][j].locked=false;
					dice[i][j].redirectId=-1;
					dice[i][j].redirectIndex=-1;
				}
			}
			for (var i in enemies) {
				enemies[i].redirectId=-1;
				enemies[i].redirectIndex=-1;
				enemies[i].ghost=false;
			}
			backup();
			//actionQueue=[];

			playerTurn=false;
			if (host) {
				enemyTurn=true;
			}
			break;
		case "upgrade":
			if (!host) {
				round++;
			}
			gameState="upgrade";
			processEquipment();
			updateText();
			for (var i in dice) {
				for (var j in dice[i]) {
					dice[i][j].used=false;
					dice[i][j].locked=false;
				}
			}
				upgradeSent = false;
			//actionQueue=[];
			upgrades=[];
			upgradeIndices=[];
			
			break;
		case "equipment":
			if (!host) {
				round++;
			}
			gameState="equipment";
			processEquipment();
			updateText();
			for (var i in dice) {
				for (var j in dice[i]) {
					dice[i][j].used=false;
					dice[i][j].locked=false;
				}
			}
				upgradeSent = false;
			//actionQueue=[];

			items=[];
			break;
		case "heal all":
			for (var i in dice) {
				for (var j in dice[i]) {
					if (!dice[i][j].dead) {
						//dice[i][j].hp=dice[i][j].maxHp;
					} else {
						deadTracker.push([i,j]);
						//dice[i][j].hp=Math.max(1,Math.floor(dice[i][j].maxHp/2));
					}
				}
			}
			break;
		case "resume":
			/*for (var i in deadTracker) {
				dice[deadTracker[i][0]][deadTracker[i][1]].hp=Math.max(1,Math.floor(dice[deadTracker[i][0]][deadTracker[i][1]].maxHp/2));
				console.log("oof");
			}*/
			/*for (var i in enemies) {
					enemyHpText[i] = new PIXI.Text(enemies[i].hp);
					enemyHpText[i].x=i*50;
					enemyHpText[i].y=150;

				app.stage.addChild(enemyHpText[i]);

				enemyBlockText[i] = new PIXI.Text(enemies[i].block);
				enemyBlockText[i].x=i*50;
				enemyBlockText[i].y=175;
				enemyBlockText[i].style.fill=0x888888;
				enemyBlockText[i].alpha=0;
				app.stage.addChild(enemyBlockText[i]);
			}*/

			initMana();
			processEquipment();
			initSpells();
			deadTracker=[];
			gameState="ingame";
			
			readyText.alpha=0;
			readySent = false;
			inventoryTurn=false;
			age=0;
			playerTurn=false;
			locked=false;
			if (host) {
				enemyTurn=true;
			}
			break;
	}
});
document.addEventListener('keypress', (event) => {
	if (event.key=="Enter") {
		var tempText = document.getElementById("textbox").value.trim();
		console.log(tempText);
		if (tempText!="") {
			message(tempText);
		}
	}
	if (gameState=="ingame"){
	if (locked) {
		/*if (event.key=='z') {
			console.log("undo");
			socket.emit("culprit",playerId);
			socket.emit("send","undo");
		}
		if (event.key=='e') {
			socket.emit("culprit",playerId);
			socket.emit("send","end turn");
		}
		if (event.key=='r') {
			socket.emit("culprit",playerId);
			socket.emit("send","revert");
		}*/
	} else if (playerTurn) {
		if (event.key=='k') {
			for (var i in enemies) {
				kill(-2,i);
			}
		}
		/*if (event.key=='a') {
			if (rollDice()) {
				rerolls--;
			}
		} else if (event.key=='l') {
			for (var i in dice[playerId]) {
				dice[playerId][i].locked=true;
			}
			socket.emit("lock",playerId);
			lockedText.alpha=1;
		}*/
	}
}
	if (gameState=="waiting") {
		if (event.key=='r') {
			//ready = true;
			//readyText.alpha=1;
		}
	}
	if (upgradeTurn) {
		if (event.key=='u') {
			if (upgrades.length>0) {
				socket.emit("init dice",0,0,upgrades[0]);
			}
			upgradeTurn=false;
			gameState="ugprade waiting";
			socket.emit("upgrade ready");
		} 
	}
});
var readyText = new PIXI.Text("READY");
readyText.x=0;
readyText.y=7*50;
readyText.alpha=0;
app.stage.addChild(readyText);

var lockedText = new PIXI.Text("LOCKED");
lockedText.x=0;
lockedText.y=7*50;
lockedText.alpha=0;
app.stage.addChild(lockedText);

var selectedUnit = -1;
var selectedIndex = -1;
var selectedId = -1;
var targettedUnit = -1;

var hoveringId = -1;
var hoveringIndex = -1;
var hoveringX = 0;
var hoveringY = 0;


document.addEventListener('mousemove', (event) => {
	var x = event.pageX-7;
	var y = event.pageY-7;
	hoveringX=x;
	hoveringY=y;
	hoveringId=-1;
	hoveringIndex=-1;
	for (var i in dice) {
		for (var j in dice[i]) {
			if (x>dice[i][j].x&&x<dice[i][j].x+dice[i][j].width&&y>dice[i][j].y&&y<dice[i][j].y+dice[i][j].height) {
				hoveringId = i;
				hoveringIndex = j;
				break;
			}
		}
	}
	for (var i in enemies) {
		if (x>enemies[i].x&&x<enemies[i].x+enemies[i].width&&y>enemies[i].y&&y<enemies[i].y+enemies[i].height) {
			hoveringId = -2;
			hoveringIndex = i;
			break;
		}
	}
	/*if (playerTurn&&gameState=="ingame") {
			for (var i in dice) {
				for (var j in dice[i]) {
					if (x>dice[i][j].x&&x<dice[i][j].x+dice[i][j].width&&y>dice[i][j].y&&y<dice[i][j].y+dice[i][j].height) {
						hoveringId = i;
						hoveringIndex = j;
						break;
					}
				}
			}
			for (var i in enemies) {
				if (x>enemies[i].x&&x<enemies[i].x+enemies[i].width&&y>enemies[i].y&&y<enemies[i].y+enemies[i].height) {
					hoveringId = -2;
					hoveringIndex = i;
					break;
				}
			}
	} else */
	for (var i in spells[playerId]) {
		if (i>=spellCoords.length) {
			continue;
		}
		if (pointInRect(x,y,spellCoords[i][0],spellCoords[i][1],SQUARE,SQUARE)) {
			hoveringId = -10;
			hoveringIndex = i;
		}
	}

	if (gameState=="upgrade") {
		for (var i in upgrades) {
			if (x>50*i&&x<50*i+50&&y>upY&&y<upY+50) {
				hoveringId = -3;
				hoveringIndex = i;
				break;
			}
		}
	}
	if (gameState=="equipment") {
		for (var i in items) {
			if (x>50*i&&x<50*i+50&&y>upY&&y<upY+50) {
				hoveringId = -5;
				hoveringIndex = i;
				break;
			}
		}
	}
	if (gameState=="inventory") {
		processInventoryCoords();
		for (var i in inventory) {
			if (pointInRect(x,y,inventoryCoords[i][0],inventoryCoords[i][1],SQUARE,SQUARE)) {
				hoveringId = -6;
				hoveringIndex = i;
				break;
			}
		}
	}
	if (validDice(hoveringId,hoveringIndex)) {
		document.getElementById("dice name").innerHTML=getDice(hoveringId,hoveringIndex).name;
		if (hoveringId>=0||hoveringId==-2) {
			var tempDice = getDice(hoveringId,hoveringIndex);
			var tempFace = getFace(hoveringId,hoveringIndex,tempDice.side);
			document.getElementById("dice name").innerHTML+=", "+tempFace[0]+" "+tempFace[1];
			var keywords = tempFace[2];
			for (var i in keywords) {
				var colour = "";
				if (keywordColours[keywords[i]]) {
					colour = keywordColours[keywords[i]].toString(16);
					if (colour.length<6) {
						var extra = 6-colour.length;
						for (var j=0; j<extra; j++) {
							colour = '0'+colour;
						}
					}
				}
				document.getElementById("dice name").innerHTML+=" <b style=\"color:#"+colour+"\">"+keywords[i]+"</b>";
			}
		}
			setInfo();
	} else {
		if (selectedId>=0||selectedId==-3||selectedId==-2) {
			var tempDice = getDice(selectedId,selectedIndex).dice;
			var tempUnit = getDice(selectedId,selectedIndex);
			var hoverSide = -1;
			if (pointInRect(x,y,netX,netY+SQUARE,SQUARE,SQUARE)) {
				hoverSide = 0;
			} else if (pointInRect(x,y,netX+SQUARE,netY+SQUARE,SQUARE,SQUARE)) {
				hoverSide = 1;
			} else if (pointInRect(x,y,netX+SQUARE,netY,SQUARE,SQUARE)) {
				hoverSide = 2;
			} else if (pointInRect(x,y,netX+SQUARE,netY+SQUARE*2,SQUARE,SQUARE)) {
				hoverSide = 3;
			} else if (pointInRect(x,y,netX+SQUARE*2,netY+SQUARE,SQUARE,SQUARE)) {
				hoverSide = 4;
			} else if (pointInRect(x,y,netX+SQUARE*3,netY+SQUARE,SQUARE,SQUARE)) {
				hoverSide = 5;
			} else if (pointInRect(x,y,netX+itemNetCoords[0][0],netY+itemNetCoords[0][1],SQUARE,SQUARE)) {
				hoverSide = -2;
			} else if (pointInRect(x,y,netX+itemNetCoords[1][0],netY+itemNetCoords[1][1],SQUARE,SQUARE)) {
				hoverSide = -3;
			}
			if (hoverSide>-1) {

				var tempFace = getFace(selectedId,selectedIndex,hoverSide);
				document.getElementById("dice name").innerHTML=tempFace[0]+" "+tempFace[1];
				var keywords = tempFace[2];
				for (var i in keywords) {
					var colour = "";
					if (keywordColours[keywords[i]]) {
						colour = keywordColours[keywords[i]].toString(16);
						if (colour.length<6) {
							var extra = 6-colour.length;
							for (var j=0; j<extra; j++) {
								colour = '0'+colour;
							}
						}
					}
					document.getElementById("dice name").innerHTML+=" <b style=\"color:#"+colour+"\">"+keywords[i]+"</b>";
				}
				
				hoveringId=-4;
			} else if (selectedId>=0) {
				if (hoverSide==-2) {
					if (tempUnit.equipment.length>=1) {
						document.getElementById("dice name").innerHTML=tempUnit.equipment[0];
					}
				} else if (hoverSide==-3) {
					if (tempUnit.equipment.length>=2) {
						document.getElementById("dice name").innerHTML=tempUnit.equipment[1];
					}
				}
				if (hoverSide!=-1) {
					hoveringId = -4;
				}
			}
			hoveringIndex = hoverSide;
			
			setInfo();
		} else if (selectedId==-10) {
			document.getElementById("dice name").innerHTML=spells[playerId][selectedIndex].name;
			setInfo();
		} else if (hoveringId==-5) {
			document.getElementById("dice name").innerHTML=items[hoveringIndex];
			setInfo();
		} else if (hoveringId==-6) {
			document.getElementById("dice name").innerHTML=inventory[hoveringIndex];
			setInfo();
		} else if (hoveringId==-10) {
			document.getElementById("dice name").innerHTML=spells[playerId][hoveringIndex].name;
			setInfo();
		}
	}
});

function pointInRect(x,y,rectX,rectY,width,height) {
	return (x>rectX&&x<rectX+width&&y>rectY&&y<rectY+height);
}

document.addEventListener('contextmenu', function(ev) {
	if (hoveringX>=0&&hoveringX<=800&&hoveringY>=0&&hoveringY<=600) {
    	ev.preventDefault();
	}
    return false;
}, false);
function onlyRangedLeft() {
	for (var i in enemies) {
		if (!enemies[i].dead&&!enemies[i].ranged) {
			return false;
		}
	}
	return true;
}
document.addEventListener('mouseup', (event) => {
	var x = event.pageX-7;
	var y = event.pageY-7;
	var hover = -1;
	if (gameState=="waiting") {
		if (pointInRect(x,y,readyButton.x,readyButton.y,readyButtonWidth,SQUARE)) {
				//ready = true;
				if (connected) {
					socket.emit("ready");
					readyText.alpha=1;
					return;
				}
			}
	}
	if (playerTurn&&gameState=="ingame") {
		if (locked) {
			if (pointInRect(x,y,endButton.x,endButton.y,endButtonWidth,SQUARE)) {
				socket.emit("culprit",playerId);
				socket.emit("send","end turn");
				return;
			} else if (pointInRect(x,y,unlockButton.x,unlockButton.y,unlockButtonWidth,SQUARE)) {
				socket.emit("culprit",playerId);
				socket.emit("send","revert");
				return;
			} else if (pointInRect(x,y,undoButton.x,undoButton.y,undoButtonWidth,SQUARE)) {
				socket.emit("culprit",playerId);
				socket.emit("send","undo");
				return;
			}
			/*for (var i in dice) {
				for (var j in dice[i]) {
					if (x>dice[i][j].x&&x<dice[i][j].x+dice[i][j].width&&y>dice[i][j].y&&y<dice[i][j].y+dice[i][j].height) {
						hoveringId = i;
						hoveringIndex = j;
						break;
					}
				}
			}
			for (var i in enemies) {
				if (x>enemies[i].x&&x<enemies[i].x+enemies[i].width&&y>enemies[i].y&&y<enemies[i].y+enemies[i].height) {
					hoveringId = -2;
					hoveringIndex = i;
				}
			}*/
			if (hoveringId!=-1) {
				if (selectedId != playerId && selectedId != -10) {
					if (hoveringId>=0||hoveringId==-2) {
						if (!getDice(hoveringId,hoveringIndex).used&&!getDice(hoveringId,hoveringIndex).dead) {
							selectedId=hoveringId;
							selectedIndex=hoveringIndex;
						}
					} else if (hoveringId==-10) {
						if (spellUsable(playerId,hoveringIndex)) {
							selectedId=hoveringId;
							selectedIndex=hoveringIndex;
						} else {
								console.log("USER IS DEAD!!");
								selectedId=-1;
								selectedIndex=-1;
						}
					}
				} else if (selectedId==playerId) {
					//targettedUnit = hover;
					if (validDiceList(hoveringId)) {
						if (!getDice(hoveringId,hoveringIndex).dead) {
							var tempDice = getDice(selectedId,selectedIndex);
							var tempTarget = getDice(hoveringId,hoveringIndex);
							var tempFace = getFace(selectedId,selectedIndex,tempDice.side);
							var keywords = tempFace[2];

							var heavy = false;
							var ranged = false;
							for (var i in keywords) {
								switch (keywords[i]) {
									case "ranged":
										ranged=true;
										break;
									case "heavy":
										heavy=true;
										break;
								}
							}

							var rangedCheck = true;
							var tempList = getDiceList(hoveringId);
							if (tempTarget.ranged&&!ranged) {
								for (var i in tempList) {
									if (!tempList[i].ranged&&!tempList[i].dead) {
										rangedCheck=false;
									}
								}
							}
							var heavyCheck = true;
							if (heavy) {
								if (hoveringId>=0) {
									var highestHp = 1;
									for (var i in dice[hoveringId]) {
										if (dice[hoveringId][i].dead) {
											continue;
										}
										highestHp = Math.max(highestHp,dice[hoveringId][i].hp);
									}
									if (highestHp!=dice[hoveringId][hoveringIndex].hp) {
										heavyCheck=false;
									}
								} else if (hoveringId==-2) {
									var highestHp=1;
									for (var i in enemies) {
										if (enemies[i].dead||(enemies[i].ranged&&!ranged&&!onlyRangedLeft())) {
											continue;
										}
										highestHp = Math.max(highestHp,enemies[i].hp);
									}
									if (highestHp!=enemies[hoveringIndex].hp) {
										heavyCheck=false;
									}
								} else {
									console.log("HOW");
								}
							}

							var stunCheck = true;
							if (tempFace[0]=="stun") {
								if (tempDice.hp<tempTarget.hp) {
									stunCheck=false;
								}
							}

							
							if (heavyCheck&&rangedCheck&&stunCheck) {
								socket.emit("action",selectedId,selectedIndex,hoveringId,hoveringIndex);
								if (tempTarget.caw) {
									tempTarget.ranged=true;
								}
							}
						}
					}
					//selectedUnit = -1;
					selectedId=-1;
					selectedIndex=-1;
					//targettedUnit = -1;
				} else if (selectedId == -10) {
					if (validDiceList(hoveringId)) {
						if (!getDice(hoveringId,hoveringIndex).dead) {
							if (isMeleeable(hoveringId,hoveringIndex)) {
								socket.emit("spell",playerId,selectedIndex,hoveringId,hoveringIndex);
							}
						}
					}
					selectedId=-1;
					selectedIndex=-1;
				}
			} else {
				selectedId=-1;
				selectedIndex=-1;
			}
		} else {
			if (event.button==2) {
				selectedId=hoveringId;
				selectedIndex=hoveringIndex;
			} else {
				selectedId=-1;
				selectedIndex=-1;
				for (var i in dice[playerId]) {
						if (x>dice[playerId][i].x&&x<dice[playerId][i].x+dice[playerId][i].width&&y>dice[playerId][i].y&&y<dice[playerId][i].y+dice[playerId][i].height) {
							dice[playerId][i].locked=!dice[playerId][i].locked;
							break;
						}
				}
				if (pointInRect(x,y,rerollButton.x,rerollButton.y,rerollButtonWidth,SQUARE)) {
					if (rollDice()) {
						rerolls--;
					}
				}
				if (pointInRect(x,y,lockButton.x,lockButton.y,lockButtonWidth,SQUARE)) {
					for (var i in dice[playerId]) {
						dice[playerId][i].locked=true;
					}
				}
				var allLocked=true;
				/*for (var i in ownedDice) {
					if (!ownedDice[i].locked) {
						allLocked=false;
						break;
					}
				}*/
				for (var i in dice[playerId]) {
					if (!dice[playerId][i].locked&&!dice[playerId][i].dead) {
						allLocked=false;
						break;
					}
				}
				if (allLocked) {
					lockedText.alpha=1;
					socket.emit("lock",playerId);
				} else {
					lockedText.alpha=0;
					socket.emit("unlock",playerId);
				}
			}
		}
	} else if (upgradeTurn||equipmentTurn) {
		if (hoveringId==-3||hoveringId==-5) {
			if (selectedId!=-3&&selectedId!=-5) {
				if (upgradeTurn) {
					selectedId=-3;
				} else {
					selectedId=-5;
				}
				selectedIndex=hoveringIndex;
			} else {
				if (selectedId==-3) {
					if (selectedIndex==hoveringIndex) {
						unequip(upgradeIndices[hoveringIndex]);
						socket.emit("init dice",playerId,upgradeIndices[hoveringIndex],upgrades[hoveringIndex]);
						
						gameState="upgrade waiting";
						selectedId=-1;
						selectedIndex=-1;
						socket.emit("upgrade ready");
					} else if (hoveringIndex>=0) {
						selectedIndex=hoveringIndex;
					} else {
						selectedId=-1;
						selectedIndex=-1;
					}
				} else {
					if (selectedIndex==hoveringIndex) {
						socket.emit("add to inventory",items[hoveringIndex]);
						equipmentTurn=false;
						gameState="equipment waiting";
						selectedId=-1;
						selectedIndex=-1;
						socket.emit("equipment ready");
					} else if (hoveringIndex>=0) {
						selectedIndex=hoveringIndex;
					} else {
						selectedId=-1;
						selectedIndex=-1;
					}
				}
			}
		}
	} else if (inventoryTurn) {
		console.log(hoveringIndex);
		if (selectedId==-6) {
			if (hoveringId==playerId&&getDice(playerId,hoveringIndex).equipment.length<getDice(playerId,hoveringIndex).maxEquipment) {
				socket.emit("equip",playerId,hoveringIndex,selectedIndex);
			}
			selectedId=-1;
			selectedIndex=-1;
		} else {
			if (hoveringId==-6) {
				selectedId=-6;
				selectedIndex = hoveringIndex;
			} else if (hoveringId==playerId) {
				//unequip
				if (event.button==0) {
					unequip(hoveringIndex);
				}
			}
		}
		if (pointInRect(x,y,readyButton.x,readyButton.y,readyButtonWidth,SQUARE)) {
				//ready = true;
				if (!readySent) {
					socket.emit("inventory ready");
					readyText.alpha=1;
					readySent=true;
				}
			}
	}
	if (event.button==2) {
				selectedId=hoveringId;
				selectedIndex=hoveringIndex;
			}
			if (hoveringId==-1) {
				selectedId=-1;
				selectedIndex=-1;
			}
});
var readySent=false;


var units = {
	fighter: {
		dice: [["attack", 2,[]],["attack", 2,[]],["attack", 1,[]], ["attack", 1,[]], ["defend", 1,[]],["defend", 1,[]]],
		hp: 5,
		maxHp: 5,
		block: 0,
		name: "fighter",
		used: false,
		x: 0,
		y: 0,
		width: 50,
		height: 50,
		locked: false,
		side: 0,
	},
};



var fights = {
	boar: {
		hp:7,
		maxHp:7,
		dice: [["attack",4,[]],["attack",4,[]],["attack",4,[]],["attack",4,[]],["outer",2,[]],["outer",2,[]]],
		block:0,
		x:0,
		y:0,
		width:50,
		height:50,
		targets:[],
		side:0,
		dead:false,
	}
}

var enemies = [];
var ownedDice = [structuredClone(units["fighter"]),structuredClone(units["fighter"]),
		structuredClone(units["fighter"]),structuredClone(units["fighter"]),structuredClone(units["fighter"])];
var dice = [];
var initialDice = [];
var previousDice = [0,0,0,0,0];
var initialEnemies=[0,0];

var mana = [];
var initialMana = [];

var initialRerolls=0;

var rolledDice = [[0,0],[0,0],[0,0],[0,0],[0,0]];
var yourTurn = false;
var locked = false;

var hpText = [];
var enemyHpText = [];
var incomingText = [];
var poisonText = [];

var blockText = [];
var enemyBlockText = [];
var enemyPoisonText = [];

var unownedDice = [];

var playerId=-1;

var playerTurn=false;

var gameState = "waiting";

var mobs = []; //mobs[size][stage][fight][index]

function init() {

	var en = ["boar","boar"];
	for (var i in diceTemplates) {
		diceTemplates[i].name=i;
	}
	for (var i=0; i<4; i++) {
		mobs.push([]);
		for (var j=0; j<6; j++) {
			mobs[i].push([]);
			for (var k=0; k<3; k++) {
				mobs[i][j].push([]);
			}
		}
	}
	for (var i in fightDiceTemplates) {
		for (var j=fightDiceTemplates[i].minRound; j<=fightDiceTemplates[i].maxRound; j++) {
			var earliestFight = 1;
			if (fightDiceTemplates[i].earliestFight&&j==fightDiceTemplates[i].minRound) {
				earliestFight = fightDiceTemplates[i].earliestFight;
			}
			for (var k=earliestFight; k<=3; k++) {
				mobs[fightDiceTemplates[i].size-1][j-1][k-1].push(i);
			}
		}
	}
	console.log(generateFight(12));
	//initEnemies(en);
	/*for (var i in hpText) {
		hpText[i] = new PIXI.Text(ownedDice[i].hp);
		hpText[i].x=i*50;
		hpText[i].y=50;

		blockText[i] = new PIXI.Text(ownedDice[i].block);
		blockText[i].x=i*50;
		blockText[i].y=75;
		blockText[i].style.fill=0x888888;
		blockText[i].alpha=0;
	app.stage.addChild(blockText[i]);

	app.stage.addChild(hpText[i]);
	}
	
	for (var i in ownedDice) {
		ownedDice[i].x=i*ownedDice[i].width;
		ownedDice[i].y=0;
	}
	for (var i in ownedDice) {
		previousDice[i]=structuredClone(ownedDice[i]);
	}*/
}

function initDice() {
	hpText=[];
	blockText=[];
	incomingText=[];
	poisonText=[];

	for (var i in dice) {
		hpText.push([]);
		blockText.push([]);
		incomingText.push([]);
		poisonText.push([]);
		for (var j in dice[i]) {
			hpText[i].push(new PIXI.Text(dice[i][j].hp));
			blockText[i].push(new PIXI.Text(dice[i][j].block));
			incomingText[i].push(new PIXI.Text(dice[i][j].incoming));
			poisonText[i].push(new PIXI.Text(dice[i][j].poison));
			if (i==playerId) {
				// lol this is all fake now
				hpText[i][j].x=j*50;
				hpText[i][j].y=3*50;

				blockText[i][j].x=j*50;
				blockText[i][j].y=3.5*50;
				blockText[i][j].style.fill=0x888888;
				blockText[i][j].alpha=0;

				incomingText[i][j].x=j*50+50/2;
				incomingText[i][j].y=3*50;
				incomingText[i][j].style.fill=0x888800;
				incomingText[i][j].alpha=0;

				poisonText[i][j].x=j*50+50/2;
				poisonText[i][j].y=3.5*50;
				poisonText[i][j].style.fill=0x008800;
				poisonText[i][j].alpha=0;
			} else {
				hpText[i][j].x=8*50+j*50;
				hpText[i][j].y=3*50+2*50*i-2*50*(i>playerId);

				blockText[i][j].x=8*50+j*50;
				blockText[i][j].y=3.5*50+2*50*i-2*50*(i>playerId);
				blockText[i][j].style.fill=0x888888;
				blockText[i][j].alpha=0;

				incomingText[i][j].x=j*50+8.5*50;
				incomingText[i][j].y=3*50+2*50*i-2*50*(i>playerId);
				incomingText[i][j].style.fill=0x888800;
				incomingText[i][j].alpha=0;

				poisonText[i][j].x=j*50+8.5*50;
				poisonText[i][j].y=3.5*50+2*50*i-2*50*(i>playerId);
				poisonText[i][j].style.fill=0x888800;
				poisonText[i][j].alpha=0;
			}

			app.stage.addChild(hpText[i][j]);
			app.stage.addChild(blockText[i][j]);
			app.stage.addChild(incomingText[i][j]);
			app.stage.addChild(poisonText[i][j]);
		}
	}
	/*for (var i in dice) {
		for (var j in dice[i]) {
			if (i==playerId) {
				dice[i][j].x=j*dice[i][j].width;
				dice[i][j].y=0;
			} else {
				dice[i][j].x=400+j*dice[i][j].width;
				dice[i][j].y=i*100-100*(i>playerId);
			}
			//initialDice[i][j]=structuredClone(dice[i][j]);
		}
	}*/
	updateText();
	//backupDice();
}

function initMana() {
	for (var i in dice) {
		mana[i]=[0,3];
	}
	// maybe some equipment shit
}

function initEnemies(en) {
	for (var i in en) {
		var enemy = {
			hp:1,
			dice: [["attack",1],["attack",1],["attack",1],["attack",1],["attack",1],["attack",1]],
			block:0,
			x:0,
			y:0,
			width:50,
			height:50,
		};
		switch(en[i]) {
			case "wolf":
			case "boar":
				enemy.hp=7;
				enemy.dice=[["attack",4],["attack",4],["attack",4],["attack",4],["outer",2],["outer",2]];
			default:
		}
	enemy.x=i*enemy.width;
	enemy.y=3*50;
	enemies.push(enemy);
	}
	for (var i in enemyHpText) {
		enemyHpText[i] = new PIXI.Text(enemies[i].hp);
		enemyHpText[i].x=i*50;
		enemyHpText[i].y=200;
		

	app.stage.addChild(enemyHpText[i]);
	}
}

function checkDying(unit) {
	return (unit.hp<=unit.poison+unit.incomingPoison-unit.regen+Math.max(0,unit.incoming-unit.block)||unit.dead);
}

function heavyTargetsAll(id) {
	var list=[];
	for (var i=0; i<dice[id].length; i++) {
		list.push(i);
	}
	return heavyTargets(id,list);
}

function totalIncoming(id, index) {
	var tempUnit = getDice(id,index);
	return tempUnit.incoming+tempUnit.incomingPoison+tempUnit.poison-tempUnit.regen;
}

function heavyTargets(id,list) {
	var targetIndices = [];
	if (list.length==0) {
		return [];
	}
	var highestHp = -1;
	if (id>=0) {
		for (var i in list) {
			/*if (dice[id][list[i]].dead) {
				continue;
			}*/
			if (i==0) {
				highestHp = dice[id][list[i]].hp-totalIncoming(id,list[i]);
			} else {
				highestHp = Math.max(highestHp,dice[id][list[i]].hp-totalIncoming(id,list[i]));
			}
		}
		for (var i in list) {
			if (dice[id][list[i]].hp-totalIncoming(id,list[i])==highestHp) {
				targetIndices.push(list[i]);
			}
		}
	}
	return targetIndices;
}

function isMeleeable(id, index) {
	var tempList = getDiceList(id);
	var hasRanged=false;
	for (var j in tempList) {
		if (tempList[j].ranged) {
			hasRanged=true;
		}
	}
	if (hasRanged) {
		var rangedCheck=true;
		for (var i in tempList) {
			if (!tempList[i].ranged&&!tempList[i].dead) {
				rangedCheck = false;
			}
		}
		if (rangedCheck) { //allowed to hit ranged
			return true;
		} else {
			if (!tempList[index].ranged) {
				return true;
			}
			return false;
		}
	} else {
		return true;
	}
}

function isHeavyable(id, index) {
	if (id>=0) {
		var highestHp = 1;
		for (var i in dice[id]) {
			if (dice[id][i].dead) {
				continue;
			}
			highestHp = Math.max(highestHp,dice[id][i].hp);
		}
		if (highestHp!=dice[id][index].hp) {
			return false;
		}
	} else if (id==-2) {
		var highestHp=1;
		for (var i in enemies) {
			if (enemies[i].dead||(enemies[i].ranged&&!ranged&&!onlyRangedLeft())) {
				continue;
			}
			highestHp = Math.max(highestHp,enemies[i].hp);
		}
		if (highestHp!=enemies[index].hp) {
			return false;
		}
	} else {
		console.log("HOW");
		return false;
	}
	return true;
}

function eliminateTargets(id,list) {
	var targetIndices = [];
	var lowestHp = -1;
	if (id>=0) {
		for (var i in list) {
			/*if (dice[id][list[i]].dead) {
				continue;
			}*/
			if (i==0) {
				lowestHp = dice[id][list[i]].hp-totalIncoming(id,list[i]);
			} else {
				lowestHp = Math.min(lowestHp,dice[id][list[i]].hp-totalIncoming(id,list[i]));
			}
		}
		console.log("eliminate "+lowestHp);
		for (var i in list) {
			if (dice[id][list[i]].hp-totalIncoming(id,list[i])==lowestHp) {
				targetIndices.push(list[i]);
			}
		}
	}
	return targetIndices;
}

function intersection(a,b) {
	var inter = [];
	for (var i in a) {
		if (b.includes(a[i])) {
			inter.push(a[i]);
		}
	}
	return inter;
}

function enemyRoll() {
	for (var i in enemies) {
		if (enemies[i].dead) {
			continue;
		}
		var roll = Math.floor(Math.random()*6);
		var type = enemies[i].dice[roll][0];
		var pips = enemies[i].dice[roll][1];
		var keywords = enemies[i].dice[roll][2];
		var tempFace = getFace(-2,i,roll);
		type = tempFace[0];
		pips = tempFace[1];
		keywords = tempFace[2];

		var dyingTeams = [];
		var dyingUnits = [];
		var deadTeams = [];
		var deadUnits = [];
		for (var j in dice) {
			var dying = true;
			var dead=true;
			deadUnits.push([]);
			dyingUnits.push([]);
			for (var k in dice[j]) {
				var dyingSingle = true;
				var deadSingle=true;
				if (!checkDying(dice[j][k])) {
					dying=false;
					dyingSingle=false;
				}
				if (!dice[j][k].dead) {
					dead=false;
					deadSingle=false;
				}
				deadUnits[j].push(deadSingle);
				dyingUnits[j].push(dyingSingle);
			}
			deadTeams.push(dead);
			dyingTeams.push(dying);
		}

		var notDyingIndices = [];
		var notDeadIndices = []

		for (var j in dice) {
			if (!dyingTeams[j]) {
				notDyingIndices.push(j);
			}
			if (!deadTeams[j]) {
				notDeadIndices.push(j);
			}
		}

		var targetId=-1;

		if (notDyingIndices.length>0) {
			targetId = notDyingIndices[Math.floor(Math.random()*(notDyingIndices.length))];
		} else if (notDeadIndices.length>0) {
			targetId = notDeadIndices[Math.floor(Math.random()*(notDeadIndices.length))];
		} else {
			console.log("HOW IS EVERYONE DEAD");
			targetId = Math.floor(Math.random()*dice.length);
		}

		
		var tempType = type;
		var typeCheck = tempType.split(" ");
		var summonType = "";

		if (typeCheck[0]=="summon") {
			tempType = "summon";
			summonType = typeCheck[1];
		}
		switch(tempType) {
			case "attack":
				var notDyingUnitsIndices = [];
				var notDeadUnitsIndices = [];
				for (var j in dice[targetId]) {
					if (!dyingUnits[targetId][j]) {
						notDyingUnitsIndices.push(j);
					}
					if (!deadUnits[targetId][j]) {
						notDeadUnitsIndices.push(j);
					}
				}

				var targetIndex = -1;
				/*if (notDyingUnitsIndices.length>0) {
					targetIndex = notDyingUnitsIndices[Math.floor(Math.random()*notDyingUnitsIndices.length)];
				} else if (notDeadIndices.length>0) {
					targetIndex = notDeadUnitsIndices[Math.floor(Math.random()*(notDeadUnitsIndices.length))];
				} else {
					console.log("HOW IS EVERYONE DEAD");
					targetIndex = Math.floor(Math.random()*dice[targetId].length);;
				}*/
				
				if (!keywords.includes("heavy")&&!keywords.includes("eliminate")) {
					if (notDyingUnitsIndices.length>0) {
						targetIndex = notDyingUnitsIndices[Math.floor(Math.random()*(notDyingUnitsIndices.length))];
					} else if (notDeadUnitsIndices.length>0) {
						targetIndex = notDeadUnitsIndices[Math.floor(Math.random()*(notDeadUnitsIndices.length))];
					}
					if (targetIndex!=-1) {
						sendTarget(i,targetId,targetIndex)
					}
				} else {
					var heavyIndices = heavyTargets(targetId,notDeadUnitsIndices);
					var eliminateIndices = eliminateTargets(targetId,notDeadUnitsIndices);
					if (keywords.includes("heavy")) {
						notDeadUnitsIndices = intersection(notDeadUnitsIndices,heavyIndices);
					}
					if (keywords.includes("eliminate")) {
						notDeadUnitsIndices = intersection(notDeadUnitsIndices,eliminateIndices);
					}
					if (notDeadUnitsIndices.length>0) {
						targetIndex = notDeadUnitsIndices[Math.floor(Math.random()*(notDeadUnitsIndices.length))];
					}
					if (targetIndex!=-1) {
						sendTarget(i,targetId,targetIndex)
					}
				}
				//socket.emit("enemy target",i,targetId,targetIndex);
				//enemies[i].targets.push([parseInt(targetId),parseInt(targetIndex)]);
				//getDice(targetId,targetIndex).incoming+=pips;
				break;
			case "outer":
				var uppermost = -1;
				for (var j in dice[targetId]) {
					uppermost++;
					if (!dice[targetId][j].dead) {
						break;
					}
				}

				var lowermost = dice[targetId].length;
				for (var j in dice[targetId]) {
					lowermost--;
					if (!dice[targetId][dice[targetId].length-1-j].dead) {
						break;
					}
				}
				sendTarget(i,targetId,uppermost);
				//socket.emit("enemy target",i,targetId,uppermost);
				//getDice(targetId,uppermost).incoming+=pips;
				if(lowermost!=uppermost) {
					sendTarget(i,targetId,lowermost);
					//socket.emit("enemy target",i,targetId,lowermost);
					//getDice(targetId,lowermost).incoming+=pips;
				}
				break;
			case "attack all":
				for (var j in dice[targetId]) {
					if (!dice[targetId][j].dead) {
						sendTarget(i,targetId,j);
					}
				}
				break;
			case "attack all all":
				for (var j in dice) {
					for (var k in dice[j]) {
						if (!dice[j][k].dead) {
							sendTarget(i,j,k);
						}
					}
				}
				break;
			case "summon":
			default:
				break;
		}
		socket.emit("enemy roll",i,roll);
		enemies[i].side=roll;
		calcIncoming();
	}
}

function sendTarget(i,targetId,targetIndex) {
	if (!host) {
		console.log("HOW ARE YOU NOT HOST");
		return;
	}
	socket.emit("enemy target",i,targetId,targetIndex);
	enemies[i].targets.push([parseInt(targetId),parseInt(targetIndex)]);
}

function rollDice() {
	if(rerolls<=0) {return false;}
	var rolls = [];
	for (var i in dice[playerId]) {
		//var d = dice[playerId][i];
		var roll = Math.floor(Math.random()*6);
		if (!dice[playerId][i].locked&&!dice[playerId][i].dead)
		{rolls.push([i,roll]);}
	}
	if (rolls.length==0) {
		return false;
	}
	socket.emit("roll",playerId,rolls);
	console.log("roll!");
	return true;
	
		//socket.emit("lock");
}

var focusTargetId = -1;
var focusTargetIndex = -1;
var focusKeywords = [];
var focusPips = 0;
var ignoreCleave = false;
function getRedirectedTarget(targetId,targetIndex) {
	var originalTargetId = targetId;
	var originalTargetIndex = targetIndex;
	if (targetId==-1) {
		return [targetId,targetIndex];
	}
	var target = getDice(targetId,targetIndex);
	var counter=0;
	while (target.redirectId!=-1&&counter<10) {
		targetId = target.redirectId;
		targetIndex = target.redirectIndex;
		//target = getDice(targetId,targetIndex);
		if (targetId==originalTargetId&&targetIndex==originalTargetIndex) {
			break;
		}
		target = getDice(targetId,targetIndex);
		counter++;
		if (counter==10) {
			console.log("how the fuck");
		}
	}
	return [targetId,targetIndex];
}
function useSpell(id,index,targetId,targetIndex) {
	var name = spells[id][index].name;
	var keywords = spells[id][index].keywords;
	if (keywords.includes("singleCast")) {
		spells[id][index].singleCast = true;
	}
	switch (name) {
		case "burst":
			if (targetId==-2) {
				hurt(-2,targetIndex,2);
			} else {
				defend(targetId,targetIndex,2);
			}
			break;
		case "parry":
			defend(targetId,targetIndex,3);
			break;
		case "formation":
			for (var i in enemies) {
				hurt(-2, i, 2);
			}
			for (var i in dice[playerId]) {
				defend(playerId,i,2);
			}
			break;
		case "unite":
			hurt(targetId,targetIndex,15);
			break;
		case "flare":
			hurt(targetId,targetIndex,4);
			break;
		case "light":
			faceAction(["defend",1,["cleave","cleanse"]],id,spells[id][index].userIndex,targetId,targetIndex,);
			break;
		case "clink":
			for (var i in dice[playerId]) {
				defend(playerId,i,1);
				for (var j in dice[playerId][i].tempBuff) {
					dice[playerId][i].tempBuff[j]++;
				}
			}
			break;
		case "else":
			defend(targetId,targetIndex,1);
			cleanse(targetId,targetIndex,1);
			break;
	}
	var lethal = checkDead();
}
function action(userId,userIndex,targetId,targetIndex) {
	var user = getDice(userId,userIndex);
	faceAction(getFace(userId,userIndex,user.side),userId,userIndex,targetId,targetIndex);
}

function faceAction(face,userId,userIndex,targetId,targetIndex) {
	var user = getDice(userId,userIndex);
	var oldId = targetId;
	var oldIndex = targetIndex;
	[targetId,targetIndex] = getRedirectedTarget(targetId,targetIndex);
	if (getDice(targetId,targetIndex).ghost) {
		return;
	}
	
	/*var originalTargetId = targetId;
	var originalTargetIndex = targetIndex;
		while (target.redirectId!=-1) {
			targetId = target.redirectId;
			targetIndex = target.redirectIndex;
			target = getDice(targetId,targetIndex);
			if (targetId==originalTargetId&&targetIndex==originalTargetIndex) {
				break;
			}
		}*/
	if (user.exert>0||user.singleUse[user.side]||user.petrify[user.side]) {
		return;
	}
	//var type = die[side][0];
	//var pips = die[side][1];
	//var originalPips = pips;
	//var keywords = structuredClone(die[side][2]);

	var tempFace = face;
	var type = tempFace[0];
	var pips = tempFace[1];
	var keywords = tempFace[2];

	/*if (user.duplicate[0]!=0) {
		console.log("sheep")
		type=user.duplicate[0];
		pips=user.duplicate[1];
		keywords = structuredClone(user.duplicate[2]);
	}*/
	var effects = structuredClone(effectsTemplate);
	/*var cleave = false;
	var pain=false;
	var selfshield=false;
	var pristine=false;
	var focus=false;
	var poison = false;
	var death = false;
	var guilt = false;
	var engage = false;
	var steel = false;
	var exert = false;
	var growth = false;
	var rampage = false;
	var singleUse = false;
	var bloodlust = false;
	var deathwish = false;
	var chain = false;
	var duplicate = false;
	var defy = false;
	var era = false;
	var copycat = false;
	var smith = false;
	var descend = false;*/
	for (var idx in keywords) {
		effects[keywords[idx]] = true;
		/*switch (keywords[idx]) {
			case "cleave":
				cleave=true;
				break;
			case "pain":
				pain=true;
				break;
			case "selfshield":
				selfshield=true;
				break;
			case "pristine":
				pristine=true;
				break;
			case "focus":
				focus=true;
				break;
			case "poison":
				poison=true;
				break;
			case "death":
				death=true;
				break;
			case "guilt":
				guilt = true;
				break;
			case "engage":
				engage = true;
				break;
			case "steel":
				steel = true;
				break;
			case "exert":
				exert = true;
				break;
			case "growth":
				growth = true;
				break;
			case "rampage":
				rampage = true;
				break;
			case "singleUse":
				singleUse = true;
				break;
			case "bloodlust":
				bloodlust = true;
				break;
			case "deathwish":
				deathwish = true;
				break;
			case "chain":
				chain = true;
				break;
			case "duplicate":
				duplicate = true;
				break;
			case "defy":
				defy = true;
				break;
			case "era":
				era = true;
				break;
			case "copycat":
				copycat = true;
				break;
			case "smith":
				smith = true;
				break;
			case "descend":
				descend = true;
				break;
		}*/
	}
	/*pips+=user.keywordModifiers[side];
	if (steel) {
		pips+=user.block;
	}
	if (defy) {
		pips+=Math.max(0,user.incoming-user.block);
	}
	if (bloodlust) {
		for (var i in enemies) {
			if (enemies[i].hp<enemies[i].maxHp) {
				pips++;
			}
		}
	}
	if (pristine) {
		if (user.hp==user.maxHp) {
			pips*=2;
		}
	}
	if (focus) {
		if (focusTargetId==targetId&&focusTargetIndex==targetIndex) {
			pips*=2;
		}
	}
	if (engage) {
		if (target.hp==target.maxHp) {
			pips*=2;
		}
	}
	if (deathwish) {
		if (checkDying(user)) {
			pips*=2;
		}
	}*/
	//pip calculation starts here
	pips = getPips(type,pips,keywords,userId,userIndex);
	if (targetId!=-1) {
		var target = getDice(targetId,targetIndex);
		if (effects.focus) {
			if (focusTargetId==targetId&&focusTargetIndex==targetIndex) {
				pips*=2;
			}
		}
		if (effects.engage) {
			if (target.hp==target.maxHp) {
				pips*=2;
			}
		}
	}

	//pip calculation stops here
	pips = Math.max(pips,0);
	if (effects.doubleUse) {
		user.doubleUseCount++;
		if (user.doubleUseCount<2) {
			user.doubleUse=true;
		} else {
			user.doubleUse=false;
		}
	}
	if (targetId!=-1) {
		var targetAll = false;
		var allType = "";
		if (type.split(" ").length>1) {
			if (type.split(" ")[1]=="all") {
				targetAll = true;
				allType = type.split(" ")[0]
			}
		}
		if (targetAll&&userId!=-2) {
			if (oldId==-2) {
				for (var i in enemies) {
					if (i!=oldIndex) {
						[tempId,tempIndex] = getRedirectedTarget(oldId,i);
						if (!getDice(tempId,tempIndex).dead)
						{act(allType,pips,userId,userIndex,tempId,tempIndex,keywords);}
					}
				}
			} else if (oldId>=0) {
				for (var i in dice[oldId]) {
					if (i!=oldIndex) {
						[tempId,tempIndex] = getRedirectedTarget(oldId,i);
						if (!getDice(tempId,tempIndex).dead)
						{act(allType,pips,userId,userIndex,tempId,tempIndex,keywords);}
					}
				}
			}
		}
		

		if (effects.cleave||effects.descend){
			console.log(targetId)
			/*var nextUp = targetIndex-1;
			while (nextUp>=0&&effects.cleave) {
				if (!getDice(targetId,nextUp).dead) {
					act(type,Math.max(0,pips),userId,userIndex,targetId,nextUp,keywords);
					break;
				}
				nextUp--;
			}
			var nextDown = targetIndex+1;
			var highest;
			if (targetId == -2) {
				highest = enemies.length-1;
			} else {
				highest = dice[targetId].length-1;
			}
			while (nextDown<=highest) {
				if (!getDice(targetId,nextDown).dead) {
					act(type,Math.max(0,pips),userId,userIndex,targetId,nextDown,keywords);
					break;
				}
				nextDown++;
			}*/
			/*var upCounter = oldIndex-1;
			while (upCounter>=0&&effects.cleave) {
				[newId,nextUp]=getRedirectedTarget(oldId,upCounter);
				if (!getDice(newId,nextUp).dead) {
					act(type,Math.max(0,pips),userId,userIndex,newId,nextUp,keywords);
					break;
				}
				upCounter--;
			}
			var downCounter = oldIndex+1;
			var highest;
			if (oldId == -2) {
				highest = enemies.length-1;
			} else {
				highest = dice[oldId].length-1;
			}
			while (downCounter<=highest) {
				[newId,nextDown] = getRedirectedTarget(oldId,downCounter);
				if (!getDice(newId,nextDown).dead) {
					act(type,Math.max(0,pips),userId,userIndex,newId,nextDown,keywords);
					break;
				}
				downCounter++;
			}*/
			var upper,lower;
			[upper,lower] = cleaveIndices(oldId,oldIndex);
			if (upper!=-1&&effects.cleave) {
				[newId,newIndex] = getRedirectedTarget(oldId,upper);
				act(type,Math.max(0,pips),userId,userIndex,newId,newIndex,keywords);
			}
			if (lower!=-1) {
				[newId,newIndex] = getRedirectedTarget(oldId,lower);
				act(type,Math.max(0,pips),userId,userIndex,newId,newIndex,keywords);
			}
		}
	}
	if (effects.selfshield) {
		defend(userId,userIndex,pips);
	}
	if (effects.selfheal) {
		heal(userId,userIndex,pips);
	}
	if (effects.vitality) {
		getDice(targetId,targetIndex).maxHp+=pips;
	}
	if (effects.manaGain) {
		gainMana(userId,pips);
	}

	act(type,pips,userId,userIndex,targetId,targetIndex,keywords);

	if (effects.pain) {
		hurt(userId,userIndex,pips);
	}
	var lethal = false;
	if (effects.death) {
		if (!lethal){lethal = kill(userId,userIndex);}
		//user.dead=true;
	}
	
	if (effects.duplicate) {
		if (userId<0) {
			console.log("wtf");
		} else {
			for (var i in dice[userId]) {
				if (i != userIndex) {
					console.log(userId);
					console.log(i);
					dice[userId][i].duplicate=true;//structuredClone(user.dice[side]);
					dice[userId][i].duplicateFace=structuredClone(user.dice[side]);
					//dice[userId][i].dice[dice[userId][i].side]=structuredClone(user.dice[side]);
				}
			}
		}
	}



	if (effects.exert) {
		user.exert=2;
	}
	if (effects.singleUse) {
		user.singleUse[user.side]=true;
	}

	lethal = checkDead();
	/*for (var index in dice) {
		for (var jndex in dice[index]) {
			if (dice[index][jndex].hp<=0) {
				if (!dice[index][jndex].dead) {
					lethal=true;
				}
				dice[index][jndex].dead=true;
			}
		}
	}

	for (var index in enemies) {
		if (enemies[index].hp<=0) {
			if (!enemies[index].dead) {
				lethal=true;
			}
			enemies[index].dead=true;
		}
	}*/
	if (effects.guilt&&lethal) {
		kill(userId,userIndex);
		//user.dead=true;
	}
	if (effects.growth) {
		user.keywordModifiers[user.side]++;
	}
	if (lethal) {
		if (effects.rampage) {
			user.rampage=true;
		}
	}
}
var effectsTemplate = { cleave: false,
	 pain:false,
	 selfshield:false,
	 pristine:false,
	 focus:false,
	 poison : false,
	 death : false,
	 guilt : false,
	 engage : false,
	 steel : false,
	 exert : false,
	 growth : false,
	 rampage : false,
	 singleUse : false,
	 bloodlust : false,
	 deathwish : false,
	 chain : false,
	 duplicate : false, //
	 defy : false,
	 era : false,
	 copycat : false,
	 smith : false, //
	 descend : false,};
var piplessActions = ["inflict","nothing","stun","reuse","undying"]
function getPips(type,pips,keywords,userId,userIndex) {
	if (piplessActions.includes(type.split(" ")[0])) {
		return 0;
	}
	var user = getDice(userId,userIndex);
	var effects = structuredClone(effectsTemplate);
	/*var type = dice[side][0];
	var pips = dice[side][1];
	var originalPips = pips;
	var keywords = dice[side][2];*/
	for (var i in keywords) {
		effects[keywords[i]] = true;
	}
	/*if (effects.copycat) {
		for (i in focusKeywords) {
			effects[focusKeywords[i]] = true;
		}
	}*/
	pips+=user.keywordModifiers[user.side]; // NOT 7: in combat buffs this is still 8: keywords

	// 8: static keywords
	if (effects.steel) {
		pips+=user.block;
	}
	if (effects.defy) {
		pips+=Math.max(0,user.incoming-user.block);
	}
	if (effects.era) {
		pips+=age;
	}
	if (effects.charged){
		pips+=mana[userId][0];
	}
	if (effects.bloodlust) {
		for (var i in enemies) {
			if (enemies[i].hp<enemies[i].maxHp&&!enemies[i].dead) {
				pips++;
			}
		}
	}
	if (effects.pristine) {
		if (user.hp==user.maxHp) {
			pips*=2;
		}
	}
	if (effects.deathwish) {
		if (checkDying(user)) {
			pips*=2;
		}
	}
	if (effects.chain) {
		for (i in focusKeywords) {
			if (effects[focusKeywords[i]]) {
				pips*=2;
				break;
			}
		}
	}
	if (effects.inspired) {
		if (pips<focusPips) {
			pips*=2;
		}
	}
	return pips;
}

function act(type,pips,userId,userIndex,targetId,targetIndex,keywords) {
	var user = getDice(userId,userIndex);
	var target = getDice(targetId,targetIndex);
	if (validDice(targetId,targetIndex)&&targetId!=3) {
		if (target.dead) {
			return;
		}
	}
	for (var idx in keywords) {
		var mainWord = keywords[idx].split(" ")[0];
		switch (mainWord) {
			case "poison":
				var incoming = pips-target.cleanseBuffer[0];
				if (incoming>0) {
					target.cleanseBuffer[0]=0;
					target.poison+=incoming;
				} else {
					target.cleanseBuffer[0]-=pips;
				}
				break;
			case "regen":
				target.regen+=pips;
				break;
			case "petrify":
				var incoming = pips-target.cleanseBuffer[3];
				if (incoming>0) {
					var petrifyCounter=incoming;
					target.petrifyCount+=incoming;
					target.cleanseBuffer[3]=0;
					for (var i=0; i<petrifyOrder.length; i++) {
						if (!target.petrify[petrifyOrder[i]]) {
							target.petrify[petrifyOrder[i]] = true;
							petrifyCounter--;
						}
						if (petrifyCounter<=0) {
							break;
						}
					}
				} else {
					target.cleanseBuffer[3]-=pips;
				}
				
				
				break;
			case "weaken":
				/*for (var i=0; i<target.tempBuff.length;i++) {
					target.tempBuff[i]-=pips;
				}*/
				var incoming = pips-target.cleanseBuffer[1];
				if (incoming>0) {
					target.cleanseBuffer[1]=0;
					target.weaken+=incoming;
				} else {
					target.cleanseBuffer[1]-=pips;
				}
				break;
			case "inflict":
				if (target.cleanseBuffer[2]==0) {
					target.tempKeywords.push(keywords[idx].split(" ")[1]);
				} else {
					target.cleanseBuffer[2]--;
				}
				break;
			case "cleanse":
				cleanse(targetId,targetIndex,pips);
				break;
			case "repel":
				repel(targetId,targetIndex,pips);
				break;
		}
	}
	var tempType = type;
	var typeCheck = tempType.split(" ");
	var summonType = "";
	var inflictList = [];
	tempType = typeCheck[0];

	if (tempType=="summon") {
		summonType = typeCheck[1];
	}
	if (tempType=="inflict") {
		inflictList = structuredClone(typeCheck);
		inflictList.splice(0,1);
	}
	if (targetId==-2) {
		if (target.basilisk) {
			if (!user.petrify[user.side]) {
				user.petrify[user.side]=true;
				user.petrifyCount++;
			}
		}
	}
	switch (tempType) {
		case "attack":
		case "outer":
		case "attack all":
		case "attack all all":
			hurt(targetId,targetIndex,Math.max(0,pips-target.armour));
			hurt(userId,userIndex,target.thorns);
			break;
		case "defend":
			defend(targetId,targetIndex,pips);
			break;
		case "defendheal":
			defend(targetId,targetIndex,pips);
			heal(targetId,targetIndex,pips);
			break;
		case "stun":
			if(user.hp>=target.hp) {
				stun(targetId,targetIndex);
			}
			break;
		case "reuse":
			if (targetId>=0) {
				target.used=false;
			}
			break;
		case "redirect":
			target.redirectId=userId;
			target.redirectIndex=userIndex;
			break;
		case "summon":
			if (userId!=-2) {
				console.log("BRUH!!!");
			} else {
				summonEnemy(summonType,pips,user.position);
			}
			break;
		case "selfheal":
			console.log("self heal")
			heal(userId,userIndex,pips);
			break;
		case "undying":
			target.undying=true;
			break;
		case "inflict":
			for (var i in inflictList) {
				target.tempKeywords.push(inflictList[i]);
			}
			break;
		case "mana":
			gainMana(userId,pips);
			break;
		case "reroll":
			if (!locked) {
				console.log(rerolls);
				rerolls+=pips;
				console.log(rerolls);
			}
			break;
	}
}
function gainMana(id,pips) {
	mana[id][0]+=pips;
}

function stun(id,index) {
	var target = getDice(id,index);
	if (id>=0) {
		target.used=true;
	}
	if (id==-2) {
		target.targets=[];
	}
	target.stun=true;
}
function heal(id,index,pips) {
	var tempUnit = getDice(id,index);
	tempUnit.hp+=pips;
	tempUnit.hp=Math.min(tempUnit.maxHp,tempUnit.hp);
}
function defend(id,index,pips) {
	var tempUnit = getDice(id,index);
	tempUnit.block+=pips;
}
function repel(id,index,pips) {
	if (id<0) {
		return;
	}
	var targetters = getTargetters(id,index);
	for (var i in targetters) {
		hurt(-2,targetters[i],pips);
	}
}
function cleanse(id,index,pips) {
	var tempUnit = getDice(id,index);
	cleanseBuffer = tempUnit.cleanseBuffer;
	cleanseBuffer[0]+=Math.max(0,pips-tempUnit.poison);
	tempUnit.poison-=pips;
	tempUnit.poison=Math.max(0,tempUnit.poison);
	cleanseBuffer[1]+=Math.max(0,pips-tempUnit.weaken);
	tempUnit.weaken-=pips;
	tempUnit.weaken=Math.max(0,tempUnit.weaken);
	var inflictPips = Math.min(tempUnit.tempKeywords.length,pips);
	cleanseBuffer[2]+=Math.max(0,pips-tempUnit.tempKeywords.length);
	tempUnit.tempKeywords.splice(tempUnit.tempKeywords.length-inflictPips,inflictPips);
	cleanseBuffer[3]+=Math.max(0,pips-tempUnit.petrifyCount);
	tempUnit.petrifyCount-=pips;
	tempUnit.petrifyCount=Math.max(0,tempUnit.petrifyCount);
	if (tempUnit.petrifyCount==0) {
		tempUnit.petrify = [false,false,false,false,false,false];
	} else {
		var unpetrifyCounter = pips;
		for (var i=petrifyOrder.length-1; i>=0; i--) {
			if (tempUnit.petrify[petrifyOrder[i]]) {
				unpetrifyCounter--;
				tempUnit.petrify[petrifyOrder[i]] = false;
			}
			if (unpetrifyCounter==0) {
				break;
			}
		}
	}
}

function summonEnemy(type,pips,position) {
	for (var i in enemies) {
		if (enemies[i].position>position) {
			enemies[i].position+=pips;
		}
	}
	for (var i=0; i<pips; i++) {
		spawnEnemy(type,position+1+i);
		console.log("added in "+(position+1+i));
	}
	reposition();
}

function validDice(id,index) {
	if (id!=-3&&id!=-2&&id<0) {
		return false;
	}
	if (id==-3) {
		if (0<=index&&index<upgrades.length) {
			return true;
		} else {
			return false;
		}
	} else if (id==-2) {
		if (0<=index&&index<enemies.length)
		{return true;}
		else{return false;}
	} else {
		if (0<=index && index<dice[id].length)
		{return true;}
		else{return false;}
	}
}

function getDice(id,index) {
	if (!validDice(id,index)) {
		console.log("HOW");
		return false;
	}
	if (id==-3) {
		if (0<=index&&index<upgrades.length) {
			return diceTemplates[upgrades[index]];
		} else {
			return false;
		}
	} else if (id==-2) {
		if (0<=index&&index<enemies.length)
		{return enemies[index];}
		else{return false;}
	} else {
		if (0<=index && index<dice[id].length)
		{return dice[id][index];}
		else{return false;}
	}
}

function getDiceList(id) {
	if (!validDiceList(id)) {
		console.log("HOW");
		return false;
	}
	if (id==-2) {
		return enemies;
	} else if (id>=0) {
		return dice[id];
	} else {
		return false;
	}
}


function getFace(id,index,side) { // 3: apply blessings/curses, then 4,5: equipment, then 6: e.g. warchief buff?
	if (id==-3) {
		return getDice(id,index).dice[side];
	}
	index = parseInt(index);
	var tempUnit = structuredClone(getDice(id,index));
	var tempDice = structuredClone(getDice(id,index).dice);
	var originalSide = tempDice[side];
	var tempFace = tempDice[side];
	var equipment = tempUnit.equipment;
	
	//4,5
	for (var i in equipment) {
		for (var j in tempDice) {
			if (piplessActions.includes(tempDice[j][0].split(" ")[0])) {
				tempDice[j][1]=0;
			}
		}
		switch (equipment[i]) {
			case "longsword":
				tempDice[0] = ["attack",3,[]];
				tempDice[1] = ["attack",3,[]];
				tempDice[4] = ["attack",3,[]];
				tempDice[5] = ["attack",3,[]];
				break;
			case "doom blade":
				for (var j in tempDice) {
					if (tempDice[j][0]=="nothing") {
						tempDice[j] = ["attack",3,["death"]];
					}
				}
				break;
			case "ballet shoes":
				swapIndices(tempDice,0,5);
				break;
			case "compass":
				var faces = [structuredClone(tempDice[0]),structuredClone(tempDice[2]),structuredClone(tempDice[4]),structuredClone(tempDice[3])];
				rotateIndices(tempDice,[0,2,4,3]);
				break;
			case "eye of horus":
				for (var j in tempDice) {
					tempDice[j][1]++;
				}
				break;
			case "rusty plate":
				tempDice[1] = ["nothing",0,[]];
				break;
			case "corset":
				tempDice[0] = ["nothing",0,[]];
				tempDice[1][1]++;
				break;
			case "big shield":
				tempDice[0] = ["defend",4,[]];
				break;
			case "polearm":
				for (var j in tempDice) {
					if (j==2) {
						continue;
					}
					var tempType = tempDice[j][0];
					var typeCheck = tempType.split(" ");
					if (typeCheck[0]=="attack") {
						tempDice[j] = structuredClone(tempDice[2]);
					}
				}
				break;
			case "ace of spades":
				for (var j in tempDice) {
					if (j==0) {
						tempDice[j][1]+=2;
					} else {
						tempDice[j][1]-=2;
					}
				}
				break;
			case "wandify":
				tempDice[4][1]++;
				tempDice[5][1]++;
				if (!tempDice[4][2].includes("singleUse")) {
					tempDice[4][2].push("singleUse");
				}
				if (!tempDice[5][2].includes("singleUse")) {
					tempDice[5][2].push("singleUse");
				}
				break;
			case "big hammer":
				tempDice[0] = ["attack",5,["heavy"]];
				tempDice[1] = ["nothing",0,[]];
				break;
			case "kilt":
				tempDice[5]=structuredClone(tempDice[4]);
				break;
			case "origami":
				swapIndices(tempDice,0,4);
				swapIndices(tempDice,1,5);
				swapIndices(tempDice,2,3);
				break;
			case "buckler":
				tempDice[1]=["defend",3,["bloodlust"]];
				break;
			case "rain of arrows":
				tempDice[2]=["attack",1,["ranged","duplicate"]];
				break;
			case "peaked cap":
				tempDice[0]=structuredClone(tempDice[1]);
				break;
			case "autumn leaf":
				if (!tempDice[5][2].includes("growth")) {
					tempDice[5][2].push("growth");
				}
				break;
			case "worn arms":
				tempDice[2] = ["attack",2,[]];
				tempDice[3] = ["defend",2,[]];
				break;
			case "longbow":
				tempDice[2] = ["attack",2,["ranged"]];
				tempDice[3] = ["attack",2,["ranged"]];
				break;
			case "aegis":
				tempDice[1] = ["defend",1,["duplicate","steel"]];
				break;
			case "diving suit":
				var lowerIndex = index+1;
				if (lowerIndex>=getDiceList(id).length) {
					lowerIndex=0;
				}
				var tempLower = getDice(id,lowerIndex).dice;
				tempDice[4] = structuredClone(tempLower[4]);
				tempDice[5] = structuredClone(tempLower[5]);
				break;
			case "whetstone":
				for (var j in tempDice) {
					if (tempDice[j][0]=="attack"&&tempDice[j][2].length==0) {
						tempDice[j][1]++;
					}
				}
				break;
			case "clover":
				tempDice[0][1]++;
				tempDice[1][1]-=2;
				break;
			case "ladder":
				var upperIndex = index-1;
				if (upperIndex<0) {
					upperIndex = getDiceList(id).length-1;
				}
				var tempUpper = getDice(id,upperIndex).dice;
				tempDice[1] = structuredClone(tempUpper[1]);
				break;
			case "twisted flax":
				tempDice[1][1]--;
				tempDice[2][1]++;
				tempDice[3][1]++;
				break;
			case "twisted bar":
				for (var j in tempDice) {
					tempDice[j][1]=2;
				}
				break;
			case "dragonhide gloves":
				tempDice[2] = structuredClone(tempDice[1]);
				tempDice[3] = structuredClone(tempDice[1]);
				break;
			case "shuriken":
				addKeyword(tempDice[4],"ranged");
				addKeyword(tempDice[4],"chain");
				addKeyword(tempDice[5],"ranged");
				addKeyword(tempDice[5],"chain");
				break;
			case "obol":
				addKeyword(tempDice[4],"deathwish");
				addKeyword(tempDice[5],"deathwish");
				break;
			case "demon eye":
				addKeyword(tempDice[0],"pain");
				tempDice[0][1]+=2;
				break;
			case "whiskers":
				tempDice[1] = ["attack",1,["ranged","copycat"]];
				tempDice[4] = ["attack",1,["copycat"]];
				tempDice[5] = ["defend",1,["copycat"]];
				break;
			case "glowing egg":
				addKeyword(tempDice[0],"growth");
				break;
			case "ordinary triangle":
				for (var j in tempDice) {
					if (tempDice[j][1]==3) {
						tempDice[j][1]++;
					}
				}
				break;
			case "cocoon":
				for (var j in tempDice) {
					tempDice[j][1]--;
					addKeyword(tempDice[j],"era");
				}
				break;
			case "monocle":
				addKeyword(tempDice[1],"engage");
				break;
			case "doomblade":
				for (var j in tempDice) {
					var tempType = tempDice[j][0];
					var typeCheck = tempType.split(" ");
					if (typeCheck[0]=="attack") {
						tempDice[j][1]++;
						addKeyword(tempDice[j],"guilt");
					}
				}
				break;
			case "mini crossbow":
				tempDice[2] = ["attack",2,["ranged","engage"]];
				break;
			case "braids":
				tempDice[1] = structuredClone(tempDice[0]);
				break;
			case "ocular amulet":
				tempDice[0][1]++;
				break;
			case "demonic deal":
				for (var j in tempDice) {
					tempDice[j][1]+=2;
					addKeyword(tempDice[j],"pain");
				}
				break;
			case "wrench":
				tempDice[1][1]++;
				break;
			case "water":
				tempDice[0][1]++;
				tempDice[1][1]--;
				tempDice[4][1]++;
				tempDice[5][1]--;
				break;
			case "metal studs":
				for (var j in tempDice) {
					if (tempDice[j][0]=="defend"||tempDice[j][2].includes("selfshield")) {
						tempDice[j][1]++;
					}
				}
				break;
			case "ornate hilt":
				for (var j in tempDice) {
					var tempType = tempDice[j][0];
					var typeCheck = tempType.split(" ");
					if (typeCheck[0]=="attack") {
						addKeyword(tempDice[j],"selfshield");
					}
				}
				break;
			case "anvil":
				addKeyword(tempDice[1],"steel");
				break;
			case "poison dip":
				addKeyword(tempDice[2],"poison");
				addKeyword(tempDice[3],"poison");
				break;
			case "brimstone":
				tempDice[5][1]*=3;
				break;
			case "mirror mask":
				var upperIndex = index-1;
				if (upperIndex<0) {
					upperIndex = getDiceList(id).length-1;
				}
				var tempUpper = getDice(id,upperIndex).dice;
				for (var j in tempDice) {
					tempDice[j] = structuredClone(tempUpper[j]);
				}
				break;
			case "bullseye":
				addKeyword(tempDice[1],"engage");
				addKeyword(tempDice[2],"engage");
				addKeyword(tempDice[3],"engage");
				break;
			case "olympian trident":
				addKeyword(tempDice[1],"cleave");
				break;
			case "singularity":
				tempDice[4][1]+=2;
				tempDice[5][1]+=2;
				break;
			case "helm of power":
				tempDice[0][1]*=2;
				break;
			case "triple shuriken":
				for (var j in tempDice) {
					addKeyword(tempDice[j],"ranged");
					addKeyword(tempDice[j],"chain");
				}
				break;
			case "collar":
				addKeyword(tempDice[2],"copycat");
				addKeyword(tempDice[3],"copycat");
				break;
			case "dumbbell":
				for (var j in tempDice) {
					if (tempDice[j][1]>=4) {
						tempDice[j][1]+=4;
					}
				}
				break;
			case "silk cape":
				tempDice[1] = structuredClone(tempDice[0]);
				tempDice[4] = structuredClone(tempDice[0]);
				tempDice[5] = structuredClone(tempDice[0]);
				break;
			case "shiny gauntlets":
				addKeyword(tempDice[2],"pristine");
				addKeyword(tempDice[3],"pristine");
				break;
			case "big heart":
				tempDice[1] = ["heal", 7,[]];
				break;
			case "castor root":
				for (var j in tempDice) {
					if (tempDice[j][0]=="nothing") {
						tempDice[j] = ["heal",1,[]];
					}
				}
				break;
			case "change of heart":
				for (var j in tempDice) {
					if (tempDice[j][0]=="heal") {
						tempDice[j][0]=="defend";
					}
				}
				break;
			case "seedling":
				tempDice[0] = ["attack",2,["growth"]];
				break;
			case "tincture":
				addKeyword(tempDice[5],"cleanse");
				break;
			case "sorcery notes":
				tempDice[0] = ["mana",1,["cantrip"]];
				tempDice[1] = ["nothing",0,[]];
				break;
			case "whey":
				addKeyword(tempDice[0],"vitality");
				break;
			case "reagents":
				tempDice[4] = ["nothing",0,[]];
				tempDice[5] = ["heal",1,["regen"]];
				break;
			case "bowl":
				tempDice[1] = structuredClone(diceTemplates[tempUnit.name].dice[1]);
				tempDice[2] = structuredClone(diceTemplates[tempUnit.name].dice[2]);
				tempDice[3] = structuredClone(diceTemplates[tempUnit.name].dice[3]);
				break;
			case "memory":
				tempDice[0] = structuredClone(diceTemplates[tempUnit.name].dice[0]);
				break;
			case "quiver":
				for (var j=1; j<6; j++) {
					tempDice[j] = ["attack",1,["ranged"]];
				}
				break;
			case "wand of wand":
				tempDice[1] = ["attack",1,["singleUse","inflict singleUse"]];
				break;
			case "iron heart":
				for (var j in tempDice) {
					tempDice[j][1]++;
					addKeyword(tempDice[j],"exert");
				}
				break;
			case "balisong":
				tempDice[0] = ["attack",1,["cantrip"]];
				break;
			case "tower shield":
				tempDice[1] = ["defend",7,["heavy"]];
				break;
			case "powdered mana":
				for (var j in tempDice) {
					if (tempDice[j][0]=="nothing") {
						tempDice[j] = ["mana",1,[]];
					}
				}
				break;
			case "flickering blade":
				tempDice[5] = ["attack",1,["copycat"]];
				break;
			case "blessed water":
				tempDice[1] = ["heal",3,["vitality"]];
				break;
			case "sapphire":
				tempDice[1] = ["mana",2,[]];
				break;
			case "citrine ring":
				tempDice[5][1]++;
				break;
			case "rejuvenation wand":
				tempDice[2] = ["heal",10,["singleUse"]];
				tempDice[3] = ["heal",10,["singleUse"]];
				break;
			case "twin daggers":
				tempDice[2] = ["attack",1,["cantrip"]];
				tempDice[3] = ["attack",1,["cantrip"]];
				break;
			case "fletching":
				addKeyword(tempDice[0],"ranged");
				break;
			case "terrarium":
				tempDice[4] = ["defend",2,["growth"]];
				tempDice[5] = ["mana",1,["growth"]];
				break;
			case "syringe":
				var aliveCount = 0;
				for (var j in dice[id]) {
					if (!dice[id][j].dead) {
						aliveCount++;
					}
				}
				if (aliveCount<=2) {
					for (var j in tempDice) {
						addKeyword(tempDice[j],"cantrip");
					}
				}
				break;
			case "siphon":
				for (var j in tempDice) {
					if (tempDice[j][0]=="mana"||tempDice[j][2].includes("manaGain")) {
						tempDice[j][1]++;
						addKeyword(tempDice[j],"pain");
					}
				}
				break;
			/*case "pocket phylactery":
				addKeyword(tempDice[0],"pain");
				addKeyword(tempDice[1],"pain");
				break;*/
			case "pure heart pendant":
				tempDice[1] = ["heal",3,["cleanse"]];
				break;
			case "shortsword":
				tempDice[4] = ["attack",2,[]];
				tempDice[5] = ["attack",2,[]];
				break;
			case "tiara":
				for (var j in tempDice) {
					if (tempDice[j][0]=="mana"||tempDice[j][2].includes("manaGain")) {
						addKeyword(tempDice[j],"selfheal");
					}
				}
				break;
			case "ink bottle":
				for (var j in tempDice) {
					if (tempDice[j][0]=="nothing") {
						tempDice[j] = ["defend",1,["cantrip"]];
					}
				}
				break;
			case "magic staff":
				for (var j in tempDice) {
					if (tempDice[j][0]=="mana"||tempDice[j][2].includes("manaGain")) {
						tempDice[j][1]=2;
					}
				}
				break;
			case "soup":
				for (var j in tempDice) {
					if (tempDice[j][0]=="defend"){//||tempDice[j][2].includes("selfshield")) {
						tempDice[j][0]="defendheal";
					}
				}
				break;
			/*case "faerie pact":
				tempDice[5] = ["mana",4,[]];
				break;*/
			case "fangs":
				addKeyword(tempDice[0],"selfheal");
				break;
			case "eyepatch":
				tempDice[0][2] = [];
				break;
			case "alembic":
				tempDice[1] = ["inflict manaGain pain",0,[]];
				break;
			/*case "flawed diamond":
				addKeyword("pristine",tempDice[0]);
				addKeyword("pristine",tempDice[1]);
				break;*/
			case "chakram":
				for (var j in tempDice) {
					if (tempDice[j][0]=="defend"){//||tempDice[j][2].includes("selfshield")) {
						tempDice[j][0]="attack";
						addkeyword(tempDice[j],"ranged");
					}
				}
				break;
			case "splitting arrows":
				tempDice[4] = ["attack",1,["ranged","cleave"]];
				tempDice[5] = ["attack",1,["ranged","cleave"]];
				break;
			case "hissing ring":
				tempDice[1] = ["attack",2,["poison"]];
				break;
			case "dynamo":
				addKeyword(tempDice[4],"singleUse");
				addKeyword(tempDice[4],"era");
				addKeyword(tempDice[5],"singleUse");
				addKeyword(tempDice[5],"era");
				break;
			case "mana jelly":
				for (var j in tempDice) {
					if (tempDice[j][0]=="mana"||tempDice[j][2].includes("manaGain")) {
						addKeyword(tempDice[j],"singleUse");
						addKeyword(tempDice[j],"cantrip");
					}
				}
				break;
			case "simplicity":
				for (var j in tempDice) {
					if (tempDice[j][2].length==0) {
						if (tempDice[j][0]=="attack"||tempDice[j][0]=="defend"||
							tempDice[j][0]=="heal"||tempDice[j][0]=="mana") {
							tempDice[j][1]++;
						}
					}
				}
				break;
			case "sack of mana":
				tempDice[1] = ["mana",4,[]];
				tempDice[2] = ["nothing",0,[]];
				tempDice[3] = ["nothing",0,[]];
				break;
			case "door":
				var enemyCount = 0;
				for (var j in enemies) {
					if (!enemies[j].dead){
						enemyCount++;
					}
				}
				if (enemyCount>=4) {
					for (var j in tempDice) {
						if (tempDice[j][0]=="defend"||tempDice[j][2].includes("selfshield")) {
							tempDice[j][1]+=2;
						}
					}
				}
				break;
			case "lens":
				for (var j in tempDice) {
					if (tempDice[j][0]=="heal") {
						addKeyword(tempDice[j],"focus");
					}
				}
				break;
			case "pauldron":
				tempDice[2][1]+=2;
				tempDice[3][1]-=2;
				break;
			case "nunchaku":
				addKeyword(tempDice[2],"chain");
				addKeyword(tempDice[3],"chain");
				break;
			case "bandana": 
				for (var j in tempDice) {
					if (tempDice[j][1]==0) {
						addKeyword(tempDice[j],"cantrip");
					}
				}
				break;
			case "early grave":
				for (var j in tempDice) {
					if (tempDice[j][1]>=3) {
						addKeyword(tempDice[j],"pain");
						addKeyword(tempDice[j],"cantrip");
					}
				}
				break;
			case "glyph of purity":
				addKeyword(tempDice[2],"cleanse");
				addKeyword(tempDice[3],"cleanse");
				break;
			case "shining bow":
				for (var j in tempDice) {
					if (tempDice[j][0]=="attack") {
						addKeyword(tempDice[j],"ranged");
					}
				}
				break;
			case "wand grips":
				addKeyword(tempDice[0],"singleUse");
				tempDice[0][1]+=2;
				break;
			case "hourglass":
				if (age==0) {
					for (var j in tempDice) {
						tempDice[j][1]++;
					}
				}
				break;
			case "blindfold":
				for (var j in tempDice) {
					tempDice[j][2]=[];
				}
				break;
			case "jump":
				tempDice[2] = structuredClone(tempDice[0]);
				tempDice[3] = structuredClone(tempDice[0]);
				tempDice[0] = ["nothing",1,[]];
				break;
			case "lich eye":
				for (var j in tempDice) {
					addKeyword(tempDice[j],"manaGain");
					addKeyword(tempDice[j],"death");
					tempDice[j][1]+=2;
				}
				break;
			case "conduit":
				tempDice[1] = ["mana",2,["duplicate"]];
				break;
			case "kite shield":
				for (var j in tempDice) {
					if (tempDice[j][0]=="defend"||tempDice[j][2].includes("selfshield")) {
						tempDice[j][1]=3;
					}
				}
				break;
			case "karma":
				for (var j in tempDice) {
					if (tempDice[j][0]=="heal"||tempDice[j][0]=="defendheal") {
						addKeyword(tempDice[j],"selfheal");
					}
				}
				for (var j in tempDice) {
					if (tempDice[j][0]=="defend"||tempDice[j][0]=="defendheal") {
						addKeyword(tempDice[j],"selfshield");
					}
				}
				for (var j in tempDice) {
					if (tempDice[j][0]=="attack") {
						addKeyword(tempDice[j],"pain");
					}
				}
				break;
			case "dragon pipe":
				for (var j in tempDice) {
					if (tempDice[j][0]=="heal"||tempDice[j][2].contains("selfheal")) {
						tempDice[j][1]++;
					}
				}
				break;
			case "two reeds":
				for (var j in tempDice) {
					if (tempDice[j][1]%2==0) {
						tempDice[j][1]++;
					}
				}
				break;
			case "tentacle":
				addKeyword(tempDice[4],"repel");
				addKeyword(tempDice[5],"repel");
				break;
			case "wandcraft":
				for (var j in tempDice) {
					tempDice[j][0] = "mana";
					addKeyword(tempDice[j][2],"singleUse");
				}
				break;
			case "second chance":
				tempDice[5] = ["reuse",0,[]];
				break;
			case "demon claw":
				tempDice[0][1]--;
				addKeyword(tempDice[0],"rampage");
				break;
			case "broadsword":
				tempDice[1] = ["attack",4,[]];
				tempDice[2] = ["attack",4,[]];
				tempDice[3] = ["attack",4,[]];
				break;
			case "wooden bracelet":
				for (var j in tempDice) {
					if (tempDice[j][2].length==0) {
						tempDice[j][1]++;
					}
				}
				break;
			case "pocket mirror":
				tempDice[5] = structuredClone(tempDice[0]);
				break;
			case "tourmaline paraiba":
				for (var j in tempDice) {
					if (tempDice[j][0]=="mana"||tempDice[j][2].includes("manaGain")) {
						addKeyword(tempDice[j],"era");
					}
				}
				break;
			case "faerie dust":
				for (var j in tempDice) {
					if (tempDice[j][0]=="nothing") {
						tempDice[j] = ["mana",3,[]];
					}
				}
				break;
			case "tusk":
				for (var j in tempDice) {
					if (tempDice[j][0]=="heal"||tempDice[j][2].includes("selfheal")) {
						tempDice[j][1]++;
					}
				}
				for (var j in tempDice) {
					if (tempDice[j][0]=="defend"||tempDice[j][2].includes("selfshield")) {
						tempDice[j][1]++;
					}
				}
				break;
			case "sapphire ring":
				for (var j in tempDice) {
					if (tempDice[j][0]=="mana"||tempDice[j][2].includes("manaGain")) {
						tempDice[j][1]++;
					}
				}
				break;
			case "scorpion tail":
				addKeyword(tempDice[2],"pain");
				addKeyword(tempDice[2],"weaken");
				addKeyword(tempDice[3],"pain");
				addKeyword(tempDice[3],"weaken");
				break;
			case "horned viper":
				addKeyword(tempDice[0],"poison");
				addKeyword(tempDice[1],"poison");
				break;
		}
	}
	//6
	if (id==-2) {
		for (var i in enemies) {
			if (enemies[i].warchief&&!enemies[i].dead) {
				for (var j in tempDice) {
					tempDice[j][1]++;
				}
			}
		}
	}
	
	tempFace = structuredClone(tempDice[side]);

	var keywords = structuredClone(tempDice[side][2]);
	
	
	//7? like wizard buff i guess
	if (id>=0) {
		for (var i in enemies) {
			if (enemies[i].bramble&&!enemies[i].dead) {
				if (!keywords.includes("singleUse")) {
					keywords.push("singleUse");
				}
				break;
			}
		}
	}

	for (var i in tempUnit.tempKeywords) {
		if (!keywords.includes(tempUnit.tempKeywords[i]))
			{keywords.push(tempUnit.tempKeywords[i]);}
	}
	tempFace[1]+=tempUnit.tempBuff[side];
	tempFace[1]-=tempUnit.weaken;

	tempFace[1]+=tempUnit.permaBuff[side];
	//8
	for (var i in keywords) {
		if (keywords[i]=="copycat") {
			for (var j in focusKeywords) {
				if (!keywords.includes(focusKeywords[j]))
					{keywords.push(focusKeywords[j]);}
			}
		}
	}
	
	tempFace[2] = keywords;
	if (tempUnit.duplicate) {
		tempFace = structuredClone(tempUnit.duplicateFace);
	}
	return tempFace;
}
function addKeyword(face,keyword) {
	if (!face[2].includes(keyword)) {
		face[2].push(keyword);
	}
}
function rotateIndices(arr,indices) {
	var list=[];
	for (var i in indices) {
		list[i]=structuredClone(arr[indices[i]]);
	}
	for (var i in indices) {
		if (i>0) {
			arr[indices[i]] = list[i-1];
		} else {
			arr[indices[i]] = list[list.length-1];
		}
	}
}

function swapIndices(arr,i,j) {
	rotateIndices(arr,[i,j]);
}

function validDiceList(id) {
	if (id==-2||(id>=0&&id<dice.length)) {
		return true;
	} else {
		return false;
	}
}

function brokenHp(targetId,targetIndex,pips,hpList) {
	if (hpList.length==0) {
		return [];
	}
	hpList.sort((a,b)=>{if (a<b){return -1} else if (b>a) {return 1}return 0;});
	var tempUnit = getDice(targetId,targetIndex);
	var upperBound = tempUnit.hp;
	var lowerBound = upperBound-pips;
	console.log(upperBound + " "+ lowerBound + " peepee")

	var brokenList=[];

	for (var i in hpList) {
		if (hpList[i]>lowerBound&&hpList[i]<=upperBound) {
			brokenList.push(hpList[i]);
		}
	}
	return brokenList;
}

var petrifyOrder = [2,0,1,4,5,3];

function hurt(targetId,targetIndex, pips,unblockable) {
	var target = getDice(targetId,targetIndex);
	var incoming = 0;
	if (!unblockable) {
		if (target.block>=pips) {
			target.block-=pips;
		} else {
			incoming = pips-target.block;
			target.block=0;
		}
	} else {
		incoming = pips;
	}
	if(incoming>0) {
		var ironList = brokenHp(targetId,targetIndex,incoming,target.ironHp);
		var iron = -1;
		if (ironList.length>0){
			iron=ironList[ironList.length-1];
		}
		if (iron!=-1) {
			if (target.hp==iron) {
				incoming=1;
				target.ironHp.splice(target.ironHp.length-1,1);
			} else {
				incoming=target.hp-iron;
			}
		}

		
		if (targetId==-2) {
			blindCheck=false;
			if (target.hydra) {
				target.hydraCount++;
			}
		}
		
		var stoneList = brokenHp(targetId,targetIndex,incoming,target.stoneHp);
		var ghostList = brokenHp(targetId,targetIndex,incoming,target.ghostHp);
		if (targetId == -2) {
			var slimeList = brokenHp(targetId,targetIndex,incoming,target.slimeHp);
			var slimerList = brokenHp(targetId,targetIndex,incoming,target.slimerHp);
			var lichList = brokenHp(targetId,targetIndex,incoming,target.lichHp);
			var stunList = brokenHp(targetId,targetIndex,incoming,target.stunHp);
			var ogreList = brokenHp(targetId,targetIndex,incoming,target.ogreHp);
			var chompUpList = brokenHp(targetId,targetIndex,incoming,target.chompUpHp);
			var chompDownList = brokenHp(targetId,targetIndex,incoming,target.chompDownHp);
			var quartzList = brokenHp(targetId,targetIndex,incoming,target.quartzHp);
			summonEnemy("slimelet",slimeList.length,target.position);
			summonEnemy("slimer",slimerList.length,target.position);
			summonEnemy("bones",lichList.length,target.position);
			if (stunList.length>0) {
				if (targetId==-2) {
					target.targets=[];
				}
			}
			for (var i=0; i<ogreList.length; i++) {
				for (var j=0; j<6; j++) {
					target.permaBuff[j]++;
				}
			}
			if (quartzList.length>0) {
				if (target.hp-incoming==quartzList[0]-1) {
					kill(targetId,targetIndex);
				}
			}
			for (var i in dice) {
				hurt(i,0,chompUpList.length);
				hurt(i,dice[i].length-1,chompDownList.length);
			}
			target.slimeHp.splice(target.slimeHp.length-slimeList.length,slimeList.length);
			target.slimerHp.splice(target.slimerHp.length-slimerList.length,slimerList.length);
			target.lichHp.splice(target.lichHp.length-lichList.length,lichList.length);
			target.stunHp.splice(target.stunHp.length-stunList.length,stunList.length);
			target.ogreHp.splice(target.ogreHp.length-ogreList.length,ogreList.length);
			target.chompUpHp.splice(target.chompUpHp.length-chompUpList.length,chompUpList.length);
			target.chompDownHp.splice(target.chompDownHp.length-chompDownList.length,chompDownList.length);
			target.quartzHp.splice(target.quartzHp.length-quartzList.length,quartzList.length);
		}
		target.hp-=incoming;
		if (incoming>=4&&target.zombie) {
			kill(targetId,targetIndex);
		}
		if (ghostList.length>0) {
			console.log(ghostList);
			target.ghost=true;
			target.ghostHp.splice(target.ghostHp.length-ghostList.length,ghostList.length);
		}
	}
}

var manaText = [];

function updateText() {
	for (var i in hpText) {
		for (var j in hpText[i]) {
			hpText[i][j].text=dice[i][j].hp;
			hpText[i][j].x=dice[i][j].x;
			hpText[i][j].y=dice[i][j].y+SQUARE;
			blockText[i][j].text=dice[i][j].block;
			blockText[i][j].x=dice[i][j].x;
			blockText[i][j].y=dice[i][j].y+1.5*SQUARE;
			incomingText[i][j].text=dice[i][j].incoming;
			incomingText[i][j].x=dice[i][j].x+0.5*SQUARE;
			incomingText[i][j].y=dice[i][j].y+SQUARE;
			var effectivePoison = dice[i][j].poison+dice[i][j].incomingPoison-dice[i][j].regen;
			poisonText[i][j].text=effectivePoison;
			poisonText[i][j].x=dice[i][j].x+0.5*SQUARE;
			poisonText[i][j].y=dice[i][j].y+1.5*SQUARE;
			if (dice[i][j].block==0) {
				blockText[i][j].alpha=0;
			} else {
				blockText[i][j].alpha=1;
			}
			if (dice[i][j].incoming==0) {
				incomingText[i][j].alpha=0;
			} else {
				incomingText[i][j].alpha=1;
			}
			if (effectivePoison==0) {
				poisonText[i][j].alpha=0;
			} else {
				poisonText[i][j].alpha=1;
			}
		}
	}
	for (var i in playerText) {
		if (i>=dice.length) {
			continue;
		}
		if (dice[i].length==0) {
			continue;
		}
		playerText[i].x = dice[i][dice[i].length-1].x+SQUARE;
		playerText[i].y = dice[i][dice[i].length-1].y;
	}
	for (var i in mana) {
		if (i>=manaText.length) {
			manaText[i] = new PIXI.Text("Mana: "+mana[i][0]+"/"+mana[i][1]);
			manaText[i].style.fontSize=15;
			app.stage.addChild(manaText[i]);
		}
		manaText[i].text = "Mana: "+mana[i][0]+"/"+mana[i][1];
		manaText[i].x = dice[i][dice[i].length-1].x+SQUARE;
		manaText[i].y = dice[i][dice[i].length-1].y+SQUARE/2;
	}
	for (var i in enemies) {
		if (i>=enemyHpText.length) {
			enemyHpText[i] = new PIXI.Text(enemies[i].hp);
			app.stage.addChild(enemyHpText[i]);
		}
			enemyHpText[i].x=enemies[i].x;
			enemyHpText[i].y=enemies[i].y+SQUARE;

			
		enemyHpText[i].alpha=1;
		if (i>=enemyBlockText.length) {
			enemyBlockText[i] = new PIXI.Text(enemies[i].block);
			app.stage.addChild(enemyBlockText[i]);
		}
			enemyBlockText[i].x=enemies[i].x;
			enemyBlockText[i].y=enemies[i].y+1.5*SQUARE;
			enemyBlockText[i].style.fill=0x888888;
			enemyBlockText[i].alpha=0;
		var effectivePoison=enemies[i].poison+enemies[i].incomingPoison-enemies[i].regen;
		if (i>=enemyPoisonText.length) {
			enemyPoisonText[i] = new PIXI.Text(effectivePoison);
			app.stage.addChild(enemyPoisonText[i]);
		}
			enemyPoisonText[i].x=enemies[i].x+SQUARE/2;
			enemyPoisonText[i].y=enemies[i].y+1.5*SQUARE;
			enemyPoisonText[i].style.fill=0x008800;
			enemyPoisonText[i].alpha=0;
		enemyHpText[i].text=enemies[i].hp;
		enemyBlockText[i].text=enemies[i].block;
		enemyPoisonText[i].text=effectivePoison;
		if (enemies[i].block==0) {
			enemyBlockText[i].alpha=0;
		} else {
			enemyBlockText[i].alpha=1;
		}
		if (effectivePoison==0) {
			enemyPoisonText[i].alpha=0;
		} else {
			enemyPoisonText[i].alpha=1;
		}
	}
	for (var i in enemyHpText) {
		if (i>=enemies.length) {
			enemyHpText[i].alpha=0;
			enemyBlockText[i].alpha=0;
		}
	}
}

var age=0;

function checkEnemyConditions() {
	for (i in enemies) {
		var goblinCheck = true;
		if (enemies[i].goblin) {
			for (j in enemies) {
				if (i!=j&&!enemies[j].dead) {
					goblinCheck = false;
				}
			}
			if (goblinCheck) {
				enemies[i].dead=true; //flee
			}
		}
		if (enemies[i].militia) {
			for (j in enemies[i].targets) {
				var tempTarget = getDice(enemies[i].targets[j][0],enemies[i].targets[j][1]);
				if (tempTarget.block>=5) {
					enemies[i].dead=true; //flee
				}
			}
		}
		if (enemies[i].hydra) {
			if (enemies[i].hydraCount>=5) {
				kill(-2,i);
			}
		}
	}
	//checkDead();
	for (i in enemies) {
		if (enemies[i].dead) {
			enemies[i].targets=[];
		}
	}
}
var cantripPhase = false;
function processCantrips(queue) {
	cantripPhase = true;
	var verifiedActions = [];
	for (var i in queue) { //simulate
		processQueue();
		var user = getDice(queue[i][0],queue[i][1]);
		var face = getFace(queue[i][0],queue[i][1],user.side)
		var [targetId,targetIndex] = getRandomTarget(user.dice[user.side]);
		if (!user.dead&&targetId!=-1&&targetIndex!=-1) {
			actionQueue.push([queue[i][0],queue[i][1],targetId,targetIndex,true,false]);
			verifiedActions.push([i,targetId,targetIndex]);
			
		}
	}
	recover();
	if (verifiedActions.length>0) {
		actionQueue.splice(actionQueue.length-verifiedActions.length,verifiedActions.length);
	}
	cantripPhase=false;
	console.log(verifiedActions);
	for (var i in verifiedActions) {
		socket.emit("action",queue[verifiedActions[i][0]][0],queue[verifiedActions[i][0]][1],verifiedActions[i][1],verifiedActions[i][2],true);
	}
}
function processQueue() {
	/*for (var i in previousDice) {
		ownedDice[i]=structuredClone(previousDice[i]);
	}*/
		focusTargetId=-1;
		focusTargetIndex=-1;
		focusKeywords = [];
		focusPips = 0;
	/*dice=[];
	for (var i in initialDice) {
		dice.push([]);
		for (var j in initialDice[i]) {
			dice[i].push(structuredClone(initialDice[i][j]));
		}
	}*/
	recover();
	//process items?

	/*enemies=[];
	for (var i in enemies) {
		enemies.push(structuredClone(initialEnemies[i]));
	}*/

	blindCheck = true;
	for (pee in actionQueue) {
		var [userId,userIndex,targetId,targetIndex,cantrip,spell] = actionQueue[pee];
		if (spell) {
			if (payCost(userId,userIndex)) {
				useSpell(userId,userIndex,targetId,targetIndex);
			} else {
				console.log("YOU HAVE NO MANA????");
			}
		} else {
			var user = getDice(actionQueue[pee][0],actionQueue[pee][1]);
			var target = getDice(actionQueue[pee][2],actionQueue[pee][3]);

			//var enemy = actionQueue[i][2];
			/*if (!enemy) {
				action(rolledDice[user][0],rolledDice[user][1],ownedDice[user],ownedDice[target]);
			} else {
				action(rolledDice[user][0],rolledDice[user][1],ownedDice[user],enemies[target]);
			}*/
			ignoreCleave = false;

			action(actionQueue[pee][0],parseInt(actionQueue[pee][1]),actionQueue[pee][2],parseInt(actionQueue[pee][3]));
			if (!user.rampage&&!actionQueue[pee][4]&&!user.doubleUse) {
				user.used=true;
			} else {
				if (user.rampage) {
					user.rampage=false;
				}
			}

			focusTargetId=actionQueue[pee][2];
			focusTargetIndex=actionQueue[pee][3];
			focusKeywords=structuredClone(user.dice[user.side][2]);
			focusPips=user.dice[user.side][1];
		}
		checkEnemyConditions();
		calcIncoming();
	}

			reposition();
	/*for (var i in dice) {
		for (var j in dice[i]) {
			if (dice[i][j].hp<=0) {
				dice[i][j].dead=true;
			} else {
				dice[i][j].dead=false;
			}
		}
	}
	for (var i in enemies) {
		if (enemies[i].hp<=0) {
			enemies[i].dead=true;
		} else {
			enemies[i].dead=false;
		}
	}*/
}

function calcIncoming() {
	for (var i in dice) {
		for (var j in dice[i]) {
			dice[i][j].incoming=0;
			dice[i][j].incomingPoison=0;
		}
	}
	for (var i in enemies) {
		enemies[i].incoming=0;
		enemies[i].incomingPoison=0;
	}
	for (var i in enemies) {
		if (enemies[i].exert) {
			continue;
		}
		var type = enemies[i].dice[enemies[i].side][0];
		var pips = enemies[i].dice[enemies[i].side][1];
		var keywords = enemies[i].dice[enemies[i].side][2];

		var face = getFace(-2,i,enemies[i].side);
		type = face[0];
		pips = face[1];
		keywords = face[2];

		pips = getPips(type,pips,keywords,-2,i);
		for (var j in enemies[i].targets) {
			var cleave = false;
			var poison = false;
			var descend = false;
			for (var k in keywords) {
				switch (keywords[k]) {
					case "cleave":
						cleave=true;
						break;
					case "poison":
						poison=true;
						break;
					case "descend":
						descend=true;
						break;
				}
			}
			var id = enemies[i].targets[j][0];
			var index = enemies[i].targets[j][1];
			[newId,newIndex]=getRedirectedTarget(id,index);
				
				switch (type) {
					case "attack":
					case "outer":
					case "attack all":
					case "attack all all":
						dice[newId][newIndex].incoming+=pips;
						if (poison) {
							dice[newId][newIndex].incomingPoison+=pips;
						}
						/*if (cleave) {
							if (validDice(id,index-1)) {
								getDice(id,index-1).incoming+=pips;
							}
							if (validDice(id,index+1)) {
								console.log(id + " "+(index+1) + " huh?");
								console.log(validDice(id,index+1));
								getDice(id,index+1).incoming+=pips;
							}
						}*/
						if (cleave||descend){
							/*var upCounter = index-1;
							while (upCounter>=0&&cleave) {
								[newId,nextUp]=getRedirectedTarget(id,upCounter);
								if (!getDice(newId,nextUp).dead) {
									getDice(newId,nextUp).incoming+=pips;
									if (poison) {
										getDice(newId,nextUp).incomingPoison+=pips;
									}
									break;
								}
								upCounter--;
							}
							var downCounter = index+1;
							while (downCounter<=dice[id].length-1) {
								[newId,nextDown] = getRedirectedTarget(id,downCounter);
								if (!getDice(newId,nextDown).dead) {
									getDice(newId,nextDown).incoming+=pips;
									if (poison) {
										getDice(newId,nextDown).incomingPoison+=pips;
									}
									break;
								}
								downCounter++;
							}*/
							var upper,lower;
							[upper,lower]=cleaveIndices(id,index);
							if (upper!=-1&&cleave) {
								[newId,newIndex]=getRedirectedTarget(id,upper);
								getDice(newId,newIndex).incoming+=pips;
								if (poison) {
									getDice(newId,newIndex).incomingPoison+=pips;
								}
							}
							if (lower!=-1) {
								[newId,newIndex] = getRedirectedTarget(id,lower);
								if (!getDice(newId,newIndex).dead) {
									getDice(newId,newIndex).incoming+=pips;
									if (poison) {
										getDice(newId,newIndex).incomingPoison+=pips;
									}
								}
							}
						}
						break;
				}
		}
		if (type=="attack all all") {
			for (var j in enemies) {
				enemies[j].incoming+=pips;
				if (keywords.includes("poison")) {
					enemies[j].incomingPoison+=pips;
				}
			}
		}
	}
	for (var i in dice) {
		for (var j in dice[i]) {
			dice[i][j].incomingPoison = Math.max(0,dice[i][j].incomingPoison-dice[i][j].cleanseBuffer[0]);
		}
	}
	for (var i in enemies) {
		enemies[i].incomingPoison = Math.max(0,enemies[i].incomingPoison-enemies[i].cleanseBuffer[0]);
	}
}

function getUnitByPosition(id,position) {
	if (id==-2) {
		for (var i in enemies) {
			if (enemies[i].position==position) {
				return i;
			}
		}
	} else if (id>=0) {
		for (var i in dice[id]) {
			if (dice[id][i].position==position) {
				return i;
			}
		}
	}
	return -1;
}

function reposition() {
	var aliveEnemies = 0;
	var alivePositions = [];
	for (var i in enemies) {
		if (!enemies[i].dead) {
			aliveEnemies++;
			alivePositions.push([i,enemies[i].position]);
		}
	}
	alivePositions.sort((a,b)=>{
		if (a[1]<b[1]) {return -1;}
		if (a[1]>b[1]) {return 1;}
		return 0;
	});
	for (var i in enemies) {
		if (enemies[i].dead) {
			enemies[i].x=-50;
		} else {
			var pos=-1;
			for (var j in alivePositions) {
				if (alivePositions[j][0]==i) {
					pos=j;
					break;
				}
			}
			enemies[i].x=400-alivePositions.length/2*SQUARE+SQUARE*j;
			if (pos==-1) {
				enemies[i].y=0;//how???
			}
		}
		//enemies[i].x=enemies[i].position*enemies[i].width;
		enemies[i].y=0;
	}
	updateText();
}

function repositionDice() {
	if (dice.length==1) {
		for (var i in dice[0]) {
			dice[0][i].x=400-dice[0].length/2*SQUARE+SQUARE*dice[0][i].position;
			dice[0][i].y=150; //idk???
		}
	} else {
		for (var i in dice) {
			for (var j in dice[i]) {
				if (i==playerId) {
					dice[i][j].x=400-dice[0].length*SQUARE-1.5*SQUARE+SQUARE*dice[i][j].position;
					dice[i][j].y=150;
				} else {
					dice[i][j].x=400+1.5*SQUARE+SQUARE*dice[i][j].position;
					dice[i][j].y=150+2*SQUARE*i-2*SQUARE*(i>playerId);
				}
			}
		}
	}
	updateText();
}

function removeTemporaryEffects() {
//remove temporary effects
	for (var i in dice) {
		for (var j in dice[i]) {
			/*if (dice[i][j].hp<=0) {
				dice[i][j].dead=true;
			}*/
			dice[i][j].duplicate = false;
			if (dice[i][j].exert>0) {
				dice[i][j].exert--;
			}
			for (var k in dice[i][j].tempBuff) {
				dice[i][j].tempBuff[k] = 0;
			}
			dice[i][j].weaken=0;
			dice[i][j].tempKeywords = [];
			dice[i][j].undying=false;
			dice[i][j].doubleUseCount=0;
		}
	}
	for (var i in mana) {
		mana[i][0]=Math.min(mana[i][0],mana[i][1]);
	}
}
function removeEnemyTemporaryEffects() {
	for (var i in enemies) {
		enemies[i].targets=[];
		if (enemies[i].caw) {
			enemies[i].ranged=false;
		}
		for (var j in enemies[i].tempBuff) {
			enemies[i].tempBuff[j]=0;
		}
		enemies[i].weaken=0;
		if (enemies[i].exert>0) {
			enemies[i].exert--;
		}
		enemies[i].undying=false;
		enemies[i].tempKeywords = [];
		enemies[i].cleanseBuffer = [0,0,0,0];
	}
	for (var i in dice) {
		for (var j in dice[i]) {
			dice[i][j].cleanseBuffer = [0,0,0,0]; // gotta reset this after enemy attacks
		}
	}
}
function resolveAttacks() {
	for (var i in enemies) {
		var tempTargets = structuredClone(enemies[i].targets); //have to do this cause the targets might change in the middle
		for (var j in tempTargets) {
			if (!enemies[i].dead&&!getDice(tempTargets[j][0],tempTargets[j][1]).dead)
			{ignoreCleave = false;
				action(-2,i,tempTargets[j][0],tempTargets[j][1]);}
			//action(enemies[i].dice[enemies[i].side][0],enemies[i].dice[enemies[i].side][1],enemies[i],enemies[i].targets[j]);
		}
		var tempFace = getFace(-2,i,enemies[i].side);
		if (tempFace[0]=="attack all all") {
			for (var j in enemies) {
				if (!enemies[j].dead) {
					action(-2,i,-2,j);
				}
			}
		}
		var type = tempFace[0];
		var typeCheck = tempFace[0].split(" ");
		if (typeCheck[0]=="summon") {
			type = "summon";
		}
		//no target actions
		if (enemies[i].targets.length==0&&!enemies[i].dead&&!enemies[i].stun) {
			switch (type) {
				case "summon":
					action(-2,i,-1,-1);
					break;
				case "selfheal":
					action(-2,i,-2,i);
					break;
			}
		}
	}

	//remove enemy temporary effects?
	removeEnemyTemporaryEffects();
	/*for (var i in ownedDice) {
		previousDice[i]=structuredClone(ownedDice[i]);
	}*/
	checkDead();
	
	//backupDice();

	//updateText();
}
function resolvePoison() {
	for (var i in dice) {
		for (var j in dice[i]) {
			//dice[i][j].hp-=dice[i][j].poison;
			//dice[i][j].hp+=dice[i][j].regen;
			if (dice[i][j].poison>dice[i][j].regen) {
				hurt(i,j,dice[i][j].poison-dice[i][j].regen,true);
			} else {
				dice[i][j].hp+=dice[i][j].regen-dice[i][j].poison;
			}
			/*var iron = -1;
			dice[i][j].ironHp.sort();
			if (dice[i][j].ironHp.length>0) {
				for (var k=dice[i][j].ironHp.length-1; k>=0; k--) {
					if (dice[i][j].ironHp[k]<=dice[i][j].hp) {
						iron = dice[i][j].ironHp[k];
						break;
					}
				}
			}
			if (iron==-1) {
				dice[i][j].hp-=dice[i][j].poison-dice[i][j].regen;
			} else {
				if (dice[i][j].hp==iron) {
					dice[i][j].hp--;
					dice[i][j].ironHp.splice(dice[i][j].ironHp.length-1,1);
				} else if (dice[i][j].hp+dice[i][j].regen-dice[i][j].poison<=iron) {
					dice[i][j].hp=iron;
				} else {
					dice[i][j].hp-=dice[i][j].poison-dice[i][j].regen;
				}
			}*/
			dice[i][j].hp=Math.min(dice[i][j].hp,dice[i][j].maxHp);
		}
	}
	for (var i in enemies) {
		//enemies[i].hp-=enemies[i].poison;
		//enemies[i].hp+=enemies[i].regen;
		if (enemies[i].poison>enemies[i].regen) {
				hurt(-2,i,enemies[i].poison-enemies[i].regen,true);
			} else {
				enemies[i].hp+=enemies[i].regen-enemies[i].poison;
			}
		/*var iron = -1;
		enemies[i].ironHp.sort((a,b)=>{if (a<b){return -1} else if (b>a) {return 1}return 0;});
		if (enemies[i].ironHp.length>0) {
			for (var j=enemies[i].ironHp.length-1; j>=0; j--) {
				if (enemies[i].ironHp[j]<enemies[i].hp) {
					iron = enemies[i].ironHp[j];
					break;
				}
			}
		}
		if (iron==-1) {
			enemies[i].hp-=enemies[i].poison-enemies[i].regen;
		} else {
			if (enemies[i].hp==iron) {
				enemies[i].hp--;
				enemies[i].ironHp.splice(enemies[i].ironHp.length-1,1);
			} else if (enemies[i].hp+enemies[i].regen-enemies[i].poison<=iron) {
				enemies[i].hp=iron;
			} else {
				enemies[i].hp-=enemies[i].poison-enemies[i].regen;
			}
		}
		enemies[i].hp=Math.min(enemies[i].hp,enemies[i].maxHp);*/
	}
}
function kill(id,index) {
	var tempUnit = getDice(id,index);
	if (tempUnit.undying) {
		if (tempUnit.hp<=0) {
			tempUnit.hp=1;
			return false;
		}
	}
	tempUnit.dead=true;
	if (tempUnit.bones) {
		//bones shit
		var upper,lower;
		[upper,lower] = cleaveIndices(id,index);

		var [upperTargetId,upperTargetIndex] = getRedirectedTarget(id,upper);
		var [lowerTargetId,lowerTargetIndex] = getRedirectedTarget(id,lower);

		hurt(upperTargetId,upperTargetIndex,1);
		hurt(lowerTargetId,lowerTargetIndex,1);

		console.log("bones!!! " + upperTargetId + " " + upperTargetIndex);
		checkDead();
	}
	removeTargets(id,index);
	return true;
}
function removeTargets(id,index) {
	if (id>=0) {
		for (var i in enemies) {
			var newTargets = [];
			for (var j in enemies[i].targets) {
				if (enemies[i].targets[j][0]==id&&enemies[i].targets[j][1]==index) {
					continue;
				} else {
					newTargets.push([enemies[i].targets[j][0],enemies[i].targets[j][1]]);
				}
			}
			enemies[i].targets = newTargets;
		}
	}
}
function getTargetters(id,index) {
	if (id<0) {
		console.log("HOWWWW");
		return [];
	}
	var indices = [];
	for (var i in enemies) {
		for (var j in enemies[i].targets) {
			var oldId = enemies[i].targets[j][0];
			var oldIndex = enemies[i].targets[j][1];
			var keywords = enemies[i].dice[enemies[i].side][2];
			var [redId,redIndex] = getRedirectedTarget(oldId,oldIndex);
			if (redId==id&&redIndex==index) {
				indices.push(i);
			}
			var cleave = false;
			var descend = false;
			if (keywords.includes("cleave")) {
				cleave = true;
			}
			if (keywords.includes("descend")) {
				descend = true;
			}
			if (cleave||descend) {
				var [upper,lower] = cleaveIndices(oldId,oldIndex);
				if (cleave) {
					[redId,redIndex] = getRedirectedTarget(oldId,upper);
					if (redId==id&&redIndex==index) {
						indices.push(i);
					}
				}
				[redId,redIndex] = getRedirectedTarget(oldId,lower);
				if (redId==id&&redIndex==index) {
					indices.push(i);
				}
			}
		}
	}
	return indices;
}
function checkDead() { // only for hp
	var lethal = false;
	for (var i in dice) {
		for (var j in dice[i]) {
			if (dice[i][j].hp<=0&&!dice[i][j].dead) {
				if (kill(i,j)) {
					lethal=true;
				}
				//dice[i][j].dead=true;
			}
		}
	}
	for (var i in enemies) {
		if (enemies[i].hp<=0&&!enemies[i].dead) {
			var [upper,lower] = cleaveIndices(-2,i);
			if (kill(-2,i)) {
				lethal=true;
			}
			//enemies[i].dead=true;
			
			if (enemies[i].hp<=-2) {
				if (upper!=-1) {
					if (enemies[upper].bandit) {
						getDice(-2,upper).dead=true;
					}
				}
				if (lower!=-1) {
					if (enemies[lower].bandit) {
						getDice(-2,lower).dead=true;
					}
				}
			}
		}
	}
	return lethal;
}
function removeBlock() {
	for (var i in dice) {
		for (var j in dice[i]) {
			dice[i][j].block=0;
		}
	}
	for (var i in enemies) {
		if (!enemies[i].golem) {
			enemies[i].block=0;
		}
	}
}
function backupDice() {
	console.log("backup dice");
	for (var i in initialDice) {
		for (var j in initialDice[i]) {
			/*if (dice[i][j].duplicate) {
				console.log("ummm");
				dice[i][j].dice=structuredClone(initialDice[i][j].dice);
			}*/
		}
	}
	initialDice=[];
	for (var i in dice) {
		initialDice.push([]);
		for (var j in dice[i]) {
			initialDice[i].push(structuredClone(dice[i][j]));
		}
	}
}
function recoverDice() {
	dice=[];
	for (var i in initialDice) {
		dice.push([]);
		for (var j in initialDice[i]) {
			dice[i].push(structuredClone(initialDice[i][j]));
		}
	}
}
function backupMana() {
	initialMana=[];
	for (var i in mana) {
		initialMana.push([]);
		for (var j in mana[i]) {
			initialMana[i].push(mana[i][j]);
		}
	}
}
function recoverMana() {
	mana=[];
	for (var i in initialMana) {
		mana.push([]);
		for (var j in initialMana[i]) {
			mana[i].push(initialMana[i][j]);
		}
	}
}
function backupSpells() {
	initialSpells=[];
	for (var i in spells) {
		initialSpells.push([]);
		for (var j in spells[i]) {
			initialSpells[i].push(structuredClone(spells[i][j]));
		}
	}
}
function recoverSpells() {
	spells=[];
	for (var i in initialSpells) {
		spells.push([]);
		for (var j in initialSpells[i]) {
			spells[i].push(structuredClone(initialSpells[i][j]));
		}
	}
}
function backupRerolls() {
	initialRerolls=rerolls;
}
function recoverRerolls() {
	rerolls=initialRerolls;
}
function backupEnemies() {
	initialEnemies=[];
	for (var i in enemies) {
		initialEnemies.push(structuredClone(enemies[i]));
	}
}
function recoverEnemies() {
	enemies=[];
	for (var i in initialEnemies) {
		enemies.push(structuredClone(initialEnemies[i]));
	}
}
function backup() {
	backupDice();
	backupEnemies();
	backupMana();
	backupSpells();
	backupRerolls();
	actionQueue=[];
}
function recover() {
	recoverDice();
	recoverEnemies();
	recoverMana();
	recoverSpells();
	recoverRerolls();
}
var keywordInfo = {
	"pain": "damages itself by pips",
	"death": "dies",
	"guilt": "dies if lethal",
	"cleave": "also hits adjacent units",
	"engage": "double pips if used on full hp target",
	"pristine": "double pips if user is full hp",
	"poison": "applies poison equal to pips",
	"descend": "also hits right unit",
	"steel": "extra pips equal to block",
	"bloodlust": "gains pips equal to number of damaged enemies",
	"chain": "double pips if shares keyword with previous dice",
	"copycat": "copies keywords of previous dice",
	"deathwish": "double pips if dying",
	"defy": "+1 pip for each incoming damage",
	"duplicate": "turns all other dice to this side for a turn",
	"eliminate": "target must have least hp in a row",
	"era": "+1 pip for each elapsed turn",
	"exert": "user is stunned for a turn",
	"focus": "double pips if same target as previous dice",
	"growth": "+1 pip for each time this side is used this fight",
	"heavy": "target must have most hp in a row",
	"rampage": "can use again if lethal",
	"ranged": "can hit ranged targets",
	"selfshield": "shields user for pips",
	"singleUse": "can only use once per fight",
	"steel": "+1 pip for each block on user",
	"smith": "gives target bonus pips equal to pips on damage and defense sides",
	"vitality": "increases max hp of target by pips",
	"weaken": "decreases pips of target by pip amount for next turn",
	"cantrip": "activates when rolled",
};
var keywordColours = {
	"pain": 0xFF0000,
	"death": 0xDDBB99,
	"guilt": 0xFF8800,
	"cleave": 0xDDBB99,
	"engage": 0xBBBB00,
	"pristine": 0x00AAAA,
	"poison": 0x008800,
	"descend": 0xDDBB99,
	"steel": 0x888888,
	"bloodlust": 0xFF0000,
	"chain": 0xFF00FF,
	"copycat": 0xDDBB99,
	"deathwish": 0x880088,
	"defy": 0xBBBB00,
	"duplicate": 0x000088,
	"eliminate": 0xFF0000,
	"era": 0x000088,
	"exert": 0x880088,
	"focus": 0xFF8800,
	"growth": 0x008800,
	"heavy": 0xBBBB00,
	"rampage": 0x880088,
	"ranged": 0xDDBB99,
	"selfshield": 0xDDBB99,
	"singleUse": 0xFF8800,
	"steel": 0x888888,
	"smith": 0xDDBB99,
	"cantrip": 0xFF00FF,
}
var actionInfo = {
	"attack": "damages target",
	"defend": "shields target",
	"attack all": "damages all of a group",
	"attack all all": "damages everyone but themselves",
	"nothing": "hi liam",
	"stun": "stuns a target with equal or less hp",
	"reuse": "can use a dice again",
	"redirect": "makes actions targetting that unit target this unit instead",
	"selfheal": "heals itself",

};
var equipmentInfo = {
	"wolf ears": "set max hp to 6",
	"leather vest": "increase max hp by 1",
	"scar": "increase max hp by 5 empty hp",
	"doom blade": "replace blanks with attack 3 death",
	"ballet shoes": "swap left and rightmost faces",
	"big shield": "replace left side by defend 4",
	"compass": "rotate sides clockwise around middle",
	"rusty plate": "replace middle with blank, increase max hp by 3",
	"corset": "replace left with blank, increase middle by one pip",
	"polearm": "replace damage sides with top side",
	"leather gloves": "copy rightmost side onto top and bottom sides",
	"ace of spades": "increase left side by two pips, decrease other sides by two pips",
	"big hammer": "replace left side by attack 5 heavy, replace middle with blank",
	"kilt": "copy right side to rightmost side",
	"origami": "swap each side with its opposite side",
	"buckler": "replace middle with defend 3 bloodlust",
	"rain of arrows": "replace top with attack 1 ranged duplicate",
	"peaked cap": "copy middle side onto left side",
	"wandify": "add singleUse and one pip to right and rightmost sides",
	"autumn leaf": "add growth to rightmost side",
	"worn arms": "replace top side with attack 2, replace bottom side with defend 2",
	"enchanted shield": "gain 1 block at the start of each turn",
	"longbow": "replace top and bottom sides with attack 2 ranged",
	"aegis": "replace middle with defend 1 duplicate steel",
	"diving suit": "replace two right sides with dice to the right (or the leftmost dice if already rightmost)",
	"whetstone": "+1 pip for each basic damage side (no keywords)",
	"clover": "+1 pip to left side, -2 pips to middle",
	"ladder": "replace middle with dice to the left (or rightmost dice if already leftmost)",
	"dragonhide gloves": "copy middle to top and bottom sides",
	"troll nose": "+1 regen",
	"shuriken": "add ranged and chain to right sides",
	"obol": "add deathwish to right sides",
	"chainmail": "+3 max hp",
	"demon eye": "+2 pips and add pain to left side",
	"whiskers": "replace middle with attack 1 ranged copycat, replace right with attack 1 copycat, replace rightmost with defend 1 copycat",
	"glowing egg": "add growth to left side",
	"longsword": "replace middle row with attack 3",
	"ordinary triangle": "+1 pips to sides with 3 pips",
	"cocoon": "-1 pips and add era to every side",
	"monocle": "add engage to middle",
	"doomblade": "+1 pip and add guilt to every damage side",
	"mini crossbow": "replace top with attack 2 engage ranged",
	"whiskey": "+3 hp and +6 more empty hp",
	"twisted flax": "+1 pip to top and bottom, -1 pip to middle",
	"braids": "copy left side to middle",
	"ocular amulet": "+1 pip to left side",
	"demonic deal": "+2 pips and add pain to all sides",
	"wrench": "+1 pip to middle",
	"water": "+1 pip to left and right sides, -1 pip to middle and rightmost sides",
	"iron helm": "+6 hp",
	"metal studs": "+1 pips to all defend/selfshield sides",
	"ornate hilt": "add selfshield to all damage sides",
	"twisted bar": "all sides have 2 pips",
	"anvil": "add steel to middle",
	"troll blood": "+2 regen",
	"poison dip": "add poison to top and bottom",
	"brimstone": "x3 pips to rightmost side",
	"mirror mask": "replace all sides with dice on the left (or rightmost if already leftmost)",
	"bullseye": "add engage to middle column",
	"olympian trident": "add cleave to middle",
	"singularity": "+2 pips to right sides",
	"helm of power": "x2 pips to left side",
	"triple shuriken": "add chain and ranged to all sides",
	"collar": "add copycat to top and bottom sides",
	"dumbbell": "+4 pips to sides with at least 4 pips",
	"silk cape": "copy left side to middle row",
	"eye of horus": "+1 pip to all sides",
	"shiny gauntlets": "add pristine to top and bottom sides",
	"big heart": "replace middle with heal 7",
	"castor root": "replace blanks with heal 1",
	"change of heart": "replace heals with shields, retaining pips and keywords",
	"seedling": "replace left side with attack 2 growth",
	"tincture": "add cleanse to rightmost side",
	"sorcery notes": "replace left with mana 1 cantrip and middle with blank",
	"whey": "add vitality to left side",
	"reagents": "replace right sides with blank and heal 1 regen",
	"bowl": "change middle column to original sides",
	"memory": "change left side to original side",
	"quiver": "replace five right sides with attack 1 ranged",
	"wand of wand": "replace middle with attack 1 singleUse inflict singleUse",
	"iron heart": "add exert and +1 pips to all sides",
	"balisong": "replace left side with attack 1 cantrip",
	"tower shield": "replace middle with defend 7 heavy",
	"powdered mana": "replace blanks with mana 1",
	"flickering blade": "replace rightmost side with attack 1 copycat",
	"blessed water": "replace middle with heal 3 vitality",
	"sapphire": "replace middle with mana 2",
	"citrine ring": "+1 pip to rightmost side",
	"rejuvenation wand": "replace top and bottom sides with heal 10 singleUse",
	"twin daggers": "replace top and bottom sides with attack 1 cantrip",
	"fletching": "add ranged to left side",
	"terrarium": "change right sides to shield 2 growth and mana 1 growth",
	"learn flare": "learn flare: 4 mana deal 5 damage",
	"syringe": "if there are less than 2 heroes alive in your row, all sides have cantrip",
	"siphon": "add pain and +1 pip to all mana/manaGain sides",
	"pure heart pendant": "replace middle with heal 3 cleanse",
	"shortsword": "replace right sides with attack 2",
	"tiara": "add selfheal to mana/manaGain sides",
	"ink bottle": "replace blank sides with defend 1 cantrip",
	"magic staff": "set all mana/manaGain sides to 2 pips",
	"soup": "replace defend sides with defendheal, retaining pips and keywords",
	"fangs": "add selfheal to left side",
	"eyepatch": "remove keywords from left side",
	"alembic": "replace middle side with inflict pain manaGain",
	"chakram": "replace defend sides with ranged damage, retaining pips and keywords",
	"splitting arrows": "replace right sides with attack 1 ranged cleave",
	"hissing ring": "replace middle with attack 2 poison",
	"dynamo": "add singleUse and era to right sides"
	"mana jelly": "add singleUse and cantrip to all mana/manaGain sides",
	"simplicity": "+1 pip to attack, defend, heal and mana sides with no keywords",
	"sack of mana": "replace top and bottom with blanks, replace middle with mana 4",
	"door": "if there are four or more monsters, +2 pips to all defend sides",
	"lens": "add focus to all heal/selfheal sides",
	"pauldron": "+2 pips to top side, -2 pips to bottom side",
	"nunchaku": "add chain to the top and bottom sides",
	"glyph of purity": "add cleanse to top and bottom sides",
	"shining bow": "add ranged to all damage sides",
	"wand grips": "add singleUse and 2 pips to left side",
	"bandana": "add cantrip to all pipless sides",
	"early grave": "add pain and cantrip to all sides with at least 3 pips",
	"hourglass": "+1 pips to all sides on first turn",
	"blindfold": "remove all keywords",
	"jump": "replace top and bottom with left side, replace left side with blank",
	"lich eye": "+2 pips and add death and manaGain to all sides",
	"conduit": "replace middle with mana 2 duplicate",
	"kite shield": "set all defend sides to 3 pips",
	"karma": "add selfheal to heal sides, add selfshield to defend sides, add pain to attack sides",
	"dragon pipe": "+1 pips to all heal/selfheal sides",
	"two reeds": "+1 pips to all sides with even pips",
	"tentacle": "add repel to right sides",
	"wandcraft": "replace all sides with mana singleUse sides, retaining pips and keywords",
	"second chance": "replace right side with reuse",
	"demon claw": "add rampage and -1 pips to left side",
	"broadsword": "replace middle column with attack 4",
	"wooden bracelet": "+1 pip to all sides with no keywords",
	"pocket mirror": "copy left side to rightmost side",
	"tourmaline paraiba": "add era to all mana/manaGain sides",
	"faerie dust": "replace blank with mana 3",
	"tusk": "+1 pip to all heal/selfheal and defend/selfshield sides",
	"sapphire ring": "+1 pip to all mana/manaGain sides",
	"scorpion tail": "add weaken and pain to top and bottom sides",
	"horned viper": "add poison to two left sides",
};
function setInfo() {
	document.getElementById("info").innerHTML="";
	if (hoveringId==-2||hoveringId>=0) {
		var tempUnit = getDice(hoveringId,hoveringIndex);
		var tempFace = getFace(hoveringId,hoveringIndex,tempUnit.side);
		var type = tempFace[0];
		document.getElementById("info").innerHTML+=type+": "+actionInfo[type]+"<br />";
		for (var i in tempFace[2]) {
			var keyword = tempFace[2][i];
			var colour = "";
			if (keywordColours[keyword]) {
				colour = keywordColours[keyword].toString(16);
				if (colour.length<6) {
					var extra = 6-colour.length;
					for (var j=0; j<extra; j++) {
						colour = '0'+colour;
					}
				}
			}
			document.getElementById("info").innerHTML+="<b style=\"color:#"+colour+"\">"+keyword+"</b>: "+keywordInfo[keyword];
			document.getElementById("info").innerHTML+="<br />";
		}
		if (tempUnit.ranged) {
			document.getElementById("info").innerHTML+="can only be targetted by ranged or if nonranged are killed!<br />";
		}
		if (tempUnit.goblin) {
			document.getElementById("info").innerHTML+="flees if alone<br />";
		}
		if (tempUnit.thorns>0) {
			document.getElementById("info").innerHTML+="damages attacker by "+tempUnit.thorns+"<br />";
		}
		if (tempUnit.quartz) {
			document.getElementById("info").innerHTML+="dies at exactly 2hp<br />";
		}
		if (tempUnit.bandit) {
			document.getElementById("info").innerHTML+="flees if adjacent enemy is overkilled for at least 2<br />";
		}
		if (tempUnit.blind) {
			document.getElementById("info").innerHTML+="flees if no enemy damaged this turn<br />";
		}
		if (tempUnit.basilisk) {
			document.getElementById("info").innerHTML+="petrifies dice side when targetted<br />";
		}
		if (tempUnit.hydra) {
			document.getElementById("info").innerHTML+="dies after taking 5 instances of damage in a single turn<br />";
		}
		if (tempUnit.warchief) {
			document.getElementById("info").innerHTML+="monsters get +1 pips while alive<br />";
		}
		if (tempUnit.lich) {
			document.getElementById("info").innerHTML+="spawns a bones every 5hp<br />";
		}
		if (tempUnit.zombie) {
			document.getElementById("info").innerHTML+="dies if taking at least 4 damage in one instance<br />";
		}
		if (tempUnit.slimer) {
			document.getElementById("info").innerHTML+="spawns a slimelet every 5hp<br />";
		}
		if (tempUnit.slimequeen) {
			document.getElementById("info").innerHTML+="spawns a slimer every 5hp<br />";
		}
		if (tempUnit.bramble) {
			document.getElementById("info").innerHTML+="gives all enemy sides singleUse<br />";
		}
		if (tempUnit.bones) {
			document.getElementById("info").innerHTML+="deals 1 damage to adjacent units on death<br />";
		}
		if (tempUnit.chomp) {
			document.getElementById("info").innerHTML+="first 5hp damages left enemies when removed, last 5hp damages right enemies when removed<br />";
		}
		if (tempUnit.ironHp.length>0) {
			document.getElementById("info").innerHTML+="iron hp must be removed separately<br />";
		}
		if (tempUnit.ghostHp.length>0) {
			document.getElementById("info").innerHTML+="removing ghost hp makes enemy immune for the rest of the turn<br />";
		}
		if (hoveringId==-2) {
			if (tempUnit.stunHp.length>0) {
				document.getElementById("info").innerHTML+="removing white hp stuns unit<br />";
			}
		}
		if (tempUnit.ogre) {
			document.getElementById("info").innerHTML+="removing white hp increases pips by 1 for rest of fight<br />";
		}
		if (tempUnit.armour>0) {
			document.getElementById("info").innerHTML+="reduces dice damage by "+tempUnit.armour+"<br />";
		}
	} else if (hoveringId==-4) {
		if (selectedId==-3||selectedId==-2||selectedId>=0) {
			var tempUnit = getDice(selectedId,selectedIndex);
			var tempDice = getDice(selectedId,selectedIndex).dice;
			var tempSide = hoveringIndex;
			if (tempSide>-1) {
				var tempFace = getFace(selectedId,selectedIndex,tempSide);
				var type = tempFace[0];
				document.getElementById("info").innerHTML+=type+": "+actionInfo[type];
				for (var i in tempFace[2]) {
					document.getElementById("info").innerHTML+="<br />";
					var keyword = tempFace[2][i];
					var colour = "";
					if (keywordColours[keyword]) {
						colour = keywordColours[keyword].toString(16);
								if (colour.length<6) {
							var extra = 6-colour.length;
							for (var j=0; j<extra; j++) {
								colour = '0'+colour;
							}
						}
					}
					document.getElementById("info").innerHTML+="<b style=\"color:#"+colour+"\">"+keyword+"</b>: "+keywordInfo[keyword];
				}
			} else if (selectedId>=0) {
				if (tempSide==-2) {
					document.getElementById("info").innerHTML+=equipmentInfo[tempUnit.equipment[0]];
				} else if (tempSide==-3) {
					document.getElementById("info").innerHTML+=equipmentInfo[tempUnit.equipment[1]];
				}
			}
		}
	} else if (hoveringId==-5) {
		document.getElementById("info").innerHTML+=equipmentInfo[items[hoveringIndex]];
	} else if (hoveringId==-6) {
		document.getElementById("info").innerHTML+=equipmentInfo[inventory[hoveringIndex]];
	} else if (hoveringId==-10) {
		//
	}
}
var enemyTurn=true;
var upgradeTurn=false;
var equipmentTurn=false;
var inventoryTurn = false;
var upgrades=[];
var upgradeIndices=[];
var upgradeCount=2;
var items=[];
var itemCount=2;
var yellows=[["fighter","ruffian","lazy","brigand","hoarder"],["scrapper","brute","berserker","sinew","collector","gladiator","whirl","soldier"],
		["wanderer","brawler","curator","barbarian","captain","bash","leader","eccentric","veteran"]];
var yellowTracker=structuredClone(yellows);
var greys=[["defender","buckle","squire","alloy","wallop"],["warden","knight","pilgrim","guardian","monk","armorer"],["gigadefender","stalwart","valkyrie","keeper","stoic","prince","paladin"]];
var greyTracker=structuredClone(greys);
var upgradeSent = false;
function gameLoop(delta){
	switch(gameState) {
		case "waiting":
			if (ready) {
				//socket.emit("ready");
			}
			break;
		case "ingame":
			
			if (host){
				//new turn
				if (!playerTurn&&enemyTurn) {
					for (var i in dice) {
						for (var j in dice[i]) {
							dice[i][j].incoming=0;
						}
					}
					enemyRoll();
					enemyTurn=false;
					socket.emit("player turn");
				}
				if (!cantripPhase) {
					var allEnemiesDead = true;
					for (var i in enemies) {
						if (!enemies[i].dead) {
							allEnemiesDead=false;
						}
					}
					if (allEnemiesDead&&!upgradeSent) {
						socket.emit("reset enemy");
						socket.emit("send","heal all");
						upgradeSent = true;
						round++;
						for (var i in dice) {
							spawnFight();
							//socket.emit("spawn","slimelet");
							//socket.emit("spawn","slimelet");
						}
						if ((round-1)%2==1) {
							socket.emit("send","upgrade");
						} else {
							socket.emit("send","equipment");
						}
			
						//upgradeSent = true;
					}
				}
			}
			updateText();
			break;
		case "upgrade":
			if (!upgradeTurn) {
				var lowestTier=-1;
				for (var i in dice[playerId]) {
					if (lowestTier==-1||lowestTier>dice[playerId][i].tier) {
						lowestTier=dice[playerId][i].tier;
					}
				}
				var lowestIndices = [];
				for (var i in dice[playerId]) {
					if (dice[playerId][i].tier==lowestTier) {
						lowestIndices.push(i);
					}
				}
				console.log("tier "+lowestTier);
				console.log("length "+lowestIndices.length);

				yellowTracker=structuredClone(yellows);
				greyTracker=structuredClone(greys);
				
				for (var i=0;i<upgradeCount;i++) {
					var list;
					var lowIdx = Math.floor(Math.random()*lowestIndices.length);
					var idx = lowestIndices[lowIdx];
					console.log("index " + idx);
					if (dice[playerId][idx].colour=="yellow") {
						list=yellowTracker;
					} else if (dice[playerId][idx].colour=="grey") {
						list=greyTracker;
					} else {
						console.log("HOW");
						break;
					}
					if (list.length>lowestTier&&lowestTier>=0) {
						if(list[lowestTier].length>0) {
							var upIdx = Math.floor(Math.random()*list[lowestTier].length);
							upgrades.push(list[lowestTier][upIdx]);
							upgradeIndices.push(idx);
							list[lowestTier].splice(upIdx,1);
						}
					}
					if (lowestIndices.length>1) {
						lowestIndices.splice(lowIdx,1);
					}
				}
				upgradeTurn=true;
			}
			break;
		case "equipment":
			if (!equipmentTurn) {
				var tier = Math.floor(round/2);

				equipmentTracker = structuredClone(equipmentList[tier-1]);
				var item = "uhh";

				if (tier<=equipmentList.length) {
					for (var i=0; i<itemCount; i++) {
						if (equipmentTracker.length>0) {
							var idx = Math.floor(Math.random()*equipmentTracker.length);
							item = equipmentTracker[idx];
							items.push(item);
							equipmentTracker.splice(idx,1);
						}
					}
				}
				equipmentTurn=true;
			}
			break;
		case "inventory":
			if (!inventoryTurn) {
				inventoryTurn=true;
			}
			break;
	}
	render();
}

var equipmentList = [["ballet shoes","doom blade","scar","wolf ears","compass","rusty plate","corset","big shield","big heart", "castor root", 
"change of heart", "seedling", "tincture", "sorcery notes", "whey", "reagents", "bowl", "memory", "quiver", "wand of wand", "iron heart", "balisong"],
["polearm","ace of spades","wandify","big hammer","kilt","origami","buckler","rain of arrows","peaked cap","autumn leaf","worn arms","tower shield", 
"powdered mana", "flickering blade", "blessed water", "sapphire", "citrine ring", "rejuvenation wand", "twin daggers", "fletching","terrarium"],
["enchanted shield","longbow","aegis","diving suit","whetstone","clover","ladder","learn flare","syringe", "siphon", "pure heart pendant", "shortsword"],
["tiara","dragonhide gloves","shuriken","troll nose","obol","chainmail","demon eye","whiskers","glowing egg","ink bottle", "magic staff", "soup", "fangs", 
"eyepatch", "alembic", "chakram", "splitting arrows", "hissing ring", "dynamo", "mana jelly"],
["longsword","ordinary triangle","cocoon","monocle","doomblade","mini crossbow","whiskey","simplicity", "sack of mana", "door", "lens", "pauldron", 
"nunchaku", "glyph of purity", "shining bow", "wand grips","bandana","early grave"],
["twisted flax","braids","ocular amulet","demonic deal","wrench","water","hourglass", "blindfold", "jump",  "lich eye", "conduit", "kite shield", 
"karma"],
["iron helm","metal studs","ornate hilt","twisted bar","anvil","troll blood","dragon pipe", "two reeds", "tentacle", "wandcraft", "second chance", 
"demon claw", "broadsword", "wooden bracelet", "pocket mirror"],
["poison dip","brimstone","mirror mask","bullseye","olympian trident","singularity","tourmaline paraiba", "faerie dust", "tusk", "sapphire ring", 
"scorpion tail"],
["helm of power","triple shuriken","collar","dumbbell","silk cape","eye of horus","horned viper"],
["shiny gauntlets"]];
var equipmentTracker = [];

var rerollText = new PIXI.Text(0);
rerollText.x=0;
rerollText.y=300;
app.stage.addChild(rerollText);
var rerollButton = new PIXI.Text("REROLL");
rerollButton.x = 130;
rerollButton.y = 310;
app.stage.addChild(rerollButton);
rerollButton.alpha=0;
var lockButton = new PIXI.Text("LOCK");
lockButton.x = 260;
lockButton.y = 310;
lockButton.alpha=0;
app.stage.addChild(lockButton);
var endButton = new PIXI.Text("END TURN");
endButton.x = 130;
endButton.y = 310;
endButton.alpha=0;
app.stage.addChild(endButton);
var unlockButton = new PIXI.Text("UNLOCK");
unlockButton.x = 280;
unlockButton.y = 310;
unlockButton.alpha=0;
app.stage.addChild(unlockButton);
var undoButton = new PIXI.Text("UNDO");
undoButton.x = 160;
undoButton.y = 360;
undoButton.alpha=0;
app.stage.addChild(undoButton);
var readyButton = new PIXI.Text("READY");
readyButton.x = 130;
readyButton.y = 310;
readyButton.alpha=1;
app.stage.addChild(readyButton);
var rerollButtonWidth = 130;
var lockButtonWidth = 100;
var endButtonWidth = 160;
var unlockButtonWidth=130;
var undoButtonWidth=100;
var readyButtonWidth=120;

var spells = [];
var initialSpells = [];
var spellCoords = [];
var spellTemplate = {
	name:"burst",
	costType:"mana",
	cost:2,
	keywords:[],
	userId:-1,
	userIndex:-1,
	singleCast:false,
};
function initSpells() {
	var totalList = []; 
	for (var i in dice) {
		var list = [structuredClone(spellTemplate)];//name,cost type,cost,keywords,user dead
		for (var j in dice[i]) {
			for (var k in dice[i][j].spells) {
				var tempSpell = structuredClone(dice[i][j].spells[k]);
				list.push(tempSpell);
			}
			for (var k in dice[i][j].equipmentSpells) {
				var tempSpell = structuredClone(dice[i][j].equipmentSpells[k]);
				list.push(tempSpell);
			}
		}
		totalList.push(list);
	}
	spells = totalList;
}
function repositionSpells() {
	for (var i in spells[playerId]) {
		var x = i*SQUARE;
		var y = 250;
		spellCoords[i]=[x,y];
	}
}
function costAvailable(userId,type,cost) {
	switch(type) {
		case "damage":
			return getDiceCost(userId,{damage:cost}).length!=0;
			/*var damageCounter = cost;
			for (var i in dice[playerId]) {
				var tempFace = getFace(playerId,i,dice[playerId][i].side);
				var tempType = tempFace[0].split(" ")[0];
				if (tempType=="attack"&&!dice[playerId][i].used&&!dice[playerId][i].dead) {
					damageCounter -= getPips(tempType,tempFace[1],tempFace[2],playerId,i);
				}
				if (damageCounter<=0) {
					return true;
				}
			}*/
		case "captain":
			return getDiceCost(userId,{damage:3,shield:3}).length!=0;
		case "prince":
			return getDiceCost(userId,{damage:1,shield:1,heal:1,blank:1}).length!=0;
		case "blank":
			return getDiceCost(userId,{blank:cost}).length!=0;
		case "mana":
		default:
			if (mana[userId][0]>=cost) {
				return true;
			}
			break;
	}
	return false;
}
function payCost(id,spellIndex) {

	var type = spells[id][spellIndex].costType;
	var cost = spells[id][spellIndex].cost;

	if (!costAvailable(id,type,cost)) {
		return false;
	}
	var diceCostList = [];
	switch (type) {
		case "damage":
			diceCostList = getDiceCost(id,{damage:cost});
			
			/*var damageCounter = cost;
			for (var i in dice[id]) {
				var tempFace = getFace(id,i,dice[id][i].side);
				var tempType = tempFace[0].split(" ")[0];
				if (tempType=="attack"&&!dice[id][i].used&&!dice[id][i].dead) {
					dice[id][i].used=true;
					damageCounter -= getPips(tempType,tempFace[1],tempFace[2],id,i);
				}
				if (damageCounter<=0) {
					break;
				}
			}*/
			break;
		case "captain":
			diceCostList = getDiceCost(id,{damage:3,shield:3});
			break;
		case "prince":
			diceCostList = getDiceCost(id,{damage:1,shield:1,heal:1,blank:1});
			break;
		case "blank":
			diceCostList = getDiceCost(id,{blank:cost});
			break;
		case "mana":
		default:
			mana[id][0]-=cost;
			break;
	}
	for (var i in diceCostList) {
				dice[id][diceCostList[i]].used=true;
			}
	return true;
}
function getDiceCost(id,costList) {//e.g. for prince, costList:{damage:1,shield:1,heal:1,blank:1}
	var list = structuredClone(costList);
	var usedList = [];
	for (var i in dice[id]) {
		if (dice[id][i].used||dice[id][i].dead) {
			continue;
		}
		var tempFace = getFace(id,i,dice[id][i].side);
		var pips = tempFace[1];
		var keywords = tempFace[2];
		var tempType = tempFace[0].split(" ")[0];
		var included = false;
		for (var j in list) {
			if (list[j]<=0) {
				continue;
			}
			switch (j) {
				case "damage":
					if (tempType=="attack") {
						list[j]-=pips;
						included=true;
					}
					break;
				case "shield":
					if (tempType=="defend"||tempType=="defendheal"||keywords.includes("selfshield")) {
						list[j]-=pips;
						included=true;
					}
					break;
				case "heal":
					if (tempType=="heal"||tempType=="defendheal"||keywords.includes("selfheal")) {
						list[j]-=pips;
						included=true;
					}
					break;
				case "blank":
					if (tempType=="nothing"||dice[id][i].exert>0||dice[id][i].singleUse[dice[id][i].side]||dice[id][i].petrify[dice[id][i].side]) {
						list[j]--;
						included=true;
					}
					break;
			}
		}
		if (included) {
			usedList.push(i);
		}
		var allCounted = true;
		for (var j in list) {
			if (list[j]>0) {
				allCounted = false;
			}
		}
		if (allCounted) {
			break;
		}
	}
	var allCounted = true;
	for (var j in list) {
		if (list[j]>0) {
			allCounted = false;
		}
	}
	if (!allCounted) {
		return [];
	} else {
		return usedList;
	}
}
function spellUsable(id,index) {
	if (spells[id][index].singleCast) {
		return false;
	}
	if (spells[id][index].userId==-1) {
		return true;
	}
	if (!getDice(spells[id][index].userId,spells[id][index].userIndex).dead) {
		return true;
	}
	return false;
}
function render() {
	rerollText.text = "Rerolls: "+rerolls;

	g.clear();
	g.lineStyle(2,0x000000);
	g.beginFill(0xFFFFFF);
	g.drawRect(0,0,800,600);
	if (gameState=="waiting") {
		readyButton.alpha=1;
		g.drawRect(readyButton.x-10,readyButton.y-10,readyButtonWidth,SQUARE);
		for (i in enemyHpText) {
			enemyHpText[i].alpha=0;
		}
		for (i in enemyBlockText) {
			enemyBlockText[i].alpha=0;
		}
	} else if (gameState=="ingame") {
		readyButton.alpha=0;
		if (!locked) {
			rerollButton.alpha=1;
			lockButton.alpha=1;
			endButton.alpha=0;
			unlockButton.alpha=0;
			undoButton.alpha=0;
			g.drawRect(rerollButton.x-10,rerollButton.y-10,rerollButtonWidth,SQUARE);
			g.drawRect(lockButton.x-10,lockButton.y-10,lockButtonWidth,SQUARE);
		} else {
			rerollButton.alpha=0;
			lockButton.alpha=0;
			endButton.alpha=1;
			unlockButton.alpha=1;
			undoButton.alpha=1;

			g.drawRect(rerollButton.x-10,rerollButton.y-10,endButtonWidth,SQUARE);
			g.drawRect(unlockButton.x-10,unlockButton.y-10,unlockButtonWidth,SQUARE);
			g.drawRect(undoButton.x-10,undoButton.y-10,undoButtonWidth,SQUARE);
		}
	} else if (gameState=="inventory") {
		readyButton.alpha=1;
		g.drawRect(readyButton.x-10,readyButton.y-10,readyButtonWidth,SQUARE);
		rerollButton.alpha=0;
			lockButton.alpha=0;
			endButton.alpha=0;
			unlockButton.alpha=0;
			undoButton.alpha=0;
	} else {
		readyButton.alpha=0;
		rerollButton.alpha=0;
			lockButton.alpha=0;
			endButton.alpha=0;
			unlockButton.alpha=0;
			undoButton.alpha=0;
		
	}
	//if (gameState == "ingame"||gameState=="upgrade") {
		for (var i in dice) {
			for (var j in dice[i]) {

				g.lineStyle(2,0x000000);
				g.beginFill(0xFFFFFF);
				//if(locked) {
					if (i==selectedId&&j==selectedIndex) {
						g.beginFill(0x777777);
					}
				//}
				if (i==playerId) {
					if (!locked) {
						if (dice[i][j].locked) {
							g.beginFill(0xAAAAFF);
						}
					}
				}

				if (dice[i][j].dead) {
					g.beginFill(0x880000);
				} else if (dice[i][j].used) {
					g.beginFill(0xBBBBBB);
				}
				
				//g.drawRect(dice[i][j].x,dice[i][j].y,dice[i][j].width,dice[i][j].height);
				var face = dice[i][j].dice[dice[i][j].side];
				var type = dice[i][j].dice[dice[i][j].side][0];
				var pips = dice[i][j].dice[dice[i][j].side][1];
				var originalPips = dice[i][j].dice[dice[i][j].side][1];
				var keywords = dice[i][j].dice[dice[i][j].side][2];

				face=getFace(i,j,dice[i][j].side);
				type = face[0];
				pips = face[1];
				originalPips = face[1];
				keywords = face[2];
				/*if (dice[i][j].duplicate[0]!=0) {
					face = dice[i][j].duplicate;
					pips = dice[i][j].duplicate[1];
					keywords = structuredClone(dice[i][j].duplicate[2]);
				}*/
				var pristine = false;
				var deathwish = false;
				var steel = false;
				var defy = false;
				var exert=false;
				var bloodlust = false;
				for (var k in keywords) {
					switch (keywords[k]) {
						case "pristine":
							pristine=true;
							break;
						case "deathwish":
							deathwish=true;
							break;
						case "steel":
							steel=true;
							break;
						case "defy":
							defy=true;
							break;
						case "bloodlust":
							bloodlust=true;
							break;
					}
				}
				/*pips+=dice[i][j].keywordModifiers[dice[i][j].side];
				if (steel) {
					pips+=dice[i][j].block;
				}
				if (defy) {
					pips+=Math.max(0,dice[i][j].incoming-dice[i][j].block);
				}
				if (bloodlust) {
					for (i in enemies[i]) {
						if (enemies[i].hp<enemies[i].maxHp) {
							pips++;
						}
					}
				}
				if (pristine) {
					if (dice[i][j].hp==dice[i][j].maxHp) {
						pips*=2;
					}
				}
				if (deathwish) {
					if (checkDying(dice[i][j])) {
						pips*=2;
					}
				}*/
				pips = getPips(type,pips,keywords,i,j);
				if (dice[i][j].exert>0||dice[i][j].singleUse[dice[i][j].side]||dice[i][j].petrify[dice[i][j].side]) {
					pips=0;
					exert=true;
				}
				setTargetBorder(i,j);
				if (!exert) {
					drawFace(face,dice[i][j].x,dice[i][j].y,i,j);
				} else {
					g.drawRect(dice[i][j].x,dice[i][j].y,dice[i][j].width,dice[i][j].height);
				}
				drawHealthBar(i,j);
				//drawPips(pips,dice[i][j].x,dice[i][j].y,originalPips);
				/*switch(dice[i][j].dice[dice[i][j].side][0]) {
					case "attack":
						g.beginFill(0xFF0000);
						if (pristine) {
							g.beginFill(0x00FFFF);
						}
						g.drawRect(dice[i][j].x+15,dice[i][j].y+15,20,20);
						break;
					case "defend":
						g.beginFill(0x999999);
						if (pristine) {
							g.beginFill(0x008888);
						}
						g.drawRect(dice[i][j].x+15,dice[i][j].y+15,20,20);
						break;
				}*/
			}
		}

		//spells = getSpells();
		repositionSpells();
		for (var i in spells[playerId]) {
			g.lineStyle(2,0x000000)
			g.beginFill(0xFFFF00);
			if (selectedId==-10&&selectedIndex==i) {
				g.beginFill(0x888800);
			}
			if (!spellUsable(playerId,i)) {
				g.beginFill(0x880000);
			}
			g.drawRect(spellCoords[i][0],spellCoords[i][1],SQUARE,SQUARE);
		}
	//}
	if (selectedId!=-1) {
		drawNet(selectedId,selectedIndex,netX,netY);
	} else if (hoveringId!=-1) {
		drawNet(hoveringId,hoveringIndex,netX,netY);
	}
		/*for (var i in rolledDice) {

			drawPips(rolledDice[i][1],i*50,0);
			switch(rolledDice[i][0]) {
			case "attack":
			g.beginFill(0xFF0000);
			g.drawRect(i*50+15,15,20,20);
			break;
			case "defend":
			g.beginFill(0x999999);
			g.drawRect(i*50+15,15,20,20);
			break;
		}
		}*/
		
	
	for (var i in enemies) {

		g.lineStyle(2,0x000000);
		g.beginFill(0xFFFFFF);
		//if(locked) {
			if (selectedId==-2&&i==selectedIndex) {
				g.beginFill(0x777777);
			}
		//}
		if (enemies[i].ranged) {
			g.beginFill(0xBBBBBB);
		}
		if (enemies[i].dead) {
			g.beginFill(0x880000);
		}
		//g.drawRect(i*50,100,50,50);
		face=getFace(-2,i,enemies[i].side);
			type = face[0];
			pips = face[1];
			originalPips = face[1];
			keywords = face[2];
			pips = getPips(type,pips,keywords,-2,i);
		//drawFace(enemies[i].dice[enemies[i].side],enemies[i].x,enemies[i].y);
		setEnemyTargetBorder(i);
		if (enemies[i].exert) {
			g.drawRect(enemies[i].x,enemies[i].y,enemies[i].width,enemies[i].height);
		} else {
			drawFace(face,enemies[i].x,enemies[i].y,-2,i);
		}
		if (enemies[i].ghost) {
			g.beginFill(0xBBBBBB,0.7);
			g.drawRect(enemies[i].x,enemies[i].y,enemies[i].width,enemies[i].height);
		}
		drawHealthBar(-2,i);

		//drawPips(enemies[i].dice[enemies[i].side][1],enemies[i].x,enemies[i].y);
		g.lineStyle(1,0xFF0000,0.5);
		//g.alpha=0.5;
		var cleave = false;
		var descend = false;
		var keywords = enemies[i].dice[enemies[i].side][2];
		for (var j in keywords) {
			switch (keywords[j]) {
				case "cleave":
					cleave=true;
					break;
				case "descend":
					descend=true;
					break;
			}
		}
		if (!enemies[i].exert) {
			for (var j in enemies[i].targets) {
				g.moveTo(enemies[i].x+enemies[i].width/2,enemies[i].y+enemies[i].height);
				var targetId=-1;
				var targetIndex=-1;
				[targetId,targetIndex] = getRedirectedTarget(enemies[i].targets[j][0],enemies[i].targets[j][1]);
				setTargetLine(targetId,targetIndex,i);
				g.lineTo(getDice(targetId,targetIndex).x+getDice(targetId,targetIndex).width/2,getDice(targetId,targetIndex).y);
				/*if (cleave) {
					if (validDice(enemies[i].targets[j][0],enemies[i].targets[j][1]-1)) {
						g.moveTo(enemies[i].x+25,enemies[i].y);
						g.lineTo(getDice(enemies[i].targets[j][0],enemies[i].targets[j][1]-1).x+25,50);
					}
					if (validDice(enemies[i].targets[j][0],enemies[i].targets[j][1]+1)) {
						g.moveTo(enemies[i].x+25,enemies[i].y);
						g.lineTo(getDice(enemies[i].targets[j][0],enemies[i].targets[j][1]+1).x+25,50);
					}
				}*/
				var id = enemies[i].targets[j][0];
				var index = enemies[i].targets[j][1];
				var pos = getDice(id,index).position;
				if (cleave||descend){
					/*var nextUpPos = pos-1;
					while (nextUpPos>=0&&cleave) {
						var nextUp = getUnitByPosition(nextUpPos);
						if (!getDice(id,nextUp).dead) {
							g.moveTo(enemies[i].x+enemies[i].width/2,enemies[i].y+enemies[i].height);
							[targetId,targetIndex] = getRedirectedTarget(id,nextUp);
							var tempDice = getDice(targetId,targetIndex);
							g.lineTo(tempDice.x+tempDice.width/2,tempDice.y);
							break;
						}
						nextUpPos--;
					}
					var nextDownPos = pos+1;
					while (nextDownPos<=dice[id].length-1) {
						var nextDown = getUnitByPosition(nextDownPos);
						if (!getDice(id,nextDown).dead) {
							g.moveTo(enemies[i].x+enemies[i].width/2,enemies[i].y+enemies[i].height);
							[targetId,targetIndex] = getRedirectedTarget(id,nextDown);
							
							var tempDice = getDice(targetId,targetIndex);
							g.lineTo(tempDice.x+tempDice.width/2,tempDice.y);
							break;
						}
						nextDownPos++;
					}*/
					var upper,lower;
					[upper,lower]=cleaveIndices(id,index);
					if (upper!=-1&&cleave) {
						g.moveTo(enemies[i].x+enemies[i].width/2,enemies[i].y+enemies[i].height);
						[targetId,targetIndex] = getRedirectedTarget(id,upper);
						var tempDice = getDice(targetId,targetIndex);
						setTargetLine(targetId,targetIndex,i);
						g.lineTo(tempDice.x+tempDice.width/2,tempDice.y);
					}
					if (lower!=-1) {
						g.moveTo(enemies[i].x+enemies[i].width/2,enemies[i].y+enemies[i].height);
						[targetId,targetIndex] = getRedirectedTarget(id,lower);
						
						var tempDice = getDice(targetId,targetIndex);
						setTargetLine(targetId,targetIndex,i);
						g.lineTo(tempDice.x+tempDice.width/2,tempDice.y);
					}

				}
				/*if (enemies[i].targets[j][0]==playerId) {
					g.lineTo(ownedDice[enemies[i].targets[j][1]].x+25,50);
				} else if (enemies[i].targets[j][0]<playerId) {
					g.lineTo(unownedDice[enemies[i].targets[j][0]][enemies[i].targets[j][1]].x+25,50);
				} else {
					g.lineTo(unownedDice[enemies[i].targets[j][0]-1][enemies[i].targets[j][1]-1].x+25,50);
				}*/
			}
		}
		//g.alpha=1;

		g.lineStyle(2,0x000000);
	//g.beginFill(0xFFFFFF);
	//drawFace(enemies[i].dice[enemies[i].side],i*50,100);
		/*switch(enemies[i].dice[enemies[i].side][0]) {
			case "attack":
				g.beginFill(0xFF0000);
				g.drawRect(i*50+15,115,20,20);
				break;
			case "outer":
				g.beginFill(0x555555);
				g.drawRect(i*50+15,115,20,20);
				break;
			case "attack all" :
				g.beginFill(0xFF0000);
				g.drawRect(i*50+10,110,30,30);
				break;
		}*/
	}

	if (gameState=="upgrade") {
		for (var i in upgrades) {
			g.lineStyle(2,0x000000);
			g.beginFill(0xFF00FF);
			if (i==selectedIndex) {
				g.beginFill(0x880088);
			}
			g.drawRect(50*i,upY,50,50);
			g.lineStyle(2,0x888800);
			g.moveTo(SQUARE*i+SQUARE/2,upY);
			g.lineTo(dice[playerId][upgradeIndices[i]].x+SQUARE/2,dice[playerId][upgradeIndices[i]].y+SQUARE);
		}
	}
	if (gameState=="equipment") {
		for (var i in items) {
			g.lineStyle(2,0x000000);
			g.beginFill(0xFF00FF);
			if (i==selectedIndex) {
				g.beginFill(0x880088);
			}
			g.drawRect(50*i,upY,50,50);
		}
	}
	if (gameState=="inventory") {
		drawInventory();
	}
	g.lineStyle(2,0x000000);
}

function setTargetLine(targetId,targetIndex,enemyIndex) {
	if ((targetId==selectedId&&targetIndex==selectedIndex)||(selectedId==-2&&selectedIndex==enemyIndex)) {
		g.lineStyle(2,0xFF0000,1);
	} else {
		g.lineStyle(1,0xFF0000,0.25);
	}
}

function setTargetBorder(targetId,targetIndex) {
	var highlight=false;
	if (selectedId==-2) {
		for (var i in enemies[selectedIndex].targets) {
			var upper=-1;
			var lower=-1;
			var keywords = enemies[selectedIndex].dice[enemies[selectedIndex].side][2];
			if (keywords.includes("cleave")) {
				[upper,lower] = cleaveIndices(targetId,targetIndex);
			}
			if (targetId==enemies[selectedIndex].targets[i][0]&&(targetIndex==enemies[selectedIndex].targets[i][1]
				||upper==enemies[selectedIndex].targets[i][1]||lower==enemies[selectedIndex].targets[i][1])) {
				highlight=true;
				break;
			}
		}
	}
	if (targetId==selectedId&&targetIndex==selectedIndex) {
		highlight=true;
	}
	if (highlight) {
		g.lineStyle(2,0xFF0000);
	} else {
		g.lineStyle(2,0x000000);
	}
}

function setEnemyTargetBorder(enemyIndex) {
	var highlight=false;
	if (selectedId==-2&&selectedIndex==enemyIndex) {
		highlight=true;
	}
	for (var i in enemies[enemyIndex].targets) {
		var [targetId,targetIndex] = enemies[enemyIndex].targets[i];
		var upper=-1;
		var lower=-1;
		var keywords = enemies[enemyIndex].dice[enemies[enemyIndex].side][2];
		if (keywords.includes("cleave")) {
			[upper,lower] = cleaveIndices(targetId,targetIndex);
		}
		if (selectedId==enemies[enemyIndex].targets[i][0]&&(selectedIndex==enemies[enemyIndex].targets[i][1]
			||upper==selectedIndex||lower==selectedIndex)) {
			highlight=true;
			break;
		}
	}
	if (highlight) {
		g.lineStyle(2,0xFF0000);
	} else {
		g.lineStyle(2,0x000000);
	}
}

var inventoryCoords=[];
function processInventoryCoords() {
	for (var i in inventory) {
		inventoryCoords[i]=[400+(i%8)*SQUARE,400+Math.floor(i/8)*SQUARE];
	}
}
function drawInventory() {
	processInventoryCoords();
	g.lineStyle(2,0x000000);
	for (var i in inventory) {
		g.beginFill(0xFFFFFF);
		if (selectedId==-6&&selectedIndex==i) {
			g.beginFill(0x888888);
		}
		g.drawRect(inventoryCoords[i][0],inventoryCoords[i][1],SQUARE,SQUARE);
		drawItem(inventory[i],inventoryCoords[i][0],inventoryCoords[i][1]);
	}
}
function drawItem(item,x,y) {
	switch (item) {
		default:
			g.beginFill(0xFFFF00);
			g.drawRect(x+15,y+15,20,20);
			break;
	}
}

function cleaveIndices(id, index) {
	var tempList = getDiceList(id);
	var pos = getDice(id,index).position;
	var upper = -1;
	var lower = -1;
		var nextUpPos = pos-1;
		while (nextUpPos>=0) {
			var nextUp = getUnitByPosition(id,nextUpPos);
			if (nextUp==-1) {
				nextUpPos--;
				continue;
			}
			if (!getDice(id,nextUp).dead) {
				upper = nextUp;
				break;
			}
			nextUpPos--;
		}
		var nextDownPos = pos+1;
		while (nextDownPos<=tempList.length-1) {
			var nextDown = getUnitByPosition(id,nextDownPos);
			if (nextDown==-1) {
				nextDownPos++;
				continue;
			}
			if (!getDice(id,nextDown).dead) {
				lower = nextDown;
				break;
			}
			nextDownPos++;
		}
		return [upper,lower];
}

var upY=600-50;
var netX=50;
var netY=400;

function drawNet(id,index,x,y) {
	if (!validDice(id,index)) {
		return;
	}

	var dice = getDice(id,index).dice;
	var tempFaces = [];
	for (var i=0; i<6; i++) {
		tempFaces[i] = getFace(id,index,i);
	}
	g.beginFill(0xFFFFFF);
	drawFace(tempFaces[0],x,y+50,id,index);
	g.beginFill(0xFFFFFF);
	drawFace(tempFaces[1],x+50,y+50,id,index);
	g.beginFill(0xFFFFFF);
	drawFace(tempFaces[2],x+50,y,id,index);
	g.beginFill(0xFFFFFF);
	drawFace(tempFaces[3],x+50,y+50*2,id,index);
	g.beginFill(0xFFFFFF);
	drawFace(tempFaces[4],x+50*2,y+50,id,index);
	g.beginFill(0xFFFFFF);
	drawFace(tempFaces[5],x+50*3,y+50,id,index);

	for (var i in getDice(id,index).equipment) {
		if (i>itemNetCoords.length) {
			//uhhh
		} else {
			drawItem(getDice(id,index).equipment[i],x+itemNetCoords[i][0],y+itemNetCoords[i][1]);
		}
	}
}
var itemNetCoords = [[0,0],[0,2*50]];

function drawFace(face,x,y,id,index) {
	g.drawRect(x,y,50,50);
	g.lineStyle(2,0x000000);
	var typeCheck = face[0].split(" ");
	var tempType = typeCheck[0];
	var big=false;
	if (typeCheck.length>1) {
		if (typeCheck[1]=="all") {
			big=true;
		}
	}
	switch(tempType) {
		case "attack":
			g.beginFill(0xFF0000);
			break;
		case "defend":
			g.beginFill(0x999999);
			break;
		case "outer":
			g.beginFill(0x555555);
			break;
		case "attack all":
		case "attack all all":
			g.beginFill(0xFF0000);
			break;
		case "stun":
			g.beginFill(0x000088);
			break;
		case "reuse":
			g.beginFill(0x0000FF);
			break;
		case "redirect":
			g.beginFill(0x000000);
			break;
		case "summon":
			g.beginFill(0x0000FF);
			break;
		case "undying":
			g.beginFill(0xFFFFFF);
			break;
		case "inflict":
			g.beginFill(0x00FF00);
			break;
		case "mana":
			g.beginFill(0x00FFFF);
			break;
		case "defendheal":
			g.beginFill(0x880088);
			break;
		case "revive":
			g.beginFill(0xFF8800);
			break;
		case "heal":
			g.beginFill(0x880000);
			break;
		case "reroll":
			g.beginFill(0xFF00FF);
			break;
		case "nothing":
			g.beginFill(0xFFFFFF);
			g.lineStyle(0,0x000000);
	}
	if (big){
		g.drawRect(x+10,y+10,30,30);
	} else {
		g.drawRect(x+15,y+15,20,20);
	}
	var originalPips = face[1];
	var pips = face[1];
	var keywords = face[2];
	drawKeywords(x,y,keywords);
	if (id==-2||id>=0) {
		pips = getPips(face[0],face[1],face[2],id,index);
	}
	drawPips(pips,x,y,originalPips);
}

function drawKeywords(x,y,keywords) {
	g.lineStyle(0,0x000000);
	for (var i in keywords) {
		g.beginFill(keywordColours[keywords[i]]);
		g.drawRect(x+5+i*6,y+SQUARE-11,6,6);
	}
	g.lineStyle(2,0x000000);
}

function drawHealthBar(id,index) {
	var tempUnit = getDice(id,index);
	var hp = tempUnit.hp;
	var maxHp = tempUnit.maxHp;
	var x = tempUnit.x;
	var y = tempUnit.y;
	var iron = tempUnit.ironHp;
	var ghosts = tempUnit.ghostHp;
	var slimes = tempUnit.slimeHp;
	var slimers = tempUnit.slimerHp;
	var boneses = tempUnit.lichHp;
	g.lineStyle(0,0x000000);
	drawSolidHealth(x,y,1,maxHp,0xFF0000);
	drawSolidHealth(x,y,1,hp,0x00FF00);
	drawSolidHealth(x,y,Math.max(1,hp-tempUnit.poison-tempUnit.incomingPoison+1),hp,0x008800);
	var effectiveIncoming=Math.max(0,tempUnit.incoming-tempUnit.block);
	drawSolidHealth(x,y,Math.max(1,hp-tempUnit.poison-tempUnit.incomingPoison-effectiveIncoming+1),hp-tempUnit.poison-tempUnit.incomingPoison,0xBBBB00);
	drawHealth(x,y,iron,0x888888);
	drawHealth(x,y,ghosts,0x888888);
	
	if (id==-2) {
		drawHealth(x,y,slimes,0xDDDDDD);
		drawHealth(x,y,slimers,0xDDDDDD);
		drawHealth(x,y,boneses,0xDDDDDD);
		drawHealth(x,y,tempUnit.stunHp,0x888888);
		drawHealth(x,y,tempUnit.quartzHp,0x888888);
		drawHealth(x,y,tempUnit.ogreHp,0xAAAA00);
		drawHealth(x,y,tempUnit.chompUpHp,0xFF8800);
		drawHealth(x,y,tempUnit.chompDownHp,0xFF8800);
	}
	/*g.beginFill(0xFF0000);
	g.drawRect(x+5,y+5,4*maxHp,4);
	g.beginFill(0x00FF00);
	g.drawRect(x+5,y+5,4*hp,4);
	g.beginFill(0x888888);
	for (var i in iron) {
		g.drawRect(x+5+4*(iron[i]-1),y+5,4,4);
	}
	for (var i in ghosts) {
		g.drawRect(x+5+4*(ghosts[i]-1),y+5,4,4);
	}

	g.beginFill(0xDDDDDD);
	for (var i in slimes) {
		g.drawRect(x+5+4*(slimes[i]-1),y+5,4,4);
	}

	for (var i in slimers) {
		g.drawRect(x+5+4*(slimers[i]-1),y+5,4,4);
	}
	for (var i in boneses) {
		g.drawRect(x+5+4*(boneses[i]-1),y+5,4,4);
	}*/
	g.lineStyle(2,0x000000);
}

function drawSolidHealth(x,y,minHp,hp,colour) {
	//g.beginFill(colour);
	var list=[];
	for (var i=minHp-1; i<hp; i++) {
		list.push(i+1);
		//g.drawRect(x+5+4*((i-1)%10),y+5+5*Math.floor((i-1)/10),4,4);
	}
	drawHealth(x,y,list,colour);
}

function drawHealth(x,y,hpList,colour) {
	g.beginFill(colour);
	for (var i=0; i<hpList.length; i++) {
		g.drawRect(x+5+4*((hpList[i]-1)%10),y+5+5*Math.floor((hpList[i]-1)/10),4,4);
	}
}

function drawPips(pips,x,y,originalPips) {
	g.beginFill(0x000000);
	for (var k=0; k<pips; k++) {
		if (k>=originalPips) {
			g.lineStyle(2,0xFF0000);
		}
		g.drawRect(x+40,y+46-5*k,5,1);
	}
	g.lineStyle(2,0x000000);
}

/*function save() {
	var info = {
		guessList:guessList,
		xdd:xdd,
	}
	localStorage.setItem("sheeple",JSON.stringify(info));
}
function load() {
	var g = JSON.parse(localStorage.getItem("sheeple"));
	if (g !== null) {
		if (typeof g.guessList !== "undefined") {
			guessList = g.guessList;
		}
		if (typeof g.xdd !== "undefined") {
			if (xdd != g.xdd) {
				guessList = [];
			}
		}
	}
}*/