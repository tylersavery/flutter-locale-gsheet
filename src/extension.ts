import * as vscode from "vscode";
import { google } from "./config/google";
import {
  rowIndexAtKey,
  toCamelCase,
  GoogleSheetRow,
  rowIndexAtValue,
  ensureUniqueKey,
} from "./utils";
// eslint-disable-next-line @typescript-eslint/naming-convention
const { GoogleSpreadsheet } = require("google-spreadsheet");

const IMPORT_STRING = `import 'package:flutter_gen/gen_l10n/app_localizations.dart';`;
const PREFIX = `AppLocalizations.of(context)`;

export async function activate(context: vscode.ExtensionContext) {
  const env = vscode.workspace.getConfiguration("flutteri18n");

  const SHEET_ID = env.get("sheetId");
  const EMAIL = env.get("email");
  const PRIVATE_KEY = env.get("privateKey");

  const doc = new GoogleSpreadsheet(SHEET_ID); //TODO: make dynamic

  // const config = vscode.workspace.getConfiguration(
  //   "theyoungastronauts.flutter-locale-gsheet"
  // );
  // console.log(
  //   config.get("theyoungastronauts.flutter-locale-gsheet.google.sheetId")
  // );

  await doc.useServiceAccountAuth({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    client_email: EMAIL, //TODO: make dynamic
    // eslint-disable-next-line @typescript-eslint/naming-convention
    private_key: PRIVATE_KEY, //TODO: make dynamic
  });

  await doc.loadInfo();
  const sheet = doc.sheetsByIndex[0];

  let disposable = vscode.commands.registerCommand(
    "flutter-locale-gsheet.FlutterLocaleGSheet",
    async () => {
      const editor = vscode.window.activeTextEditor;

      if (editor) {
        const document = editor.document;
        const selection = editor.selection;

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
            const translateValue = `=GOOGLETRANSLATE(B${rowNumber}, "en", "es")`;
            await sheet.addRow({
              key: newKey,
              en: value,
              es: translateValue,
            });
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
        });
      }
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}
