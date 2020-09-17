import {
  createConnection,
  TextDocuments,
  Diagnostic,
  DiagnosticSeverity,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  TextDocumentSyncKind,
  InitializeResult
} from 'vscode-languageserver';

import {
  TextDocument,
} from 'vscode-languageserver-textdocument';

import {
  Code,
  is_lc3_number,
  Instruction
} from './code';

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
let connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager. 
let documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability: boolean = false;
let hasWorkspaceFolderCapability: boolean = false;
let hasDiagnosticRelatedInformationCapability: boolean = false;

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
      }
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

interface ExtensionSettings {
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

function getDocumentSettings(resource: string): Thenable<ExtensionSettings> {
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

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  let settings = await getDocumentSettings(textDocument.uri);
  let diagnostics: Diagnostic[] = [];

  // Parse the code
  let code = new Code(textDocument.getText());
  // Single line of code checkings (not block of codes)
  for (let idx = 0; idx < code.instructions.length; idx++) {
    let i;
    let instruction = code.instructions[idx];

    // Check for code before/after .ORIG/.END
    if (instruction.mem_addr == 0) {
      generateDiagnostics(textDocument, diagnostics, DiagnosticSeverity.Error, "Code before .ORIG directive.", instruction.line,
        "Code before .ORIG is not allowed.");
    } else if (instruction.mem_addr > code.end_addr) {
      generateDiagnostics(textDocument, diagnostics, DiagnosticSeverity.Warning, "Code after .END directive.", instruction.line,
        "Code after .END will be ignored.");
    }

    // Check for incomplete instructions
    if (instruction.incomplete) {
      generateDiagnostics(textDocument, diagnostics, DiagnosticSeverity.Error, "Illegal or incomplete instruction.", instruction.line, "");
    }

    // Checking each line of code based on operation type
    switch (instruction.optype) {
      case "ADD":
        if (instruction.imm_val >= 32 || (instruction.imm_val >= 16 && instruction.imm_val_type == '#')) {
          generateDiagnostics(textDocument, diagnostics, DiagnosticSeverity.Warning, "Immediate value is out of range.", instruction.line, "");
        }
        break;
      case "AND":
        if (instruction.imm_val >= 32) {
          generateDiagnostics(textDocument, diagnostics, DiagnosticSeverity.Warning, "Immediate value is out of range.", instruction.line, "");
        }
        break;
      case "BR":
        if (0 == checkPCoffset(textDocument, diagnostics, instruction, code, 9)) {
          checkJumpToData(textDocument, diagnostics, instruction, code);
        }
        break;
      case "JSR":
        if (0 == checkPCoffset(textDocument, diagnostics, instruction, code, 11)) {
          checkJumpToData(textDocument, diagnostics, instruction, code);
        }
        break;
      case "LEA":
        checkPCoffset(textDocument, diagnostics, instruction, code, 9);
        break;
      case "LD":
      case "ST":
      case "LDI":
      case "STI":
        checkPCoffset(textDocument, diagnostics, instruction, code, 9);
        break;
      case "LDR":
      case "STR":
        if (instruction.imm_val >= 64) {
          generateDiagnostics(textDocument, diagnostics, DiagnosticSeverity.Warning, "Immediate value is out of range.", instruction.line, "");
        }
        break;
      case "LABEL":
        // if (instruction.mem.length <= 2) {
        // 	generateDiagnostics(textDocument, DiagnosticSeverity.Warning, "Label name is too short", instruction.line, 
        // 	"It is good practice to assign meaningful names to labels.");
        // }
        if (is_lc3_number(instruction.mem)) {
          generateDiagnostics(textDocument, diagnostics, DiagnosticSeverity.Warning, "Label name is a number.", instruction.line,
            "This label name will be recognized as a number by the assembler, it will not be usable in any other instructions.");
        }
        if (settings.enableMultipleLabels && code.instructions[idx + 1].optype == "LABEL") {
          generateDiagnostics(textDocument, diagnostics, DiagnosticSeverity.Warning, "Multiple label at the same memory location.", instruction.line, "");
        }
        for (i = 0; i < instruction.mem.length; i++) {
          if (instruction.mem[i] == ';') {
            generateDiagnostics(textDocument, diagnostics, DiagnosticSeverity.Warning, "Label name contains semicolon.", instruction.line,
              "Semicolon(;) is not recognized as part of the label name. If you use the label name with trailing semicolon in other instructions, \
						then the assembler will not be able to find it.");
          }
        }
        break;
      case ".BLKW":
        if (instruction.imm_val_type != '#' && instruction.imm_val_type != '0' && instruction.imm_val_type != 'x') {
          generateDiagnostics(textDocument, diagnostics, DiagnosticSeverity.Warning, "Decimal number without #", instruction.line,
            ".BLKW directives view the number as decimal by default. If you meant to write a binary number, add a leading 0; if you \
						meant to write a decimal number, add a leading #");
        }
        checkRunningIntoData(textDocument, diagnostics, instruction, code, idx);
        break;
      case ".FILL":
      case ".STRINGZ":
        checkRunningIntoData(textDocument, diagnostics, instruction, code, idx);
        break;
      default:
        break;
    }
  }

  // Send the computed diagnostics to VSCode.
  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

function checkPCoffset(textDocument: TextDocument, diagnostics: Diagnostic[], instruction: Instruction, code: Code, offsetnumber: number) {
  let i;
  let max = 1 << offsetnumber;
  // Label name is number
  if (is_lc3_number(instruction.mem)) {
    generateDiagnostics(textDocument, diagnostics, DiagnosticSeverity.Warning, "Hardcoded PCoffset.", instruction.line,
      "Hardcoding the relative offset is error-prone and not recommended. Try to add labels and use label names instead.");
    return -2;
  } else {
    // Check if offset is within range
    for (i = 0; i < code.instructions.length; i++) {
      if (code.instructions[i].optype == "LABEL" && code.instructions[i].mem == instruction.mem) {
        if (instruction.mem_addr - code.instructions[i].mem_addr - 1 < -max || instruction.mem_addr - code.instructions[i].mem_addr > max - 1) {
          generateDiagnostics(textDocument, diagnostics, DiagnosticSeverity.Error, "PCoffset is too large.", instruction.line,
            "The PCoffset of this instruction(" + (code.instructions[i].mem_addr - instruction.mem_addr - 1) + ") is outside of the range of PCoffset" + offsetnumber + " [-" + max + ", " + (max - 1) + "].");
        }
        break;
      }
    }
    // Label not found
    if (i == code.instructions.length) {
      generateDiagnostics(textDocument, diagnostics, DiagnosticSeverity.Error, "Label not defined.", instruction.line,
        "The label " + instruction.mem + " is not defined.");
      return -1;
    }
  }
  return 0;
}

function checkJumpToData(textDocument: TextDocument, diagnostics: Diagnostic[], instruction: Instruction, code: Code) {
  for (let i = 0; i < code.instructions.length; i++) {
    if (code.instructions[i].optype == "LABEL" && code.instructions[i].mem == instruction.mem) {
      for (; code.instructions[i].optype == "LABEL"; i++);
      let next_op = code.instructions[i];
      if (next_op.optype == ".FILL" || next_op.optype == ".BLKW" || next_op.optype == ".STRINGZ") {
        generateDiagnostics(textDocument, diagnostics, DiagnosticSeverity.Warning, "Jumping/Branching to data.", instruction.line,
          "The destination of this instruction is line " + next_op.line + ", which is data.");
      }
      break;
    }
  }
}

function checkRunningIntoData(textDocument: TextDocument, diagnostics: Diagnostic[], instruction: Instruction, code: Code, idx: number) {
  do {
    idx--;
  } while (code.instructions[idx].optype == "LABEL" || code.instructions[idx].optype == ".FILL" ||
  code.instructions[idx].optype == ".BLKW" || code.instructions[idx].optype == ".STRINGZ");
  if (code.instructions[idx].optype != "BR" && code.instructions[idx].optype != "JSR" &&
    code.instructions[idx].optype != "JSRR" && code.instructions[idx].optype != "JMP" &&
    code.instructions[idx].optype != "RET" && code.instructions[idx].optype != "HALT" &&
    code.instructions[idx].optype != "TRAP") {
    generateDiagnostics(textDocument, diagnostics, DiagnosticSeverity.Warning, "Running into data.", instruction.line,
      "The program runs into data without necessary Branching/Jumping instructions.");
  }
}

function generateDiagnostics(textDocument: TextDocument, diagnostics: Diagnostic[], severity: DiagnosticSeverity, message: string, line: number, relatedInfo: string) {
  let diagnostic: Diagnostic = {
    severity: severity,
    range: {
      start: { line: line, character: 0 },
      end: { line: line + 1, character: 0 }
    },
    message: message,
    source: "lc3"
  };
  if (relatedInfo && hasDiagnosticRelatedInformationCapability) {
    diagnostic.relatedInformation = [
      {
        location: {
          uri: textDocument.uri,
          range: Object.assign({}, diagnostic.range)
        },
        message: relatedInfo
      }
    ];
  }
  diagnostics.push(diagnostic);
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
