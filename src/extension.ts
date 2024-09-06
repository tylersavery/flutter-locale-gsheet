import * as vscode from "vscode";
import * as fs from 'fs';
import { exec } from 'child_process';

import {
  rowIndexAtKey,
  toCamelCase,
  GoogleSheetRow,
  rowIndexAtValue,
  ensureUniqueKey,
} from "./utils";
// eslint-disable-next-line @typescript-eslint/naming-convention
const { GoogleSpreadsheet } = require("google-spreadsheet");

const IMPORT_STRING = `import 'package:${vscode.workspace.getConfiguration().get("flutteri18n.projectName")}/generated/l10n.dart';`;
const PREFIX = `S.of(context)`;

export async function activate(context: vscode.ExtensionContext) {
  const env = vscode.workspace.getConfiguration();

  const SHEET_ID = env.get("flutteri18n.sheetId");
  const EMAIL = env.get("flutteri18n.email");
  const PRIVATE_KEY = env.get("flutteri18n.privateKey");
  const LANGUAGES: string[] = env.get('flutteri18n.languages') || [];
  const USE_FVM: boolean = env.get("flutteri18n.useFvm") || false;

  const doc = new GoogleSpreadsheet(SHEET_ID);

  await doc.useServiceAccountAuth({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    client_email: EMAIL,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    private_key: PRIVATE_KEY,
  });

  await doc.loadInfo();
  const sheet = doc.sheetsByIndex[0];

  let exportDisposable = vscode.commands.registerCommand(
    "flutter-locale-gsheet.FlutterLocaleGSheetExport",
    () => generateArb()
  );

  let disposable = vscode.commands.registerCommand(
    "flutter-locale-gsheet.FlutterLocaleGSheet",
    async () => {
      const editor = vscode.window.activeTextEditor;

      if (editor) {
        const document = editor.document;
        let selection = editor.selection;

        editor.selection.start;

        if (editor.selection.end.compareTo(editor.selection.start) === 0) {

          var i = editor.selection.start.character;
          var line = editor.selection.start.line;

          var s = null;
          var e = null;
          while (s === null) {
            const char = editor.document.getText(new vscode.Range(new vscode.Position(line, i), new vscode.Position(line, i + 1)));
            if (char === '"' || char === "'") {
              s = i;
            }
            i--;

          }

          var i = editor.selection.start.character;
          while (e === null) {
            const char = editor.document.getText(new vscode.Range(new vscode.Position(line, i), new vscode.Position(line, i + 1)));
            if (char === '"' || char === "'") {
              e = i;
            }
            i++;

          }

          if (s !== null && e !== null) {
            selection = new vscode.Selection(new vscode.Position(line, s), new vscode.Position(line, e + 1));
          }

        }

        let value = document.getText(selection);

        let key = toCamelCase(value);
        if (key.length > 24) {
          key = key.substring(0, 24);
        }

        value = value
          .replace(/^'/, "")
          .replace(/^"/, "")
          .replace(/'\s*$/, "")
          .replace(/"\s*$/, "");

        const options: vscode.InputBoxOptions = {
          ignoreFocusOut: true,
          placeHolder: "myKeyGoesHere",
          prompt: "Choose Key for Translation",
          value: key,
        };

        vscode.window.showInputBox(options).then(async (newKey) => {
          if (!newKey) {
            vscode.window.showErrorMessage("Translation Key Required.");
            return;
          }

          const rows: GoogleSheetRow[] = await sheet.getRows();
          let updateGoogleSheet = true;

          const existingKeyIndex = rowIndexAtKey(rows, newKey);
          if (existingKeyIndex >= 0) {
            if (rows[existingKeyIndex].en === value) {
              updateGoogleSheet = false;
            } else {
              newKey = ensureUniqueKey(rows, newKey);
            }
          }

          const existingValueIndex = rowIndexAtValue(rows, value);

          if (existingValueIndex >= 0) {
            newKey = rows[existingValueIndex].key;
            updateGoogleSheet = false;
          }

          if (updateGoogleSheet) {
            const rowNumber = rows.length + 2; // accounting for header + the new row we are making

            const columns: any = {};
            for (const l of LANGUAGES) {
              columns[l] = l === LANGUAGES[0] ? value : `=GOOGLETRANSLATE(B${rowNumber}, "en", "${l}")`;
            }

            const row = {
              key: newKey,
              ...columns,
            };

            await sheet.addRow(row);
          }

          const replacement = `${PREFIX}.${newKey}`;

          editor.edit((editBuilder) => {
            const position = new vscode.Position(0, 0);

            const lines = editor.document.getText();
            if (!lines.includes(IMPORT_STRING)) {
              editBuilder.insert(position, `${IMPORT_STRING}\n`);
            }
            editBuilder.replace(selection, replacement);
          });

          generateArb();

        });
      }
    }
  );

  context.subscriptions.push(disposable);
  context.subscriptions.push(exportDisposable);
}

export async function generateArb() {
  const env = vscode.workspace.getConfiguration();

  const SHEET_ID = env.get("flutteri18n.sheetId");
  const EMAIL = env.get("flutteri18n.email");
  const PRIVATE_KEY = env.get("flutteri18n.privateKey");
  const LANGUAGES: string[] = env.get('flutteri18n.languages') || [];
  const USE_FVM: boolean = env.get("flutteri18n.useFvm") || false;



  const outputs: any = {};

  const doc = new GoogleSpreadsheet(SHEET_ID);

  await doc.useServiceAccountAuth({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    client_email: EMAIL,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    private_key: PRIVATE_KEY,
  });

  await doc.loadInfo();
  const sheet = doc.sheetsByIndex[0];
  const rows = await sheet.getRows();

  for (let i = 0; i < rows.length; i++) {

    const row = rows[i];
    const key = row.key;
    for (let l of LANGUAGES) {
      if (!outputs[l]) {
        outputs[l] = {};
      }

      outputs[l][key] = row[l];
    }
  }


  const PROJECT_PATH = env.get('flutteri18n.projectPath');

  for (let [key, value] of Object.entries(outputs)) {
    const outputPath = `${PROJECT_PATH}lib/l10n/intl_${key}.arb`;
    const json = JSON.stringify(value);

    fs.writeFileSync(outputPath, json, "utf8");

  }

  const cmd = `cd ${PROJECT_PATH} && ${USE_FVM ? 'fvm ' : ''}flutter pub run intl_utils:generate`;
  exec(cmd);
}

export function deactivate() { }
