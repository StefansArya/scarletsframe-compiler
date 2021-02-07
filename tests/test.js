console.log("Node.js is running");

var fs = require('fs');
const {SourceMapConsumer} = require('source-map');

console.log("Loading SFCompiler");
var time = Date.now();
const SFCompiler = require('../src/main.js');
const instance = new SFCompiler();
console.log("Instance created in:", Date.now()-time+'ms');

function whenFinish(changes){
	if(changes === false) return console.log("Nothing was changed");

	var extracting = 0;
	function extraction(data){
		const {sourceRoot,distName,which,code,map} = data;

		fs.writeFileSync(`${sourceRoot}${distName}.${which}`, code);
		fs.writeFileSync(`${sourceRoot}${distName}.${which}.map`, map);

		setTimeout(()=> {
			if(--extracting === 0) TEST();
		}, 200);
	}

	for(const key in changes){
		extracting++;
		instance.extractAll(key, './', 'generated', extraction, {
			// autoprefixer: true,
			// minify: true
		});
	}

	console.log("Compiling time:", Date.now()-time+'ms');
}

function begin(){
	instance.loadSource('./', 'PagePagination.sf', whenFinish);
	instance.loadSource('./', 'SmallNotif.sf', whenFinish);
	instance.loadSource('./', 'HSlider.sf', whenFinish);

	setTimeout(()=> {
		fs.writeFileSync('./PlayerPic.sf', fs.readFileSync('./dummy-playerpic.sf'));
		instance.loadSource('./', 'PlayerPic.sf', function(){});

		console.log('---------------------------------------------------');

		setTimeout(()=> {
			fs.writeFileSync('./PlayerPic.sf', fs.readFileSync('./real-playerpic.sf'));
			instance.loadSource('./', 'PlayerPic.sf', whenFinish);
		}, 1000);
	}, 1000);
}

var time = Date.now();

// Warming up the compiler before the benchmark
instance.loadSource('./', 'PlayerPic.sf', function(){
	console.log("Warming up time:", Date.now() - time+'ms');
	time = Date.now();
	begin();
});

// Warming up the compiler before the benchmark
// instance.loadSource('./', 'no-css.sf', function(changes){
// 	console.log("Warming up time:", Date.now() - time+'ms');
// 	time = Date.now();
// 	whenFinish(changes);
// });

// TEST();
function TEST(){
	function aa(loc, target, callback){
		const obj = JSON.parse(fs.readFileSync(loc));
		SourceMapConsumer.with(obj, null, function(consumer){
			callback(consumer.originalPositionFor(target));
		});
	}

	var findJS1 = {column:0, line:51, eC:0, eL:42, eS:"PG.sf"}; // NOOP
	aa('./generated.js.map', findJS1, function(data){
		console.log("--Find:", findJS1);
		console.log("Found:", data);
	});

	var findCSS1 = {column:10, line:15, eC:8, eL:99, eS:"PG.sf"}; // Verdana
	aa('./generated.css.map', findCSS1, function(data){
		console.log("Find:", findCSS1);
		console.log("Found:", data);
	});

	var findJS2 = {column:0, line:100, eC:0, eL:39, eS:"SN.sf"}; // remove(el, .)
	aa('./generated.js.map', findJS2, function(data){
		console.log("--Find:", findJS2);
		console.log("Found:", data);
	});

	var findCSS2 = {column:12, line:106, eC:4, eL:121, eS:"SN.sf"}; // (252, 248, 227, 0.97)
	aa('./generated.css.map', findCSS2, function(data){
		console.log("Find:", findCSS2);
		console.log("Found:", data);
	});

	var findJS3 = {column:2, line:7, eC:2, eL:11, eS:"PL.sf"}; // m2v$src
	aa('./generated.js.map', findJS3, function(data){
		console.log("--Find:", findJS3);
		console.log("Found:", data);
	});

	var findCSS3 = {column:5, line:2, eC:1, eL:49, eS:"PL.sf"}; // display: block; }
	aa('./generated.css.map', findCSS3, function(data){
		console.log("Find:", findCSS3);
		console.log("Found:", data);
	});

	var findJS4 = {column:2, line:167, eC:2, eL:134, eS:"HS.sf"}; // $(document).off('
	aa('./generated.js.map', findJS4, function(data){
		console.log("--Find:", findJS4);
		console.log("Found:", data);
	});

	var findCSS4 = {column:12, line:151, eC:1, eL:57, eS:"HS.sf"}; // 0e0e0e
	aa('./generated.css.map', findCSS4, function(data){
		console.log("Find:", findCSS4);
		console.log("Found:", data);
	});
}