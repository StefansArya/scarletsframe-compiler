var fs = require('fs');
var collectSourcePath = {};

let startupTime = Date.now();
module.exports = {
	collectSourcePath,
	getRelativePath(basePath, file){ // deprecate
		file = file.split(basePath);
		file.shift();
		return file.join(basePath);
	},
	swallowError(error){
		console.log(error);
		this.emit('end');
	},
	versioning(target, prefixStart, timestamp){
		var regex = prefixStart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

		var data = fs.readFileSync(target, 'utf8');
		fs.writeFileSync(target, data.replace(RegExp(regex + '[0-9a-z]+', 'g'), prefixStart+timestamp), 'utf8');
	},
	removeOldMap(path, filename, format){
		fs.readdir(path, function(err, files){
			if(files === void 0)
				return;

			for (var i = 0, len = files.length; i < len; i++) {
				if(files[i].indexOf(filename) === 0 && files[i].indexOf(format+'.map') !== -1){
					try{
						fs.unlinkSync(path+files[i]);
					} catch(e) {
						console.error(e);
					}
				}
			}
		});
	},
	excludeSource(old, news){ // deprecate
		if(old.constructor !== Array)
			old = [old];

		if(news.constructor === Array){
			for (var i = 0; i < news.length; i++) {
				if(news[i][0] !== '!')
					old.push('!'+news[i]);
			}
		}
		else old.push(news);

		return old;
	},
	sourceMapBase64(str){
		return '\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,' + Buffer.from(str).toString('base64');
	},
	preprocessPath,
	watchPath(which, watch, path){
		var default_ = path.default;
		delete path.default;

		for(var key in path){
			var temp = path[key];
			if(temp[which] === void 0)
				continue;

			preprocessPath(key, temp, which);
			watch(key, temp);
		}

		if(default_){
			path.default = default_;
			if(default_[which] === void 0)
				return;

			preprocessPath('default', default_, which);
			path.default = default_;
			watch('default', default_);
		}
	},
	indexAutoLoad(obj, which, placement){
		if(!obj.versioning)
			throw ".versioning property was not found";

		let file = obj[which].file;
		if(which === 'sf')
			file += '.'+placement.split('.').pop().toLowerCase();

		let temp = obj.autoGenerate.split('**');
		temp[0] += file;
		let data = fs.readFileSync(obj.versioning, 'utf8');

		if(data.includes(temp[0])) return;
		if(data.includes(`//#SF-${placement}-BEGIN`) === false)
			return;

		temp = temp[0]+'?'+startupTime+temp[1]+'\n';

		// Get line space
		let space = data.split(`//#SF-${placement}-BEGIN`)[0].split('\n');
		space = space[space.length-1];

		data = data.replace(`//#SF-${placement}-END`, `${temp}${space}//#SF-${placement}-END`);
		fs.writeFileSync(obj.versioning, data, 'utf8');
	}
};


// Check if some file type haven't been supported
function checkIncompatiblePath(name, obj){
	if(obj.css !== void 0)
		console.error("[Paths: "+name+"] Currently plain CSS haven't been supported, use SCSS instead");
	if(obj.sass !== void 0)
		obj.scss = obj.sass;
	if(obj.jsx !== void 0)
		console.error("[Paths: "+name+"] JSX haven't been supported, use HTML instead");
	if(obj.stylus !== void 0)
		console.error("[Paths: "+name+"] Sytlus haven't been supported yet, use SCSS instead..");
	if(obj.less !== void 0)
		console.error("[Paths: "+name+"] 'Less' compiler haven't been supported yet, use SCSS instead..");
}

function preprocessPath(key, temp, which){
	// Check if default was exist
	// if(temp && temp[which])
	// 	temp[which].combine = excludeSource(temp[which].combine, temp[which].combine);

	const ref = temp[which];
	checkIncompatiblePath(key, temp);

	ref.opt = {
		base: ref.root || (
				ref.watch?.[0]
				|| (ref.combine.constructor === String ? ref.combine : ref.combine[0])
			).split('/')[0]
	};

	const strip = (temp.stripURL || '$%');
	if(which !== 'sf')
		collectSourcePath[ref.file.replace(strip, '')] = {
			distPath:ref.file,
			base:ref.opt.base
		};
	else{
		collectSourcePath[ref.file.replace(strip, '')+'.js'] = {
			distPath:ref.file+((ref.wrapped === 'mjs' || ref.wrapped === 'async-mjs') ? '.mjs' : '.js'),
			base:ref.opt.base
		};
		collectSourcePath[ref.file.replace(strip, '')+'.css'] = {
			distPath:ref.file+'.css',
			base:ref.opt.base
		};
	}

	// Separate file name and folder path
	ref.file = splitFolderPath(ref.file);
	ref.folder = ref.file.pop();
	ref.file = ref.file[0];
}
function splitFolderPath(fullPath){
	fullPath = fullPath.replace(/\\/g, '/').split('/');
	var file = fullPath.pop();
	var folder = fullPath.join('/');

	if(folder.length !== 0)
		folder += '/';

	return [file, folder];
}