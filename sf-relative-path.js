module.exports = function(full, list, root){
	full = full.split('\\').join('/');
	if(root != null){
		root = root.split('\\').join('/');
		if(root.slice(-1) !== '/')
			root += '/';

		full = full.split(root);
		full.shift();
		return full.join(root);
	}

	let fullMatch = false;

	if(list.constructor === String){
		list = list.split('\\').join('/');
		if(list === full)
			fullMatch = true;

		if(list.includes('*')){
			let path = list.split('*', 1)[0];
			if(full.includes(path)){
				let temp = full.split(path);
				temp.shift();
				return temp.join(path);
			}
		}
	}
	else for (var i = 0; i < list.length; i++) {
		let current = list[i];
		current = current.split('\\').join('/');

		if(current === full)
			fullMatch = true;

		if(!current.includes('*'))
			continue;

		let path = current.split('*', 1)[0];
		if(full.includes(path)){
			let temp = full.split(path);
			temp.shift();
			return temp.join(path);
		}
	}

	if(fullMatch)
		return full;

	console.error("Failed to get relative path for:", full);
	return 'undefined';
}