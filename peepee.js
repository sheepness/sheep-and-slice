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
var round=1;

var inventory=["wolf ears","leather vest"];
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
	for (var i in dice)
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
			}
			adjustDeathHp(i,j);
			for (var k in dice[i][j].equipment) {
				switch (dice[i][j].equipment[k]) {
					case "scar":
						dice[i][j].maxHp+=5;
						break;
				}
			}
		}
	}
}
socket.on("unequip",(id,index,itemIndex)=> {
	if (gameState=="inventory") {
		inventory.push(getDice(id,index).equipment[itemIndex]);
		getDice(id,index).equipment.splice(itemIndex,1);
	processEquipment();
	updateText();
	}
	
});
function unequip(index) {
	for (var i in getDice(playerId,index).equipment) {
		socket.emit("unequip",playerId,index,0);
	}
}
socket.on("action",(userId,userIndex,targetId,targetIndex) => {
	if (gameState=="ingame") {
		var user = getDice(userId,userIndex);
		var target = getDice(targetId,targetIndex);
		if (!user.used&&gameState=="ingame") {
			document.getElementById("history").innerHTML+="<b>Player "+(parseInt(userId)+1)+"</b> used their <b>"+getDice(userId,userIndex).name+" ("+userIndex+")</b> on ";
			if (targetId!=-2) {
				document.getElementById("history").innerHTML+="<b>Player "+(parseInt(targetId)+1)+"'s</b> "
			} else {
				document.getElementById("history").innerHTML+="enemy ";
			}
			document.getElementById("history").innerHTML+="<b>"+getDice(targetId,targetIndex).name+" ("+targetIndex+")</b><br />";
			actionQueue.push([userId,userIndex,targetId,targetIndex]);
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
socket.on("roll",(id,index,side)=> {
	if(!locked&&gameState=="ingame") {
		var owner = getDice(id,index);
		owner.side = side;
		//rolledDice[id][index][0]=type;
		//rolledDice[id][index][1]=num;
	}
});
socket.on("lock",()=> {
	locked=true;
	lockedText.alpha=0;
	/*for (var i in ownedDice) {
		previousDice[i]=structuredClone(ownedDice[i]);
	}*/
	backupDice();
	/*for (var i in dice) {
		for (var j in dice[i]) {
			initialDice[i][j]=structuredClone(dice[i][j]);
		}
	}*/
});
socket.on("enemy roll",(enemy,side) => {
	enemies[enemy].side=side;
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
	width:50,
	height:50,
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
	thorns:0,
	petrify:0,
	magicImmune:false,
	keywordModifiers:[0,0,0,0,0,0],
	duplicate:false,
	singleUse: [false,false,false,false,false,false],
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
};
var fightList = [[["goblin","boar"],["bee","wolf","archer","bee"],["wolf","archer","archer"],["boar","bee","archer"]],[["wolf","boar","bee"]],[["wolf","wolf","archer"],["goblin","goblin","bee","archer"]],[["troll"],["alpha","wolf"],["rat","bramble"]]];
var bossList = [[["troll"],["alpha","wolf"],["rat","bramble"]],[["slimelet","slimequeen"]],[["bones","lich","bones","bones"]],[["archer","slate","trollking"]],[["archer","caw","dragon"]]];

function generateFight(roundNo) {
	if (roundNo%4==0) {
		var bossNo = roundNo/4-1;
		return bossList[bossNo][Math.floor(Math.random()*bossList[bossNo].length)];
	} else {
		var totalWeight = 4+Math.floor(roundNo/4)+roundNo%4;
		var mobList = [];
		var stage = Math.floor(roundNo/4);
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
			var index = Math.floor(Math.random()*mobs[size][stage].length);
			var randMob = mobs[size][stage][index];
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
	militia: {minRound:2,maxRound:2,size:2,
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
		dice:[["selfheal",3,["vitality"]],["attack",2,["inflict pain"]],["attack",2,["inflict pain"]],["attack",2,["inflictpain"]],["summon bones",1,[]],["summon bones",1,[]]],},
	grave: {minRound:3,maxRound:3,size:1,
		dice:[["summon bones",1,[]],["summon bones",1,[]],["summon bones",1,[]],["summon bones",1,[]],["summon bones",1,[]],["summon bones",1,[]]]},
	shade: {minRound:2,maxRound:2,size:1,
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
		dice:[["attack",5,[]],["attack",5,[]],["attack",2,["poison"]],["attack",2,["poison"]],["attack",5,[]],["attack all all all",1,["poison"]]],},
	bandit: {minRound:2,maxRound:4,size:2,
		dice:[["attack",6,[]],["attack",6,[]],["attack",5,[]],["attack",5,[]],["attack",2,["poison"]],["attack",2,["poison"]]],},
	blind: {minRound:2,maxRound:4,size:2,
		dice:[["attack all",2,[]],["attack all",2,[]],["attack all",1,[]],["attack all",1,[]],["attack all",1,[]],["attack all",1,[]]]},
	golem: {minRound:2,maxRound:5,size:2,
		dice:[["attack",0,["steel"]],["attack",0,["steel"]],["attack",5,[]],["attack",5,[]],["attack",2,["selfshield"]],["attack",2,["selfshield"]]],},
	warchief: {minRound:2,maxRound:4,size:2,
		dice:[["attack",2,[]],["attack",2,[]],["attack",2,[]],["attack",2,[]],["attack",0,["cleave"]],["attack",0,["cleave"]]],},
	saber: {minRound:6,maxRound:6,size:2,
		dice:[["attack",12,["death"]],["attack",5,[]],["attack",8,["exert"]],["attack",8,["exert"]],["attack",5,[]],["attack",5,[]]],},
	ghost: {minRound:2,maxRound:4,size:3,
		dice:[["attack",6,["eliminate"]],["attack",6,["eliminate"]],["attack",4,["descend"]],["attack",4,["descend"]],["attack",2,["poison"]],["attack",2,["poison"]]],},
	caw: {minRound:4,maxRound:5,size:3,
		dice:[["attack",7,[]],["attack",7,[]],["attack",7,[]],["attack",7,[]],["attack",3,["cleave"]],["attack",3,["cleave"]]],},
	slate: {minRound:3,maxRound:5,size:3,
		dice:[["attack",7,[]],["attack",7,[]],["attack",7,[]],["attack",7,[]],["attack all",2,[]],["attack all",2,[]]],},
	wizz: {minRound:3,maxRound:5,size:3,
		dice:[["attack",4,["weaken"]],["heal all",3,[]],["attack all",2,[]],["attack all",2,[]],["summon bones",2,[]],["summon bones",2,[]]],},
	demon: {minRound:4,maxRound:5,size:3,
		dice:[["attack",6,["inflict pain"]],["attack",6,["inflict pain"]],["attack all",2,[]],["attack all",2,[]],["summon imp",1,[]],["summon imp",1,[]]],},
	spiker: {minRound:3,maxRound:5,size:3,
		dice:[["attack",7,[]],["attack",7,[]],["attack",7,[]],["attack",7,[]],["attack all",2,[]],["attack all",2,[]]],},
	basilisk: {minRound:4,maxRound:5,size:3,
		dice:[["attack",2,["cleave"]],["attack",2,["cleave"]],["attack",2,["poison"]],["attack",2,["poison"]],["attack",2,["cleave"]],["attack",1,["cleave","weaken"]]],},
	cyclops: {minRound:2,maxRound:4,size:3,
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
		dice:[["attack",2,["petrify"]],["attack",2,["petrify"]],["summon bones",2,[]],["attack all",1,["weaken"]],["attack all",1,["weaken"]]]},
	dragon: {minRound:6,maxRound:6,size:4,
		dice:[["attack all",5,[]],["attack all",5,[]],["attack",15,["heavy"]],["attack",15,["heavy"]],["attack",3,["cleave","poison"]],["attack",3,["cleave","poison"]]],},
	hydra: {minRound:4,maxRound:5,size:3,
		dice:[["attack",5,["cleave"]],["attack",5,["cleave"]],["attack",10,[]],["attack",10,[]],["attack",5,["cleave"]],["attack",2,["weaken","cleave"]]],},
	
}
socket.on("spawn",(enemy) => {
	spawnEnemy(enemy,enemies.length);
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
			temp.ranged=true;
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
			break;
		case "gnoll":
			temp.hp=3;
			temp.maxHp=3;
			break;
		case "carrier":
			temp.hp=10;
			temp.maxHp=10;
			temp.poison=2;
			break;
		case "bandit":
			temp.hp=8;
			temp.maxHp=8;
			break;
		case "blind":
			temp.hp=5;
			temp.maxHp=5;
			break;
		case "golem":
			temp.hp=2;
			temp.maxHp=2;
			temp.block=8;
			break;
		case "warchief":
			temp.hp=6;
			temp.maxHp=6;
			break;
		case "saber":
			temp.hp=10;
			temp.maxHp=10;
			break;
		case "ghost":
			temp.hp=6;
			temp.maxHp=6;
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
			break;
		case "cyclops":
			temp.hp=15;
			temp.maxHp=15;
			break;
		case "chomp":
			temp.hp=10;
			temp.maxHp=10;
			break;
		case "banshee":
			temp.hp=10;
			temp.maxHp=10;
			break;
		case "slimequeen":
			temp.hp=13;
			temp.maxHp=13;
			break;
		case "trollking":
			temp.hp=20;
			temp.maxHp=20;
			break;
		case "lich":
			temp.hp=20;
			temp.maxHp=20;
			temp.ranged=true;
			break;
		case "dragon":
			temp.hp=40;
			temp.maxHp=40;
			break;
		case "hydra":
			temp.hp=20;
			temp.maxHp=20;
			break;
		
		default:
			break;
	}
	console.log(enemy);
	temp.dice=structuredClone(fightDiceTemplates[enemy]).dice;
	temp.x=enemies.length*temp.width;
	temp.y=0;
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
		socket.emit("spawn","wisp");
		socket.emit("spawn","wisp");
		socket.emit("spawn","wisp");
		socket.emit("spawn","wisp");
		socket.emit("spawn","wisp");
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
				var randSelect = Math.floor(Math.random()*yellows[0].length);
				starting[j]=yellows[0][randSelect];
			}
			for (var j in starting) {
				socket.emit("init dice",i,j,starting[j]);
			}
		}
		socket.emit("start");
	}
});
socket.on("inventory ready",()=> {
	/*for (var i in dice[playerId]) {
		socket.emit("init dice",playerId,i,dice[playerId][i].name);
	}*/
	processEquipment();
	if (host) {
		
		backupDice();
		/*for (var i in dice) {
			for (var j in dice[i]) {
				initialDice[i][j]=structuredClone(dice[i][j]);
			}
		}*/
		socket.emit("send","resume");
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
	block: 0,
	name: "fighter",
	used: false,
	x: 0,
	y: 0,
	width: 50,
	height: 50,
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
	petrify:0,
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
	maxEquipment:2,
	equipment:[],
	position:0,
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
		
	};
socket.on("init dice",(id,index,unit)=> {
	console.log("init dice" + dice[id].length);
	spawnDice(id,index,unit,index);
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
	if (previouslyDied(id,index)) {
		dice[id][index].hp=Math.floor(dice[id][index].maxHp/2);
	}
}
function resetDie(id, index) {
	spawnDice(id,index,dice[id][index].name,dice[id][index].position);
	for (var i in deadTracker) {
		if (id==deadTracker[i][0]&&index==deadTracker[i][1]) {
			dice[deadTracker[i][0]][deadTracker[i][1]].hp=Math.max(1,Math.floor(dice[deadTracker[i][0]][deadTracker[i][1]].maxHp/2));
			break;
		}
	}
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
socket.on("start",()=> {
	console.log("start");
	readyText.alpha=0;
	initDice();
	gameState="ingame";
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
	for (var i in dice) {
						for (var j in dice[i]) {
							dice[i][j].incoming=0;
							if (dice[i][j].exert>0) {
								dice[i][j].exert--;
							}
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
			if (actionQueue.length>0) {
				actionQueue.splice(actionQueue.length-1,1);
				document.getElementById("history").innerHTML+="<b>Player "+culprit+":</b> ";
				document.getElementById("history").innerHTML+="Undo<br />";
			}
			processQueue();
			break;
		case "end turn":
			document.getElementById("history").innerHTML+="<b>Player "+culprit+"</b> ";
			document.getElementById("history").innerHTML+="ended turn<br />";
			resolveAttacks();
			reposition();
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
			actionQueue=[];

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
			actionQueue=[];
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
			actionQueue=[];
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

			processEquipment();
			deadTracker=[];
			gameState="ingame";
			
			readyText.alpha=0;
			readySent = false;
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

var SQUARE = 50;

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
			for (var i in tempFace[2]) {
				document.getElementById("dice name").innerHTML+=" "+tempFace[2][i];
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
				for (var i in tempFace[2]) {
					document.getElementById("dice name").innerHTML+=" "+tempFace[2][i];
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
		} else if (hoveringId==-5) {
			document.getElementById("dice name").innerHTML=items[hoveringIndex];
			setInfo();
		} else if (hoveringId==-6) {
			document.getElementById("dice name").innerHTML=inventory[hoveringIndex];
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
				}
			}
			if (hoveringId!=-1) {
				if (selectedId != playerId) {
					if (hoveringId>=0||hoveringId==-2) {
						if (!getDice(hoveringId,hoveringIndex).used&&!getDice(hoveringId,hoveringIndex).dead) {
							selectedId=hoveringId;
							selectedIndex=hoveringIndex;
						}
					}
				} else {//if (selectedId==playerId){
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
										if (enemies[i].dead||(enemies[i].ranged&&!ranged)) {
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

							
							if (heavyCheck&&rangedCheck) {
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
					if (!dice[playerId][i].locked) {
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

		console.log("im fucken ready");
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

var mobs = []; //mobs[size][stage][index]

function init() {

	var en = ["boar","boar"];
	for (var i in diceTemplates) {
		diceTemplates[i].name=i;
	}
	for (var i=0; i<4; i++) {
		mobs.push([]);
		for (var j=0; j<6; j++) {
			mobs[i].push([]);
		}
	}
	for (var i in fightDiceTemplates) {
		for (var j=fightDiceTemplates[i].minRound; j<=fightDiceTemplates[i].maxRound; j++) {
			mobs[fightDiceTemplates[i].size-1][j-1].push(i);
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
	backupDice();
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
				if (notDyingUnitsIndices.length>0) {
					targetIndex = notDyingUnitsIndices[Math.floor(Math.random()*notDyingUnitsIndices.length)];
				} else if (notDeadIndices.length>0) {
					targetIndex = notDeadUnitsIndices[Math.floor(Math.random()*(notDeadUnitsIndices.length))];
				} else {
					console.log("HOW IS EVERYONE DEAD");
					targetIndex = Math.floor(Math.random()*dice[targetId].length);;
				}
				sendTarget(i,targetId,targetIndex)
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
			case "summon":
			default:
				break;
		}
		socket.emit("enemy roll",i,roll);
		calcIncoming();
	}
}

function sendTarget(i,targetId,targetIndex) {
	if (!host) {
		console.log("HOW");
		return;
	}
	socket.emit("enemy target",i,targetId,targetIndex);
	enemies[i].targets.push([parseInt(targetId),parseInt(targetIndex)]);
}

function rollDice() {
	if(rerolls<=0) {return false;}
	for (var i in dice[playerId]) {
		var d = dice[playerId][i];
		var roll = Math.floor(Math.random()*6);
		if (!dice[playerId][i].locked)
		{socket.emit("roll",playerId,i,roll);}
	}
	console.log("roll!");
	return true;
	
		//socket.emit("lock");
}

var focusTargetId = -1;
var focusTargetIndex = -1;
var focusKeywords = [];
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
function action(die,side,userId,userIndex,targetId,targetIndex) {
	var user = getDice(userId,userIndex);
	var oldId = targetId;
	var oldIndex = targetIndex;
	[targetId,targetIndex] = getRedirectedTarget(targetId,targetIndex);
	
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
	if (user.exert>0||user.singleUse[side]) {
		return;
	}
	var type = die[side][0];
	var pips = die[side][1];
	var originalPips = pips;
	var keywords = structuredClone(die[side][2]);

	var tempFace = getFace(userId,userIndex,side);
	type = tempFace[0];
	pips = tempFace[1];
	keywords = tempFace[2];

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
	pips = getPips(type,pips,keywords,user);
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
		if (type=="attack all"&&userId!=-2) {
			if (oldId==-2) {
				for (var i in enemies) {
					if (i!=oldIndex) {
						[tempId,tempIndex] = getRedirectedTarget(oldId,i);
						if (!getDice(tempId,tempIndex).dead)
						{act(type,pips,userId,userIndex,tempId,tempIndex);}
					}
				}
			} else if (oldId>=0) {
				for (var i in dice[oldId]) {
					if (i!=oldIndex) {
						[tempId,tempIndex] = getRedirectedTarget(oldId,i);
						if (!getDice(tempId,tempIndex).dead)
						{act(type,pips,userId,userIndex,tempId,tempIndex);}
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
		user.block+=pips;
	}

	act(type,pips,userId,userIndex,targetId,targetIndex,keywords);

	if (effects.pain) {
		hurt(user,pips);
	}
	var lethal = false;
	if (effects.death) {
		kill(userId,userIndex);
		//user.dead=true;
		lethal=true;
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
		user.singleUse[side]=true;
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
		user.keywordModifiers[side]++;
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
function getPips(type,pips,keywords,user) {
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
	pips+=user.keywordModifiers[user.side]; // 7: in combat buffs

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
			}
		}
	}
	return pips;
}

function act(type,pips,userId,userIndex,targetId,targetIndex,keywords) {
	var user = getDice(userId,userIndex);
	var target = getDice(targetId,targetIndex);
	for (var idx in keywords) {
		switch (keywords[idx]) {
			case "poison":
				target.poison+=pips;
		}
	}
	var tempType = type;
	var typeCheck = tempType.split(" ");
	var summonType = "";

	if (typeCheck[0]=="summon") {
		tempType = "summon";
		summonType = typeCheck[1];
	}
	switch (tempType) {
		case "attack":
		case "outer":
		case "attack all":
			hurt(target,pips);
			hurt(user,target.thorns);
			break;
		case "defend":
			target.block+=pips;
			break;
		case "stun":
			if (targetId>=0) {
				target.used=true;
			}
			if (targetId==-2) {
				target.targets=[];
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

function getFace(id,index,side) { // 3: apply blessings/curses, then 4,5: equipment
	if (id==-3) {
		return getDice(id,index).dice[side];
	}
	var tempUnit = structuredClone(getDice(id,index));
	var tempDice = structuredClone(getDice(id,index).dice);
	var originalSide = tempDice[side];
	var tempFace = tempDice[side];
	var equipment = tempUnit.equipment;
	if (tempUnit.duplicate) {
		tempFace = structuredClone(tempUnit.duplicateFace);
	}
	for (var i in equipment) {
		switch (equipment[i]) {
			case "longsword":
				if (side==0||side==1||side==4||side==5) {
					tempFace = ["attack",3,[]];
				}
				break;
			case "doom blade":
				if (tempFace[0]=="nothing") {
					tempFace = ["attack",3,["death"]];
				}
				break;
			case "ballet shoes":
				if (side==0) {
					tempFace = tempDice[5];
				}
				if (side==5) {
					tempFace = tempDice[0];
				}
				break;
			case "eye of horus":
				tempFace[1]++;
				break;
		}
	}
	var keywords = structuredClone(tempFace[2]);
	for (var i in keywords) {
		if (keywords[i]=="copycat") {
			for (var j in focusKeywords) {
				if (!keywords.includes(focusKeywords[j]))
					{keywords.push(focusKeywords[j]);}
			}
		}
	}
	if (id>=0) {
		for (var i in enemies) {
			if (enemies[i].bramble) {
				if (!keywords.includes("singleUse")) {
					keywords.push("singleUse");
				}
				break;
			}
		}
	}
	tempFace[2] = keywords;
	return tempFace;
}

function validDiceList(id) {
	if (id==-2||(id>=0&&id<dice.length)) {
		return true;
	} else {
		return false;
	}
}

function hurt(target, pips,unblockable) {
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
		var iron = -1;
		target.ironHp.sort();
		if (target.ironHp.length>0) {
			for (var i=target.ironHp.length-1; i>=0; i--) {
				if (target.ironHp[i]<=target.hp) {
					iron = target.ironHp[i];
					break;
				}
			}
		}
		if (iron==-1) {
			target.hp-=incoming;
		} else {
			console.log("iron" + iron);
			if (target.hp==iron) {
				target.hp--;
				target.ironHp.splice(target.ironHp.length-1,1);
			} else if (target.hp-incoming<=iron) {
				target.hp=iron;
			} else {
				target.hp-=incoming;
			}
		}
	}
}

function updateText() {
	for (var i in hpText) {
		for (var j in hpText[i]) {
			hpText[i][j].text=dice[i][j].hp;
			blockText[i][j].text=dice[i][j].block;
			incomingText[i][j].text=dice[i][j].incoming;
			var effectivePoison = dice[i][j].poison+dice[i][j].incomingPoison-dice[i][j].regen;
			poisonText[i][j].text=effectivePoison;
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
	for (var i in enemies) {
		if (i>=enemyHpText.length) {
			enemyHpText[i] = new PIXI.Text(enemies[i].hp);
			app.stage.addChild(enemyHpText[i]);
		}
			enemyHpText[i].x=enemies[i].position*50;
			enemyHpText[i].y=50;

			
		enemyHpText[i].alpha=1;
		if (i>=enemyBlockText.length) {
			enemyBlockText[i] = new PIXI.Text(enemies[i].block);
			app.stage.addChild(enemyBlockText[i]);
		}
			enemyBlockText[i].x=enemies[i].position*50;
			enemyBlockText[i].y=1.5*50;
			enemyBlockText[i].style.fill=0x888888;
			enemyBlockText[i].alpha=0;
		var effectivePoison=enemies[i].poison-enemies[i].regen;
		if (i>=enemyPoisonText.length) {
			enemyPoisonText[i] = new PIXI.Text(effectivePoison);
			app.stage.addChild(enemyPoisonText[i]);
		}
			enemyPoisonText[i].x=enemies[i].position*50+50/2;
			enemyPoisonText[i].y=1.5*50;
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
function processQueue() {
	/*for (var i in previousDice) {
		ownedDice[i]=structuredClone(previousDice[i]);
	}*/
		focusTargetId=-1;
		focusTargetIndex=-1;
		focusKeywords = [];
	/*dice=[];
	for (var i in initialDice) {
		dice.push([]);
		for (var j in initialDice[i]) {
			dice[i].push(structuredClone(initialDice[i][j]));
		}
	}*/
	recoverDice();
	recoverEnemies();

	//process items?

	/*enemies=[];
	for (var i in enemies) {
		enemies.push(structuredClone(initialEnemies[i]));
	}*/
	for (pee in actionQueue) {
		var user = getDice(actionQueue[pee][0],actionQueue[pee][1]);
		var target = getDice(actionQueue[pee][2],actionQueue[pee][3]);

		//var enemy = actionQueue[i][2];
		/*if (!enemy) {
			action(rolledDice[user][0],rolledDice[user][1],ownedDice[user],ownedDice[target]);
		} else {
			action(rolledDice[user][0],rolledDice[user][1],ownedDice[user],enemies[target]);
		}*/
		ignoreCleave = false;

		action(user.dice,user.side,actionQueue[pee][0],parseInt(actionQueue[pee][1]),actionQueue[pee][2],parseInt(actionQueue[pee][3]));
		console.log(target.hp);
		if (!user.rampage) {
			user.used=true;
		} else {
			user.rampage=false;
		}
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
		}
		//checkDead();
		for (i in enemies) {
			if (enemies[i].dead) {
				enemies[i].targets=[];
			}
		}
		calcIncoming();
		focusTargetId=actionQueue[pee][2];
		focusTargetIndex=actionQueue[pee][3];
		focusKeywords=structuredClone(user.dice[user.side][2]);
	}
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
		for (var j in enemies[i].targets) {
			var type = enemies[i].dice[enemies[i].side][0];
			var pips = enemies[i].dice[enemies[i].side][1];
			var keywords = enemies[i].dice[enemies[i].side][2];
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
	for (var i in enemies) {
		enemies[i].x=enemies[i].position*enemies[i].width;
		enemies[i].y=0;
	}
	updateText();
}

function resolveAttacks() {
	for (var i in enemies) {
		for (var j in enemies[i].targets) {
			if (!enemies[i].dead)
			{ignoreCleave = false;
				action(enemies[i].dice,enemies[i].side,-2,i,enemies[i].targets[j][0],enemies[i].targets[j][1]);}
			//action(enemies[i].dice[enemies[i].side][0],enemies[i].dice[enemies[i].side][1],enemies[i],enemies[i].targets[j]);
		}
		var tempFace = getFace(-2,i,enemies[i].side);
		var typeCheck = tempFace[0].split(" ");
		if (enemies[i].targets.length==0&&typeCheck[0]=="summon"&&!enemies[i].dead) {
			action(enemies[i].dice,enemies[i].side,-2,i,-1,-1);
		}
	}
	for (var i in enemies) {
		enemies[i].targets=[];
		if (enemies[i].caw) {
			enemies[i].ranged=false;
		}
	}
	/*for (var i in ownedDice) {
		previousDice[i]=structuredClone(ownedDice[i]);
	}*/
	checkDead();
	for (var i in dice) {
		for (var j in dice[i]) {
			/*if (dice[i][j].hp<=0) {
				dice[i][j].dead=true;
			}*/
			dice[i][j].duplicate = false;
		}
	}
	backupDice();

	//updateText();
}
function resolvePoison() {
	for (var i in dice) {
		for (var j in dice[i]) {
			//dice[i][j].hp-=dice[i][j].poison;
			//dice[i][j].hp+=dice[i][j].regen;
			if (dice[i][j].poison>dice[i][j].regen) {
				hurt(dice[i][j],dice[i][j].poison-dice[i][j].regen,true);
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
		
		var iron = -1;
		enemies[i].ironHp.sort();
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
		enemies[i].hp=Math.min(enemies[i].hp,enemies[i].maxHp);
	}
}
function kill(id,index) {
	var tempUnit = getDice(id,index);
	tempUnit.dead=true;
	if (tempUnit.bones) {
		//bones shit
		var upper,lower;
		[upper,lower] = cleaveIndices(id,index);

		var [upperTargetId,upperTargetIndex] = getRedirectedTarget(id,upper);
		var [lowerTargetId,lowerTargetIndex] = getRedirectedTarget(id,lower);

		hurt(getDice(upperTargetId,upperTargetIndex),1);
		hurt(getDice(lowerTargetId,lowerTargetIndex),1);

		console.log("bones!!! " + upperTargetId + " " + upperTargetIndex);
		checkDead();
	}
}
function checkDead() {
	var lethal = false;
	for (var i in dice) {
		for (var j in dice[i]) {
			if (dice[i][j].hp<=0&&!dice[i][j].dead) {
				kill(i,j);
				lethal = true;
				//dice[i][j].dead=true;
			}
		}
	}
	for (var i in enemies) {
		if (enemies[i].hp<=0&&!enemies[i].dead) {
			kill(-2,i);
			lethal = true;
			//enemies[i].dead=true;
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
		enemies[i].block=0;
	}
}
function backupDice() {
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
};
var actionInfo = {
	"attack": "damages target",
	"defend": "shields target",
	"attack all": "damages all of a group",
	"nothing": "hi liam",
	"stun": "stuns lol",
	"reuse": "can use a dice again",
	"redirect": "makes actions targetting that unit target this unit instead",
};
var equipmentInfo = {
	"wolf ears": "set max hp to 6",
	"leather vest": "increase max hp by 1",
	"scar": "increase max hp by 5 empty hp",
	"doom blade": "replace blanks with attack 3 death",
	"ballet shoes": "swap left and rightmost faces"
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
			document.getElementById("info").innerHTML+=keyword+": "+keywordInfo[keyword];
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
					var keyword = tempFace[2][i];
					document.getElementById("info").innerHTML+="<br />";
					document.getElementById("info").innerHTML+=keyword+": "+keywordInfo[keyword];
				}
			} else if (selectedId>=0) {
				if (tempSide==-2) {
					document.getElementById("info").innerHTML+=equipmentInfo[tempUnit.equipment[0]];
				} else if (tempSide==-3) {
					document.getElementById("info").innerHTML+=equipmentInfo[tempUnit.equipment[1]];
				}
			}
		}
	}else if (hoveringId==-5) {
		document.getElementById("info").innerHTML+=equipmentInfo[items[hoveringIndex]];
	} else if (hoveringId==-6) {
		document.getElementById("info").innerHTML+=equipmentInfo[inventory[hoveringIndex]];
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
var greys=[["defender","buckle","squire"],["warden"],["gigadefender"]];
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
				var allEnemiesDead = true;
				for (var i in enemies) {
					if (!enemies[i].dead) {
						allEnemiesDead=false;
					}
				}
				if (allEnemiesDead&!upgradeSent) {
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
					var idx = lowestIndices[Math.floor(Math.random()*lowestIndices.length)];
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
						lowestIndices.splice(idx,1);
					}
				}
				upgradeTurn=true;
			}
			break;
		case "equipment":
			if (!equipmentTurn) {
				var tier = Math.ceil((round-1)/4);

				equipmentTracker = structuredClone(equipmentList[tier-1]);
				var item = "uhh";

				if (tier<=equipmentList.length) {
					for (var i=0; i<itemCount; i++) {
						if (equipmentTracker[tier-1].length>0) {
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

var equipmentList = [["ballet shoes","doom blade","scar","wolf ears"],["polearm","ace of spades","wandify"],["enchanted shield"],["flawed diamond"],["longsword"]]
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
undoButton.x = 130;
undoButton.y = 260;
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
				pips = getPips(type,pips,keywords,dice[i][j]);
				if (dice[i][j].exert>0||dice[i][j].singleUse[dice[i][j].side]) {
					pips=0;
					exert=true;
				}
				setTargetBorder(i,j);
				if (!exert) {
					drawFace(face,dice[i][j].x,dice[i][j].y,i,j);
				} else {
					g.drawRect(dice[i][j].x,dice[i][j].y,dice[i][j].width,dice[i][j].height);
				}
				drawHealthBar(dice[i][j].x,dice[i][j].y,dice[i][j].hp,dice[i][j].maxHp,dice[i][j].ironHp);
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
			pips = getPips(type,pips,keywords,enemies[i]);
		//drawFace(enemies[i].dice[enemies[i].side],enemies[i].x,enemies[i].y);
		setEnemyTargetBorder(i);
		drawFace(face,enemies[i].x,enemies[i].y,-2,i);
		drawHealthBar(enemies[i].x,enemies[i].y,enemies[i].hp,enemies[i].maxHp,enemies[i].ironHp);

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
			if (targetId==enemies[selectedIndex].targets[i][0]&&targetIndex==enemies[selectedIndex].targets[i][1]) {
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
		if (selectedId==enemies[enemyIndex].targets[i][0]&&selectedIndex==enemies[enemyIndex].targets[i][1]) {
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
		inventoryCoords[i]=[400+(i%8)*SQUARE,300+Math.floor(i/8)*SQUARE];
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
	var tempType = face[0];
	if (typeCheck[0]=="summon") {
		tempType = "summon";
	}
	switch(tempType) {
		case "attack":
			g.beginFill(0xFF0000);
			g.drawRect(x+15,y+15,20,20);
			break;
		case "defend":
			g.beginFill(0x999999);
			g.drawRect(x+15,y+15,20,20);
			break;
		case "outer":
			g.beginFill(0x555555);
			g.drawRect(x+15,y+15,20,20);
			break;
		case "attack all":
			g.beginFill(0xFF0000);
			g.drawRect(x+10,y+10,30,30);
			break;
		case "stun":
			g.beginFill(0x000088);
			g.drawRect(x+15,y+15,20,20);
			break;
		case "reuse":
			g.beginFill(0x0000FF);
			g.drawRect(x+15,y+15,20,20);
			break;
		case "redirect":
			g.beginFill(0x000000);
			g.drawRect(x+15,y+15,20,20);
			break;
		case "summon":
			g.beginFill(0x0000FF);
			g.drawRect(x+15,y+15,20,20);
			break;
	}
	var originalPips = face[1];
	var pips = face[1];
	if (id==-2||id>=0) {
		pips = getPips(face[0],face[1],face[2],getDice(id,index));
	}
	drawPips(pips,x,y,originalPips);
}

function drawHealthBar(x,y,hp,maxHp,iron) {
	g.lineStyle(0,0x000000);
	g.beginFill(0xFF0000);
	g.drawRect(x+5,y+5,4*maxHp,4);
	g.beginFill(0x00FF00);
	g.drawRect(x+5,y+5,4*hp,4);
	g.beginFill(0x888888);
	for (var i in iron) {
		g.drawRect(x+5+4*(iron[i]-1),y+5,4,4);
	}
	g.lineStyle(2,0x000000);
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