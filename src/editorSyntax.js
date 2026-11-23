// Use the same installed TextMate grammars and theme rules as the result preview.
async function tokenizeEditor(syntax, file, language, text, cancelled = () => false) {
  const grammar = await syntax.grammarFor(file, language);
  if (!grammar || cancelled()) return [];
  const spans = [];
  let state = null, offset = 0, number = 0;
  for (const line of text.split('\n')) {
    if (++number % 100 === 0) {
      await new Promise(resolve => setImmediate(resolve));
      if (cancelled()) return [];
    }
    const result = syntax.tokenize(grammar, line, state); state = result.state;
    for (const span of result.spans) {
      if (span.end > span.start && (span.color || span.italic || span.bold || span.underline || span.strike)) spans.push({...span,start:offset+span.start,end:offset+span.end});
    }
    offset += line.length + 1;
    if (spans.length > 100000) break;
  }
  return cancelled() ? [] : spans;
}
module.exports = {tokenizeEditor};
