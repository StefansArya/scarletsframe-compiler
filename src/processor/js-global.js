/* Some information if you're trying to understand the function
	path = {
		fileName: "file.ext",
		directory: "./project/path/"
	}

	content = original partial content from ".sf" extension
	callback = Must have {
		content: GeneratedString,	-- From original content to the generated content
		map: Array,					-- Source mapping for the generated content
		lines: TotalGeneratedLines	-- Total lines from the generated content
	}

	offset = original location offset from ".sf" script file

	------
	Generated content must ready for being combined with another global script content

	callback must be called
 */

const {diveObject} = require('../helper.js');
const SFCompilerHelper = require('../helper.js');

module.exports = function(path, content, callback, offset, options, obj){
	const lines = content.split('\n').length;
	const result = {};

	var map = result.map = [];
	for (var i = 0; i < lines; i++) {
		map.push({
			originalLine: offset+i,
			originalColumn: 0,
			generatedLine: i,
			generatedColumn: 0,
			source: path.relativePath
		});
	}

	if(options.extra){
		if(options.extra === 'router') {
			let prefix = options.htmlPrefix || '';
			if(options.htmlPrefix) prefix += '/';

			if(!options.routes){
				callback({map:[], content:'', lines:0});
				return console.error(options.extra, "is used but 'routes/' folder was not found. Src file:", prefix + path.fileName);
			}

			if(path.fileName.indexOf('routes/') !== 0){
				callback({map:[], content:'', lines:0});
				return console.error(options.extra, "is not suported for .sf file that was not from inside of 'routes/' folder. Src file:", prefix + path.fileName);
			}

			let relative = path.fileName.slice(7); // routes/...
			if(relative.slice(0,1) !== '+'){
				callback({map:[], content:'', lines:0});
				return console.error("Routes should be begin with Views element selector (+routable-element). For example: /src/routes/+vw-pages/... Src file:", prefix + path.fileName, ", But got:", relative);
			}

			relative = relative.slice(relative.lastIndexOf('+'));
			result._routerJS = result;

			let ii = -3;
			if(relative.slice(-3) !== '.sf')
				ii = void 0;

			// Also remove .sf extension
			let _path = relative.slice(relative.indexOf('/'), ii).replace('/_', '/:');
			if(_path === '/index')
				_path = '/';

			result.router = {
				path:_path,
				filePath: path.fileName
			};

			let HTML = diveObject(options.routes, path.fileName.slice(7).split('/'));
			if(HTML && HTML._routerHTML){
				result._routerHTML = HTML._routerHTML;
				HTML = HTML._routerHTML.content;
			}
			else HTML = '""';

			if(HTML.slice(0, 1) !== '"'){
				callback({map:[], content:'', lines:0});
				return console.error("HTML must be escaped:\n", prefix + path.fileName, '=' , HTML);
			}

			diveObject(options.routes, path.fileName.slice(7).split('/'), result);
			content = content.replace('= {', '={')
				.replace('={', '{html: '+HTML+',');

			options.routes._$cache = void 0;
			if(content.slice(-1) !== '}'){
				callback({map:[], content:'', lines:0});
				return console.error(options.extra, "must end with '}'. Src file:", prefix + path.fileName);
			}
		}
		else return console.error(options.extra, "is not suported for JS options in", prefix + path.fileName);
	}

	if(content.includes('#this.path')){
		let prefix = options.htmlPrefix || '';
		if(options.htmlPrefix) prefix += '/';

		content = content.split('#this.path').join(`"${prefix + path.fileName}"`);
	}

	result.content = content;
	result.lines = lines;
	callback(result);
}