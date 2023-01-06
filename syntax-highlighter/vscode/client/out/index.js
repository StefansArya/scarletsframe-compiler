"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const path = require("path");
const vscode_1 = require("vscode");
const node_1 = require("vscode-languageclient/node");
const tools_1 = require("./tools");
let client;
function activate(context) {
    let serverModule = context.asAbsolutePath(path.join('server', 'out', 'index.js'));
    let serverOptions = {
        run: { module: serverModule, transport: node_1.TransportKind.ipc },
        debug: { module: serverModule, transport: node_1.TransportKind.ipc },
    };
    let virtualDocuments = new Map();
    vscode_1.workspace.registerTextDocumentContentProvider('embedded-content', {
        provideTextDocumentContent: uri => {
            return virtualDocuments.get(decodeURIComponent(uri.path.slice(1)));
        }
    });
    let clientOptions = {
        outputChannelName: 'ScarletsFrame Language Server',
        documentSelector: [{ scheme: 'file', language: 'scarletsframe' }],
        middleware: {
            provideCompletionItem: async (document, position, context, token, next) => {
                let { docs, posSection, posExt } = (0, tools_1.scarletsFrameVirtualRegion)(document.getText(), position);
                // let originalUri = encodeURIComponent(document.uri.toString(true));
                let originalUri = 'uri';
                for (let key in docs)
                    virtualDocuments.set(originalUri + '.' + key, docs[key]);
                // return await next(document, position, context, token);
                let uriString = `embedded-content://${posExt}/${originalUri}.${posSection}`;
                return await vscode_1.commands.executeCommand('vscode.executeCompletionItemProvider', vscode_1.Uri.parse(uriString), position, context.triggerCharacter);
            }
        }
    };
    client = new node_1.LanguageClient('scarletsframeServer', 'ScarletsFrame Server', serverOptions, clientOptions);
    client.start(); // This will also launch the server
}
exports.activate = activate;
function deactivate() {
    if (!client)
        return undefined;
    return client.stop();
}
exports.deactivate = deactivate;
//# sourceMappingURL=index.js.map