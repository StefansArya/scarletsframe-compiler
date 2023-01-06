import { Position } from "vscode";

export function scarletsFrameVirtualRegion(documentText: string, position: Position): {
	docs: {[key: string]: string}
	posSection: string
	posExt: string
} {
	let emptySpaces: string | string[] = documentText.split('\n');
	let charLength = 0;
	let posLineLength = 0;

	for (let i = 0; i < emptySpaces.length; i++){
		emptySpaces[i] = ' '.repeat(emptySpaces[i].length);
		charLength += emptySpaces[i].length;

		if(position.line === i) posLineLength = charLength;
	}

	emptySpaces = emptySpaces.join('\n');

	// Split fences
	let _length = 0;
	let contents = documentText.split(/^## /gm);
	let sections = {};
	let posSection = '', posExt = '';
	for (let i = 0; i < contents.length; i++) {
		let temp = contents[i];
		let section = '';

		if(i !== 0){
			let newLineIndex = temp.indexOf('\n');
			section = temp.slice(0, newLineIndex-1);
			_length += 3; // "## " -> the fence

			if(_length <= posLineLength) posExt = section.match(/\w+/)[0];
			section = section + '.' + section.match(/\w+/)[0];
			temp = ' '.repeat(newLineIndex) + temp.slice(newLineIndex);

			if(_length <= posLineLength) posSection = section;
		}
		else {
			section = '.md';
			if(_length <= posLineLength) posExt = posSection = section;
		}

		sections[section] = emptySpaces.slice(0, _length) + temp + emptySpaces.slice(_length + temp.length);
		_length += temp.length;
	}

	return {docs: sections, posSection, posExt };
}