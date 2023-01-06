"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode_html_languageservice_1 = require("vscode-html-languageservice");
const vscode_css_languageservice_1 = require("vscode-css-languageservice");
const node_1 = require("vscode-languageserver/node");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
const tools_1 = require("./tools");
const ts = require("typescript");
let connection = (0, node_1.createConnection)(node_1.ProposedFeatures.all);
let documents = new node_1.TextDocuments(vscode_languageserver_textdocument_1.TextDocument);
let htmlLanguageService = (0, vscode_html_languageservice_1.getLanguageService)();
let cssLanguageService = (0, vscode_css_languageservice_1.getCSSLanguageService)();
let lessLanguageService = (0, vscode_css_languageservice_1.getLESSLanguageService)();
let scssLanguageService = (0, vscode_css_languageservice_1.getSCSSLanguageService)();
function findTextXYPos(content, pos) {
    let temp = content.slice(0, pos).split('\n');
    return {
        line: temp.length - 1,
        character: temp[temp.length - 1].length
    };
}
function tsValidate(content) {
    ts.createSourceFile('src/index.ts', content, ts.ScriptTarget.ES2015, true);
    let diagnostics = ts.transpileModule(content, { reportDiagnostics: true, compilerOptions: {
            noEmit: true,
            // noImplicitAny: true,
            target: ts.ScriptTarget.ES5,
            module: ts.ModuleKind.CommonJS
        } }).diagnostics;
    return diagnostics.map(v => {
        return {
            message: '' + v.messageText,
            range: {
                start: findTextXYPos(content, v.start),
                end: findTextXYPos(content, v.start + v.length)
            },
            code: v.code,
            source: v.source,
        };
    });
}
connection.onInitialize((_params) => {
    // documents.onDidClose(e => {
    // 	// languageModes.onDocumentRemoved(e.document);
    // });
    // connection.onShutdown(() => {
    // 	// languageModes.dispose();
    // });
    return {
        capabilities: {
            textDocumentSync: node_1.TextDocumentSyncKind.Full,
            completionProvider: {
                // Tell the client that the server supports code completion
                resolveProvider: true,
            }
        }
    };
});
// documents.onDidClose(e => {
//   documentSettings.delete(e.document.uri);
// });
// Revalidate all open text documents
connection.onDidChangeConfiguration(_change => {
    documents.all().forEach(validateTextDocument);
});
// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
    validateTextDocument(change.document);
});
async function validateTextDocument(textDocument) {
    try {
        let version = textDocument.version;
        let diagnostics = [];
        let latestTextDocument = documents.get(textDocument.uri);
        if (!latestTextDocument || latestTextDocument.version !== version)
            return;
        let { docs, posSection, posExt } = (0, tools_1.scarletsFrameVirtualRegion)(textDocument.getText(), { line: 0 });
        for (let key in docs) {
            let languageId = '';
            let posExt = key.slice(key.lastIndexOf('.') + 1);
            if (posExt === 'js')
                languageId = 'javascript';
            else if (posExt === 'ts')
                languageId = 'typescript';
            else
                languageId = posExt;
            if (posExt === 'ts') {
                diagnostics.push(...tsValidate(docs[key]));
                continue;
            }
            let doc = vscode_languageserver_textdocument_1.TextDocument.create(latestTextDocument.uri, languageId, 1, docs[key]);
            if (posExt === 'css') {
                diagnostics.push(...cssLanguageService.doValidation(doc, cssLanguageService.parseStylesheet(doc)));
            }
            else if (posExt === 'scss' || posExt === 'sass') {
                diagnostics.push(...scssLanguageService.doValidation(doc, scssLanguageService.parseStylesheet(doc)));
            }
            else if (posExt === 'less') {
                diagnostics.push(...lessLanguageService.doValidation(doc, lessLanguageService.parseStylesheet(doc)));
            }
        }
        connection.sendDiagnostics({ uri: latestTextDocument.uri, diagnostics });
    }
    catch (e) {
        connection.console.error(`Error while validating ${textDocument.uri}`);
        connection.console.error(String(e));
    }
}
connection.onCompletionResolve((item) => {
    return item;
});
// connection.onHover((evt) => pluginHost.doHover(evt.textDocument, evt.position));
// connection.onDidSaveTextDocument(updateAllDiagnostics);
connection.onCompletion(async (textDocumentPosition, token) => {
    let uri = textDocumentPosition.textDocument.uri;
    let document = documents.get(uri);
    if (uri.endsWith('css')) {
        return cssLanguageService.doComplete(document, textDocumentPosition.position, cssLanguageService.parseStylesheet(document));
    }
    if (uri.endsWith('html')) {
        return htmlLanguageService.doComplete(document, textDocumentPosition.position, htmlLanguageService.parseHTMLDocument(document));
    }
});
documents.listen(connection);
connection.listen();
//# sourceMappingURL=index.js.map