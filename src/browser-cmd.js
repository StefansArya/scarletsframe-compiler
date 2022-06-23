const {SourceMapConsumer} = require('source-map');
const fs = require('fs');
var chalk = require('chalk');

const {spawn} = require('child_process');

var collectSourcePath;
var editor = void 0;
module.exports = function(sockets, that, editor_){
	collectSourcePath = that;
	editor = editor_.toLowerCase();

	sockets.on('connection', function(socket){
		socket.on('sf-open-source', openSource);
	});
}

function openEditor(data, source, propName, rawText){
	var fullPath = `${process.cwd()}/${(source.base && !data.source.startsWith(source.base+'/') ? (source.base+'/') : '') + data.source}`;
	var lines = `:${data.line}:${data.column}`;

	if(!fs.existsSync(fullPath))
		return console.error(`[${chalk.red('Error')}] path not found: ${fullPath}`);

	var temp, line, index, endIndex = -1;
	if(propName !== void 0 || rawText !== void 0){
		temp = fs.readFileSync(fullPath, 'utf8');
		line = data.line;
		index = 0;
		while(line-- > 0)
			index = temp.indexOf('\n', index);

		if(index === -1) return console.error("Failed to retrieve the index");

		if(propName !== void 0){
			var propName_ = propName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			endIndex = temp.search(RegExp(`[. \\t](?:${propName_}(?:\\s+|)=|${propName_}(?:\\s+|)\\((?:|[^)]+)\\)(?:\\s+|){)`, 's'), index);
		}

		if(endIndex === -1 && rawText !== void 0)
			endIndex = temp.indexOf(rawText, index);

		lines = `:${temp.slice(index, endIndex).split('\n').length || 1}:1`;
	}

	if(editor === 'sublime'){
		spawn('subl', [fullPath+lines], {shell: true}).once('exit', function(code){
			if(code !== 0) console.error(`[${chalk.red('Error')}] You have selected 'sublime' as your default editor, please make sure 'subl' is available in the. Please follow the instruction to register it https://www.sublimetext.com/docs/command_line.html`);
		});
	}
	else if(editor === 'vsc'){
		spawn('code', ['-g', fullPath+lines], {shell: true}).once('exit', function(code){
			if(code !== 0) console.error(`[${chalk.red('Error')}] You have selected 'vsc' as your default editor, please make sure 'code' is available in the PATH environment. Please follow the instruction to register it https://code.visualstudio.com/docs/editor/command-line#_code-is-not-recognized-as-an-internal-or-external-command`);
		});
	}
	else if(!editor)
		console.error("No default editor was selected");
	else console.error(editor, "is not a supported editor");
}

function openSource(data){
	var [temp, propName, rawText] = data;
	if(propName === null) propName = void 0;
	if(rawText === null) rawText = void 0;

	temp = temp.split('?');
	if(temp.length !== 1){
		let ref = temp[1];
		ref = ref.split(':');
		ref.shift();
		temp[0] += ':'+ref.join(':');
	}

	temp = temp[0];
	if(temp.slice(0, 1) === '>'){
		openEditor({source:temp.slice(1), line:1, column:1}, {base:''}, propName, rawText);
		return;
	}

	temp = temp.split('/');
	temp.shift();

	let [path, line, column] = temp.join('/').split(':');
	var target = {line:+line, column:+column};

	var source = collectSourcePath[path];
	if(!source) source = collectSourcePath[process.cwd()+'/'+path];
	if(!source) source = collectSourcePath[process.cwd()+'/'+path.replace(/\.mjs$/m, '.js')];
	if(!source) return console.error(`The path was not recognized '${path}'`);

	readSourceMap(source.distPath+'.map', target, function(data){
		openEditor(data, source, propName, rawText);
	});
}

function readSourceMap(path, target, callback){
	try{var data = fs.readFileSync(path)} catch(e) {
		return console.error("Souremap not found for: "+path);
	}

	SourceMapConsumer.with(JSON.parse(data), null, function(consumer){
		let temp = consumer.originalPositionFor(target);
		if(temp.source == null)
			return console.error("Unable to find source file");
	
		callback(temp);
	});
}