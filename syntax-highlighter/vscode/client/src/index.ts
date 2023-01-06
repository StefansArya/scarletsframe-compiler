import * as path from 'path';
import { commands, CompletionList, ExtensionContext, ProviderResult, Uri, workspace } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';
import { scarletsFrameVirtualRegion } from './tools';

let client: LanguageClient;
export function activate(context: ExtensionContext) {
	let serverModule = context.asAbsolutePath(path.join('server', 'out', 'index.js'));
	let serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: { module: serverModule, transport: TransportKind.ipc },
	};

	let virtualDocuments = new Map<string, string>();
	workspace.registerTextDocumentContentProvider('embedded-content', {
		provideTextDocumentContent: uri => {
			return virtualDocuments.get(decodeURIComponent(uri.path.slice(1)));
		}
	});

	let clientOptions: LanguageClientOptions = {
		outputChannelName: 'ScarletsFrame Language Server',
		documentSelector: [{ scheme: 'file', language: 'scarletsframe' }],
		middleware: {
			provideCompletionItem: async (document, position, context, token, next) => {
				let {
					docs, posSection, posExt
				} = scarletsFrameVirtualRegion(document.getText(), position);

				// let originalUri = encodeURIComponent(document.uri.toString(true));
				let originalUri = 'uri';

				for (let key in docs)
					virtualDocuments.set(originalUri + '.' + key, docs[key]);

				// return await next(document, position, context, token);

				let uriString = `embedded-content://${posExt}/${originalUri}.${posSection}`;
				return await commands.executeCommand<CompletionList>(
					'vscode.executeCompletionItemProvider',
					Uri.parse(uriString),
					position,
					context.triggerCharacter
				);
			}
		}
	};

	client = new LanguageClient('scarletsframeServer', 'ScarletsFrame Server', serverOptions, clientOptions);
	client.start(); // This will also launch the server
}

export function deactivate(): Promise<void> | undefined {
	if(!client) return undefined;
	return client.stop();
}
