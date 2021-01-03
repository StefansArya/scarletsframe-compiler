# ScarletsFrame Compiler.js
A compiler for ScarletsFrame.

This compiler still depend on Gulp and BrowserSync, our future plan is make a fast standalone compiler without Gulp/BrowserSync.

If you arrived to this repository from no where, please visit the [default project template](https://github.com/StefansArya/scarletsframe-default) for getting started.

If you're using Sublime Text, always change your [text encoding into Unix](https://stackoverflow.com/a/58191795/6563200).

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