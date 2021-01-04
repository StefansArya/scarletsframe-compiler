const {SourceMapConsumer} = require('source-map');
const fs = require('fs');

const {spawn} = require('child_process');

var collectSourcePath;
var editor = void 0;
module.exports = function(sockets, that, editor_){
	collectSourcePath = that;
	editor = editor_;

	sockets.on('connection', function(socket){
		socket.on('sf-open-source', openSource);
	});
}

function openEditor(data, source, propName){
	var fullPath = `${process.cwd()}/${source.base}/${data.source}`;
	var lines = `:${data.line}:${data.column}`;

	if(propName !== void 0){
		var temp = fs.readFileSync(fullPath, 'utf8');
		var line = data.line;
		var index = 0;
		while(line-- > 0)
			index = temp.indexOf('\n', index);

		if(index === -1) return console.error("Failed to retrieve the index");
		var endIndex = temp.search(RegExp(`\\.${propName}(?:\\s+|)=|${propName}(?:\\s+|)\\((?:|[^)]+)\\)(?:\\s+|){`), index);

		line = temp.slice(index, endIndex).split('\n').length;
		lines = `:${line || 1}:1`;
	}

	if(editor === 'sublime')
		spawn('subl', [fullPath+lines], {shell: true});
	else if(editor === 'vsc')
		spawn('code', ['-g', fullPath+lines], {shell: true});
	else if(!editor)
		console.error("No default editor was selected");
	else console.error(editor, "is not a supported editor");
}

function openSource(data){
	var [temp, propName] = data;

	temp = temp.split('?');
	if(temp.length !== 1){
		let ref = temp[1];
		ref = ref.split(':');
		ref.shift();
		temp[0] += ':'+ref.join(':');
	}

	temp = temp[0];
	if(temp.slice(0, 1) === '>'){
		openEditor({source:temp.slice(1), line:1, column:1}, {base:''});
		return;
	}

	temp = temp.split('/');
	temp.shift();

	let [path, line, column] = temp.join('/').split(':');
	var target = {line:+line, column:+column};

	var source = collectSourcePath[path];
	if(!source) return console.error(`The path was not recognized '${path}'`);

	readSourceMap(source.distPath+'.map', target, function(data){
		openEditor(data, source, propName);
	});
}

function readSourceMap(path, target, callback){
	try{var data = fs.readFileSync(path)} catch(e) {
		return console.error("Souremap not found for: "+path);
	}

	SourceMapConsumer.with(JSON.parse(data), null, function(consumer){
		callback(consumer.originalPositionFor(target));
	});
}