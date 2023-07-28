import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  spawnSync
} from "node:child_process";

import {
  createConnection,
  TextDocuments,
  Diagnostic,
  DiagnosticSeverity,
  ProposedFeatures,
  InitializeParams,
  TextDocumentSyncKind,
  InitializeResult,
  Position,
  uinteger,
  FileChangeType,
  DidChangeConfigurationNotification,
} from "vscode-languageserver/node";

import {
  URI
} from "vscode-uri";

import {
  DocumentUri,
  TextDocument
} from "vscode-languageserver-textdocument";

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasTextDocumentSyncCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

connection.onInitialize((params: InitializeParams) => {
  const capabilities = params.capabilities;

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

  // Only listen for text document changes if ksvalidator is available.
  // The --help flag should always result in a clean exit if the program is available.
  const ksvalidator = spawnSync("ksvalidator", ["--help"]);
  hasTextDocumentSyncCapability = ksvalidator.status === 0;

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.None,
    }
  };
  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: {
        supported: true
      }
    };
  }
  if (hasTextDocumentSyncCapability) {
    connection.console.info("Kickstart files will be validated using `ksvalidator`.");
    result.capabilities.textDocumentSync = TextDocumentSyncKind.Incremental;
  } else {
    connection.console.warn("Unable to find `ksvalidator`. Linting will be disabled.");
  }
  return result;
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    connection.client.register(DidChangeConfigurationNotification.type, undefined);
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders(_event => {
      connection.console.log("Workspace folder change event received.");
    });
  }
});

interface LintingSettings {
  lintOnSave: boolean;
}

interface ServerSettings {
  linting: LintingSettings;
}

// Initialize settings to their default values.
const defaultSettings: ServerSettings = {
  linting: {
    lintOnSave: true
  }
};
let globalSettings: ServerSettings = defaultSettings;
const documentSettings: Map<string, Thenable<ServerSettings>> = new Map();


connection.onDidChangeConfiguration(change => {
  if (hasConfigurationCapability) {
    documentSettings.clear(); // Reset all cached document settings.
  } else {
    globalSettings = <ServerSettings>((change.settings.kickstartLanugageSupport || defaultSettings));
  }

  // Revalidate all open text documents.
  documents.all().forEach(document => validateTextDocumentAt(document.uri));
});

function getDocumentSettings(resource: string): Thenable<ServerSettings> {
  if (!hasConfigurationCapability) {
    return Promise.resolve(globalSettings);
  }
  let result = documentSettings.get(resource);
  if (!result) {
    result = connection.workspace.getConfiguration({
      scopeUri: resource,
      section: "kickstartLanguageSupport"
    });
    documentSettings.set(resource, result);
  }
  return result;
}

// Clear file-specific settings when files are closed.
documents.onDidClose(e => {
  documentSettings.delete(e.document.uri);
});

function temporaryDir(): string {
  return fs.mkdtempSync(fs.realpathSync(os.tmpdir()) + path.sep);
}

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  const dir = temporaryDir();
  try {
    const file = path.join(dir, "ksvalidator-input.ks");
    fs.writeFileSync(file, textDocument.getText());
    validateTextDocumentAt(file);
    fs.unlinkSync(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function validateTextDocumentAt(textDocumentUri: DocumentUri): Promise<void> {
  const diagnostics: Diagnostic[] = [];

  const uri = URI.parse(textDocumentUri);
  if (uri.scheme !== "file") {
    return; // Only validate local files.
  }

  // Run ksvalidator and extract errors from stderr.
  connection.console.info(`Validating file using ksvalidator: ${uri.fsPath}`);
  const ksvalidator = spawnSync("ksvalidator", ["--", uri.fsPath]);
  const stderr = ksvalidator.status !== 0 ? ksvalidator.stderr.toString() : "";
  const lines = stderr.split("\n").filter((str) => str);

  const lineRegex = RegExp("on line (\\d+) of");
  for (let i = 0; i < lines.length - 1; i += 2) {
    const lineMatches = lines[i].match(lineRegex);

    if (!lineMatches) {
      continue;
    }

    const line = Number.parseInt(lineMatches[1]) - 1;
    const message = lines[i + 1].trim();
    const diagnostic: Diagnostic = {
      severity: DiagnosticSeverity.Warning,
      range: {
        start: Position.create(line, 0),
        end: Position.create(line, uinteger.MAX_VALUE)
      },
      message,
      source: "ksvalidator"
    };

    if (hasDiagnosticRelatedInformationCapability) {
      diagnostic.relatedInformation = [
        {
          location: {
            uri: textDocumentUri,
            range: Object.assign({}, diagnostic.range)
          },
          message: "ksvalidator considers this line invalid"
        }
      ];
    }

    diagnostics.push(diagnostic);
  }

  connection.sendDiagnostics({ uri: textDocumentUri, diagnostics });
}

// Validate watched files when they are changed.
// This typically means that the file has been saved.
connection.onDidChangeWatchedFiles(async change => {
  for (const event of change.changes) {
    if (event.type === FileChangeType.Deleted) {
      continue; // Deleted files cannot be validated.
    }

    const settings = await getDocumentSettings(event.uri);
    if (!settings.linting.lintOnSave) {
      connection.sendDiagnostics({ uri: event.uri, diagnostics: [] });
      return;
    }

    validateTextDocumentAt(event.uri);
  }
});

documents.listen(connection);
connection.listen();