const regex = /(?:^|^ )(class|function|var) (\w+)/gm;

module.exports = {
	jsGetScopeVar(content, path){
		const prop = {};
		var has = false;
		content.replace(regex, function(full, key, word){
			has = true;
			prop[word] = key === 'class';
			return full;
		});

		if(has === false) return content;

		// Note: late window assignment, to avoid possible memory leak
		var addition = ';';
		let propArr = [];
		for(let word in prop){
			propArr.push(word);

			if(!prop[word]) // not a Class
				addition += `window.${word}=${word};`;
			else {
				addition += `if(!window.${word})window.${word}=${word};else{
const glob = window.${word};
const globStatic = Object.getOwnPropertyDescriptors(glob);
const globProto = Object.getOwnPropertyDescriptors(glob.prototype);
const tempStatic = Object.getOwnPropertyDescriptors(${word});
const tempProto = Object.getOwnPropertyDescriptors(${word}.prototype);
for(const key in globProto)
	if(!tempProto[key]) delete glob.prototype[key];
for(const key in globStatic)
	if(!tempStatic[key]) delete glob[key];
for(const key in tempProto){
	if(!tempProto[key].writable || key === 'constructor') continue;
	Object.defineProperty(glob.prototype, key, tempProto[key]);
}
for(const key in tempStatic){
	if(!tempStatic[key].writable || key === 'constructor') continue;
	Object.defineProperty(glob, key, tempStatic[key]);
}
${word}=glob;
}`;
			}
		}

		propArr = JSON.stringify(propArr);

		// Don't use var inside this
		addition += `;{
if(!window._sf1cmplr) window._sf1cmplr={};
let temp = window._sf1cmplr["${path}"];
if(!temp) window._sf1cmplr["${path}"] = ${propArr};
else{
	const propArr = ${propArr};
	for (let i = 0; i < temp.length; i++) {
		if(!propArr.includes(temp[i]))
			delete window[temp[i]];
	}
	window._sf1cmplr["${path}"] = propArr
}};
`;

		return content+addition;
	}
};