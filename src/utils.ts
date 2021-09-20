import * as vscode from "vscode";
import * as escapeStringRegexp from "escape-string-regexp";
const balanced = require("balanced-match");

export function toCamelCase(str: string) {
  if (!str) {
    return "";
  }
  var arr = str.match(/[a-z]+|\d+/gi);
  if (!arr) {
    return "";
  }

  return arr
    .map((m, i) => {
      let low = m.toLowerCase();
      if (i !== 0) {
        low = low
          .split("")
          .map((s, k) => (k === 0 ? s.toUpperCase() : s))
          .join(``);
      }
      return low;
    })
    .join(``);
}

export function findNextMatch(
  editor: vscode.TextEditor,
  selection: vscode.Selection,
  input: string,
  numParentBrackets: number
) {
  let lastIndex: number | null = null;
  let currentLineNum = selection.active.line;
  let lineNum: number;
  for (
    lineNum = currentLineNum;
    lineNum <= editor.document.lineCount;
    lineNum++
  ) {
    lastIndex = null;

    let lineText = editor.document.lineAt(lineNum).text;
    let regex = new RegExp(escapeStringRegexp(input), "g");

    while (regex.exec(lineText) !== null) {
      if (lineNum === currentLineNum) {
        if (regex.lastIndex <= selection.active.character) {
          continue;
        }
      }

      lastIndex = regex.lastIndex;

      --numParentBrackets;

      if (numParentBrackets < 1) {
        break;
      }
    }

    if (lastIndex) {
      if (numParentBrackets < 1) {
        break;
      }
    }
  }

  if (lastIndex) {
    return {
      lineNum: lineNum,
      charIndex: lastIndex,
    };
  }

  return null;
}

export function findPrevMatch(
  editor: vscode.TextEditor,
  selection: vscode.Selection,
  input: string,
  numParentBrackets: number
) {
  let lastIndex: number | null = null;
  let currentLineNum = selection.active.line;
  let lineNum: number;
  let lineLength = 0;
  for (lineNum = currentLineNum; lineNum >= 0; lineNum--) {
    lastIndex = null;
    let lineText = editor.document.lineAt(lineNum).text;
    lineLength = editor.document.lineAt(lineNum).range.end.character;
    let regex = new RegExp(escapeStringRegexp(input), "g");

    lineText = lineText.split("").reverse().join("");

    while (regex.exec(lineText) !== null) {
      if (lineNum === currentLineNum) {
        if (regex.lastIndex <= lineLength - selection.active.character) {
          continue;
        }
      }

      lastIndex = regex.lastIndex;

      --numParentBrackets;

      if (numParentBrackets < 1) {
        break;
      }
    }

    if (lastIndex) {
      if (numParentBrackets < 1) {
        break;
      }
    }
  }

  if (lastIndex) {
    return {
      lineNum: lineNum,
      charIndex: lineLength - lastIndex + 1,
    };
  }

  return null;
}

type HitMatch = {
  startPos: vscode.Position;
  endPos: vscode.Position;
  fromBottomCount: number;
} | null;

function getHit(
  findPrev: string,
  findNext: string,
  text: string,
  hitLengthOriginal: number,
  offsetOriginal: number,
  editor: vscode.TextEditor,
  depth: number,
  maxDepth: number
): HitMatch {
  let hit;
  let hitLength = hitLengthOriginal;
  let active = editor.selection.active;

  let offset = 0;
  if (offsetOriginal) {
    offset = offsetOriginal;
  }

  while ((hit = balanced(findPrev, findNext, text))) {
    offset += 1;
    let startPos = editor.document.positionAt(hit.start + hitLength + offset);
    let endPos = editor.document.positionAt(hit.end + hitLength + offset);
    if (
      active.isAfterOrEqual(startPos) &&
      active.isBeforeOrEqual(endPos.translate(0, -1))
    ) {
      let bodyMatch = getHit(
        findPrev,
        findNext,
        hit.body,
        hit.pre.length + hitLength,
        offset,
        editor,
        depth + 1,
        maxDepth
      );

      let fromBottomCount = 1;
      if (bodyMatch) {
        if (bodyMatch.fromBottomCount >= maxDepth) {
          return bodyMatch;
        }

        fromBottomCount += 1;
      }

      return {
        startPos: startPos,
        endPos: endPos,
        fromBottomCount: fromBottomCount,
      };
    }

    hitLength += hit.end;
    text = hit.post;
  }

  return null;
}

export interface GoogleSheetRow {
  key: string;
  en: string;
  es: string;
}

export function rowIndexAtKey(rows: GoogleSheetRow[], key?: string) {
  for (const [i, value] of rows.entries()) {
    if (value.key === key) {
      return i;
    }
  }

  return -1;
}

export function rowIndexAtValue(rows: GoogleSheetRow[], str?: string) {
  for (const [i, value] of rows.entries()) {
    if (value.en === str) {
      return i;
    }
  }

  return -1;
}

export function ensureUniqueKey(
  rows: GoogleSheetRow[],
  key?: string,
  i: number = 1
): any {
  let lookup = key;
  if (i !== 1) {
    lookup = `${key}${i}`;
  }

  if (rowIndexAtKey(rows, lookup) >= 0) {
    return ensureUniqueKey(rows, key, i + 1);
  }

  if (i === 1) {
    return key;
  }

  return `${key}${i}`;
}
