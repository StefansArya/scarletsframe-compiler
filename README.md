# ScarletsFrame Compiler.js
A compiler for ScarletsFrame.

This compiler depend on Gulp and BrowserSync.

If you arrived to this repository from no where, please visit the [default project template](https://github.com/StefansArya/scarletsframe-default) for getting started.

If you're using Sublime Text, always change your [text encoding into Unix](https://stackoverflow.com/a/58191795/6563200).

## Getting started experimenting with the compiler
> If you're new with the `.sf` file extension, please follow the instruction [on here](https://github.com/StefansArya/scarletsframe-compiler/tree/master/syntax-highlighter).

After you cloned this project you will need to install the required dependency.

```sh
$ npm i
```

The original `.sf` compiler is inside the `/src` folder.<br>
`sfcompiler.js` is a script that constructing some Gulp tasks for your project to help compiling `.js, .scss, .html` file.

For testing the generation of `.css, .js` from compiling `.sf` file you can use this command.
```sh
$ npm test
```

The `.css, .js` file will be generated into `./tests/generated.css` and `./tests/generated.js`.

### Macro
> For `## html`.

To append the content of `## html` into the document body you can add `.append-to-body` attribute to the fence.

```xml
## html.append-to-body
<div>
	Hello <span>world</span>
</div>
```

---

> For `## js-*`.

To get current file path relative to your source folder you can use `#this.path` on the JavaScript code.

```js
## js-global
sf.component('my-elem', {template: #this.path}, function(){
	console.log("Hello from", #this.path);
});
```

Feel free to fill an issue or pull request if you have a question or improvement.
