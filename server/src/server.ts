import {
  createConnection,
  TextDocuments,
  Diagnostic,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  TextDocumentSyncKind,
  InitializeResult,
  CodeActionParams,
  CodeAction,
  CodeActionKind,
  DiagnosticSeverity
} from 'vscode-languageserver';

import {
  TextDocument,
} from 'vscode-languageserver-textdocument';

import {
  generateDiagnostics,
  MESSAGE_POSSIBLE_SUBROUTINE
} from './diagnostic';

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
let connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager. 
let documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability: boolean = false;
let hasWorkspaceFolderCapability: boolean = false;
export let hasDiagnosticRelatedInformationCapability: boolean = false;

connection.onInitialize((params: InitializeParams) => {
  let capabilities = params.capabilities;

  // Does the client support the `workspace/configuration` request?
  // If not, we fall back using global settings.
  hasConfigurationCapability = !!(
    capabilities.workspace && !!capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );
  hasDiagnosticRelatedInformationCapability = !!(
    capabilities.textDocument &&
    capabilities.textDocument.publishDiagnostics &&
    capabilities.textDocument.publishDiagnostics.relatedInformation
  );

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      // Tell the client that this server supports code completion.
      completionProvider: {
        resolveProvider: true
      },
      codeActionProvider: true
    }
  };
  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: {
        supported: true
      }
    };
  }
  return result;
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    // Register for all configuration changes.
    connection.client.register(DidChangeConfigurationNotification.type, undefined);
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders(_event => {
      connection.console.log('Workspace folder change event received.');
    });
  }
});

export interface ExtensionSettings {
  enableMultipleLabels: boolean;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ExtensionSettings = { enableMultipleLabels: true };
let globalSettings: ExtensionSettings = defaultSettings;

// Cache the settings of all open documents
let documentSettings: Map<string, Thenable<ExtensionSettings>> = new Map();

connection.onDidChangeConfiguration(change => {
  if (hasConfigurationCapability) {
    // Reset all cached document settings
    documentSettings.clear();
  } else {
    globalSettings = <ExtensionSettings>(
      (change.settings.lc3LanguageServer || defaultSettings)
    );
  }

  // Revalidate all open text documents
  documents.all().forEach(validateTextDocument);
});

export function getDocumentSettings(resource: string): Thenable<ExtensionSettings> {
  if (!hasConfigurationCapability) {
    return Promise.resolve(globalSettings);
  }
  let result = documentSettings.get(resource);
  if (!result) {
    result = connection.workspace.getConfiguration({
      scopeUri: resource,
      section: 'lc3LanguageServer'
    });
    documentSettings.set(resource, result);
  }
  return result;
}

// Only keep settings for open documents
documents.onDidClose(e => {
  documentSettings.delete(e.document.uri);
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
  validateTextDocument(change.document);
});

export async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  // Get the settings of the document
  const settings = await getDocumentSettings(textDocument.uri);

  // Generate diagnostics
  let diagnostics: Diagnostic[];
  diagnostics = generateDiagnostics(textDocument, settings);

