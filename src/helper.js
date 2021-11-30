const regex = /(?:^|^ |^export )(?:(class|function)\s+(\w+)|(var|let|const)\s+([\w\[,\]{}_\s:]+?)\s?(?:[=;]|$))/gms;
// Group 1,3 (class/var), Group 2,4 (name)

// https://stackoverflow.com/a/17843773/6563200
let matchRegExp = /\/((?![*+?])(?:[^\r\n\[/\\]|\\.|\[(?:[^\r\n\]\\]|\\.)*\])+)\/((?:g(?:im?|mi?)?|i(?:gm?|mg?)?|m(?:gi?|ig?)?)?)/g;

const regexDeconstructor = /\w+(?::(.*?)(?:[\]},])|)/gms;
// Full (name), Group 1 (alias)

module.exports = {
	diveObject(obj, parts, setValue){
		for (let i = 0, n = parts.length-1; i <= n; i++) {
			const key = parts[i];

			if(setValue === void 0){ // get only
		    	if(!(key in obj))
		    		return;

		    	obj = obj[key];
			}
			else{ // set
				if(i === n){
					obj[key] = setValue;
					return;
				}

				if(!(key in obj))
	                obj = obj[key] = {};
	            else obj = obj[key];
			}
	    }

	    return obj;
	},
	diveDelete(obj, path){
		let hasChild = false;
		function diveDelete(obj, path, i){
			if(i+1 === path.length){
				delete obj[path[i]];
				return;
			}

			let dive = obj[path[i]];
			diveDelete(dive, path, i+1);

			if(hasChild) return;
			for(let key in dive){
				hasChild = true;
				return;
			}

			delete obj[path[i]];
		}

		diveDelete(obj, path, 0);
	},
	createTreeDiver(map, isSingle){
		let insideOfView = false, code = '';
		let thePath = '';

		function diveRoute(routes){
			let skip = {_$cache: true};
			for(let key in routes){
				if(skip[key]) continue;

				// If directory
				let route = routes[key];
				let content = route.content;
				if(content === void 0 || content.constuctor === Object){
					if(key.includes('+')){
						let [parent, view] = key.split('+');
						view = JSON.stringify(view); // view-selector

						if(parent !== ''){
							if(!isSingle){
								parent += '.sf';
								skip[parent] = true;

								// console.log(21, routes, parent);
								route = routes[parent];
								if(route._routerJS === void 0)
									code += `{path: ${JSON.stringify(route.router.path)}, html: ${route.content}`;
								else
									code += route.content.replace('{', '{path:'+JSON.stringify(route.router.path)+',').slice(0, -1);
							}
							else{
								route = routes[key];
								if(route._routerJS === void 0)
									code += `{path: `;
								else route.content.replace('{', `{path: `);

								if(parent === 'index')
									parent = '';

								code += JSON.stringify(thePath+'/'+parent.replace('_', ':'));
								thePath = '';
							}

							code += `,${view}:[`;
							diveRoute(routes[key]);
							code += ']},';
						}
						else{
							if(insideOfView)
								throw "Views '"+view+"'must be placed on the /routes root folder, or relative with other page routes (page+"+view+").";

							insideOfView = true;
							code += `sf.Views._$edit(${view}, [`;
							if(routes[key]['index.sf'] === void 0)
								code += '{path:"/", html:"\'index.sf\' was not found"},';

							diveRoute(routes[key]);
							code += ']);';
							insideOfView = false;
						}
					}
					else{
						if(isSingle)
							thePath += key === 'index' ? '/' : '/'+key;

						diveRoute(routes[key]);
					}
				}
				else {
					if(route._routerJS === void 0)
						code += `{path: ${JSON.stringify(route.router.path)}, html: ${route.content}},`;
					else
						code += content.replace('{', '{path:'+JSON.stringify(route.router.path)+',')+',';
				}
			}
		}

		// For source map
		function diveMapRoute(routes){
			let skip = {_$cache: true};
			for(let key in routes){
				if(skip[key]) continue;

				let route = routes[key];
				if(route._routerJS !== void 0){
					for (let a = 0; a < route.map.length; a++) {
						const t = route.map[a];
						map.addMapping({
							original: {line: t.originalLine, column: t.originalColumn},
							generated: {line: t.generatedLine+currentLines, column: t.generatedColumn},
							source: t.source,
						});
					}

					// console.log(t.generatedLine, currentLines);
					currentLines += route.lines;
				}

				// If directory
				let content = route.content;
				if(content === void 0 || content.constuctor === Object){
					if(key.includes('+')){
						let [parent] = key.split('+');

						if(parent !== ''){
							parent += '.sf';
							skip[parent] = true;
						}
						diveRoute(route);
					}
					else diveRoute(route);
				}
			}
		}

		function getCode(){
			return code.split(',]').join(']').split(',}').join('}');
		}

		return {route: diveRoute, mapRoute: diveMapRoute, getCode}
	},
	jsGetScopeVar(content, fullPath, wrapped, minify, save, isHot, path, readOnly){
		if(minify) return content; // We only use jsGetScopeVar on development mode only

		let cleanContent = content
			.replace(/\/\*.*?\*\//gs, '')
			.replace(/\/\/.*?$/gm, '')
			.replace(matchRegExp, '')
			// .replace(/([`'"])(?:\1|[\s\S]*?[^\\]\1)/g, '');

		var has = false, recreateRegExp = false;
		const reassign = new Set();
		const reclass = new Set(); // Redefine class prototype and static data
		cleanContent.replace(regex, function(full, clas_func, name1, var_let, name2){
			has = true;

			if(name2 !== void 0){
				let startWith = name2.slice(0, 1);
				if(startWith === '[' || startWith === '{'){
					name2.replace(regexDeconstructor, function(name, alias){
						if(alias !== void 0){
							alias = alias.trim();
							if(alias.length !== 0)
								name = alias;
						}

						reassign.add(name);
						save.types[name] = var_let;

						if(!save.keys.includes(name)){
							recreateRegExp = true;
							save.keys.push(name);
						}

						return name;
					});

					return full;
				}
			}

			if(clas_func !== void 0){
				let pos = arguments[arguments.length-2];
				if(pos > 10){
					let getBefore = cleanContent.slice(pos - 10, pos).trim();
					let last = getBefore.slice(-1);

					// Make sure it's at outer scope
					// after ;)}]
					if(/[~!@#$%^&(\-_+=[{,.:?/|\\]/.test(last))
						return full;
				}
			}

			let name = name1 || name2;
			let which = clas_func || var_let;

			if(which === 'class' && name in save.types)
				reclass.add(name);
			else{
				reassign.add(name);
				save.types[name] = which;

				if(!save.keys.includes(name)){
					recreateRegExp = true;
					save.keys.push(name);
				}
			}

			return full;
		});

		if(recreateRegExp)
			save.keysRegex = RegExp('\\b('+save.keys.sort((a,b)=> b.length - a.length).join('|')+')(?:\\s?(=)|\\b)', 'g');
			// Group 1 (name), Group 2 (re-assigned?)

		let missing = new Set();
		if(save.keys.length !== 0){
			cleanContent.replace(save.keysRegex, function(full, name, reassigned){
				if(reassign.has(name)) return full;
				missing.add(name);

				if(reassigned)
					reassign.add(name);

				return full;
			});
		}

		if(readOnly) return;
		if(has === false) return content;

		let createDeclaration = ''; // Borrow saved definition to first line
		let declareTemp = {const:'', let:''};
		for(let key of missing){
			let type = save.types[key];

			if(type === 'class' && (!isHot || reassign.has(key)))
				continue;

			if(type === 'const')
				declareTemp.const += key+',';
			else declareTemp.let += key+',';
		}

		if(declareTemp.const !== '')
			createDeclaration += `;const {${declareTemp.const.slice(0, -1)}}=p_sf1cmplr;`;
		if(declareTemp.let !== '')
			createDeclaration += `;let {${declareTemp.let.slice(0, -1)}}=p_sf1cmplr;`;


		let newClass = new Set();
		let createBackup = ''; // Variable defined
		for(let key of reassign){
			createBackup += `${key},`;

			if(!reclass.has(key) && save.types[key] === 'class')
				newClass.add(key);
		}

		if(createBackup.length !== 0)
			createBackup = `;Object.assign(p_sf1cmplr,{${createBackup.slice(0, -1)}});`;

		let createReClass = ''; // Redefine class
		if(isHot){
			for(let key of reclass){
				createReClass += `[${key}, $_${key}],`;
				content = content.split('class '+key+' ').join('class $_'+key+' ');
			}

			if(createReClass.length !== 0){
				createReClass = `;[${createReClass.slice(0, -1)}].forEach(([orig,news])=>{
	sf$hotReload.replaceClass(orig, news);
	orig.sf$refresh?.forEach(v=>v());
});`;
			}
		}

		if(path !== void 0){
			let configNewClass = '';
			for(let key of newClass)
				configNewClass += `${key},`;

			if(configNewClass.length !== 0){
				createReClass += `;{
	let sf$filePath = {configurable:true, value:"${path.base+'/'+path.fileName}"};
	[${configNewClass.slice(0, -1)}].forEach(v=> Object.defineProperty(v.prototype, "sf$filePath", sf$filePath));
};`;
			}
		}

		// return createDeclaration + createBackup + createReClass;

		content = `;globalThis._sf1cmplr ??= {};let p_sf1cmplr = _sf1cmplr["${fullPath}"] ??= {};` + createDeclaration + content + createBackup + createReClass;
		return content;
	}
};