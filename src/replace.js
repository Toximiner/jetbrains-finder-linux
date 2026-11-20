// Replacement planning is pure: no file is changed until the reviewed plan is applied.
function expandReplacement(template, match, line) {
  return template.replace(/\$(\$|&|`|'|\d{1,2}|<[^>]*>)/g, (token, key) => {
    if (key === '$') return '$';
    if (key === '&') return match[0];
    if (key === '`') return line.slice(0, match.index);
    if (key === "'") return line.slice(match.index + match[0].length);
    if (key[0] === '<') return match.groups ? (match.groups[key.slice(1, -1)] ?? '') : token;
    const n = Number(key);
    if (n > 0 && n < match.length) return match[n] ?? '';
    const first = Number(key[0]);
    if (key.length === 2 && first > 0 && first < match.length) return (match[first] ?? '') + key[1];
    return token;
  });
}

function replacementFor(item, options, replacement) {
  if (!options.regex) return replacement;
  let regex;
  try { regex = new RegExp(options.query, `gu${options.caseSensitive ? '' : 'i'}`); }
  catch { throw new Error('This regular expression is not supported for replacement by JavaScript.'); }
  let match;
  while ((match = regex.exec(item.text))) {
    if (match.index === item.start && match.index + match[0].length === item.end) {
      return expandReplacement(replacement, match, item.text);
    }
    if (!match[0].length) {
      const point = item.text.codePointAt(regex.lastIndex);
      regex.lastIndex += point > 0xffff ? 2 : 1;
    }
  }
  throw new Error('The search expression and JavaScript disagree on this match. Search again with a compatible expression.');
}

function planFile(text, items, options, replacement) {
  const lines = text.split('\n').map(line => line.replace(/\r$/, ''));
  const edits = [], seen = new Set();
  for (const item of items) {
    const key = `${item.line}:${item.start}:${item.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (lines[item.line] !== item.text || item.start < 0 || item.end < item.start || item.end > item.text.length) {
      throw new Error('A file changed since the search. Search again before replacing.');
    }
    edits.push({ line:item.line, start:item.start, end:item.end, text:replacementFor(item, options, replacement) });
  }
  edits.sort((a,b) => a.line-b.line || a.start-b.start || a.end-b.end);
  for (let i=1; i<edits.length; i++) {
    if (edits[i].line === edits[i-1].line && edits[i].start < edits[i-1].end) throw new Error('Overlapping matches cannot be replaced together.');
  }
  const preview = [];
  for (const line of new Set(edits.map(edit => edit.line))) {
    let after = lines[line];
    for (const edit of edits.filter(edit => edit.line === line).reverse()) after = after.slice(0,edit.start)+edit.text+after.slice(edit.end);
    preview.push({ line:line+1, before:lines[line], after });
  }
  return { edits, preview };
}
module.exports = { planFile, replacementFor, expandReplacement };