  // Send the computed diagnostics to VSCode.
  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onCodeAction(provideCodeActions);

export function provideCodeActions(parms: CodeActionParams): CodeAction[] {
  // Check if document was correctly returned
  const document = documents.get(parms.textDocument.uri);
  if (!document) {
    return [];
  }
  
  // Check if diagnostics is non-empty
  const diagnostics = parms.context.diagnostics;
  if (!(diagnostics) || diagnostics.length == 0) {
    return [];
  }
  
  // Find the diagnostics with unused label
  const codeActions: CodeAction[] = [];
  diagnostics.forEach((diag) => {
    if (diag.severity === DiagnosticSeverity.Warning && diag.message.includes(MESSAGE_POSSIBLE_SUBROUTINE)) {
      codeActions.push({
        title: "Insert a mark to indicate this is a subroutine",
        kind: CodeActionKind.QuickFix,
        diagnostics: [diag],
        edit: {
          changes: {
            [parms.textDocument.uri]: [{
              range: {start: diag.range.start, end: diag.range.start},
              newText: "; @SUBROUTINE\n"
            }]
          }
        }
      });
      return;
    }
  });
  return codeActions;
}

// This handler provides the initial list of the completion items.
connection.onCompletion(
  (_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
    // The pass parameter contains the position of the text document in
    // which code complete got requested. For the example we ignore this
    // info and always provide the same completion items.
    return [
      {
        label: 'ADD',
        kind: CompletionItemKind.Text,
        data: 1
      },
      {
        label: 'AND',
        kind: CompletionItemKind.Text,
        data: 2
      },
      {
        label: 'BR',
        kind: CompletionItemKind.Text,
        data: 3
      },
      {
        label: 'JMP',
        kind: CompletionItemKind.Text,
        data: 4
      },
      {
        label: 'JSR',
        kind: CompletionItemKind.Text,
        data: 5
      },
      {
        label: 'LD',
        kind: CompletionItemKind.Text,
        data: 6
      },
      {
        label: 'LDI',
        kind: CompletionItemKind.Text,
        data: 7
      },
      {
        label: 'LDR',
        kind: CompletionItemKind.Text,
        data: 8
      },
      {
        label: 'LEA',
        kind: CompletionItemKind.Text,
        data: 9
      },
      {
        label: 'NOT',
        kind: CompletionItemKind.Text,
        data: 10
      },
      {
        label: 'RET',
        kind: CompletionItemKind.Text,
        data: 11
      },
      {
        label: 'ST',
        kind: CompletionItemKind.Text,
        data: 12
      },
      {
        label: 'STI',
        kind: CompletionItemKind.Text,
        data: 13
      },
      {
        label: 'STR',
        kind: CompletionItemKind.Text,
        data: 14
      },
      {
        label: 'TRAP',
        kind: CompletionItemKind.Text,
        data: 15
      },
      {
        label: 'ORIG',
        kind: CompletionItemKind.Text,
        data: 16
      },
      {
        label: 'FILL',
        kind: CompletionItemKind.Text,
        data: 17
      },
      {
        label: 'BLKW',
        kind: CompletionItemKind.Text,
        data: 18
      },
      {
        label: 'STRINGZ',
        kind: CompletionItemKind.Text,
        data: 19
      }
    ];
  }
);

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
  (item: CompletionItem): CompletionItem => {
    if (item.data === 1) {
      item.detail = 'Addition';
      item.documentation = 'Usage:\nADD DR, SR1, SR2\nADD DR, SR1, imm5';
    } else if (item.data === 2) {
      item.detail = 'Bit-wise logical AND';
      item.documentation = 'Usage:\nAND DR, SR1, SR2\nAND DR, SR1, imm5';
    } else if (item.data === 3) {
      item.detail = 'Conditional branch';
      item.documentation = 'Usage:\nBR(nzp) LABEL';
    } else if (item.data === 4) {
      item.detail = 'Jump';
      item.documentation = 'Usage:\nJMP BaseR';
    } else if (item.data === 5) {
      item.detail = 'Jump to Subroutine';
      item.documentation = 'Usage:\nJSR LABEL';
    } else if (item.data === 6) {
      item.detail = 'Load';
      item.documentation = 'Usage:\nLD DR, LABEL';
    } else if (item.data === 7) {
      item.detail = 'Load indirect';
      item.documentation = 'Usage:\nLDI DR, LABEL';
    } else if (item.data === 8) {
      item.detail = 'Load base+offset';
      item.documentation = 'Usage:\nLDR DR, BaseR, offset6';
    } else if (item.data === 9) {
      item.detail = 'Load effective address';
      item.documentation = 'Usage:\nLEA LABEL';
    } else if (item.data === 10) {
      item.detail = 'Bit-wise complement';
      item.documentation = 'Usage:\nNOT DR, SR';
    } else if (item.data === 11) {
      item.detail = 'Return from subroutine';
      item.documentation = 'Usage:\nRET';
    } else if (item.data === 12) {
      item.detail = 'Store';
      item.documentation = 'Usage:\nST SR, LABEL';
    } else if (item.data === 13) {
      item.detail = 'Store indirect';
      item.documentation = 'Usage:\nSTI SR, LABEL';
    } else if (item.data === 14) {
      item.detail = 'Store base+offset';
      item.documentation = 'Usage:\nSTR BaseR offset6';
    } else if (item.data === 15) {
      item.detail = 'System call';
      item.documentation = 'Usage:\nTRAP trapvector8';
    } else if (item.data === 16) {
      item.detail = 'Starting point of program';
      item.documentation = 'Example:\n.ORIG 0x3000';
    } else if (item.data === 17) {
      item.detail = 'Fill with data';
      item.documentation = 'Example:\n.FILL 0x0';
    } else if (item.data === 18) {
      item.detail = 'Block of word';
      item.documentation = 'Example:\n.BLKW 10';
    } else if (item.data === 19) {
      item.detail = 'String';
      item.documentation = 'Example:\n.STRINGZ \'string example\'';
    }
    return item;
  }
);

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
